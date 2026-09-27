// All Firestore reads and writes for the clinical domain live here, so pages
// describe intent rather than SDK calls.
//
// Two invariants every function upholds:
//   * `clinicId` is taken from the authenticated profile, never from a form.
//   * `createdBy` is the authenticated uid, never a caller-supplied value.
// The security rules re-derive both from the caller's own users/{uid} document,
// so a tampered client fails closed rather than writing another clinic's data.
import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { AnalysisResult, Assessment, Patient, PatientLog } from "../types";

/** Below this ML confidence the system declines to name a condition. */
export const CONFIDENCE_THRESHOLD = 35;

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

function requireClinic(clinicId: string | undefined): string {
  if (!clinicId) {
    throw new DomainError(
      "Your account is not linked to a clinic. Please sign in again.",
    );
  }
  return clinicId;
}

// ---------------------------------------------------------------------------
// patients
// ---------------------------------------------------------------------------

export interface NewPatientInput {
  name: string;
  age?: string;
  gender?: string;
  dosha?: string;
  email?: string;
  /** Measurements are carried on the person so a returning patient does not
   *  have their height and weight retyped at every visit. */
  heightCm?: number;
  weightKg?: number;
}

/** Create a patient (a person). Returns the new stable patientId. */
export async function createPatient(
  clinicId: string,
  createdBy: string,
  input: NewPatientInput,
): Promise<string> {
  const clinic = requireClinic(clinicId);
  const name = input.name.trim();
  if (!name) throw new DomainError("Patient name is required.");

  const ref = await addDoc(collection(db, "patients"), {
    name,
    age: input.age?.trim() || "",
    gender: input.gender?.trim() || "",
    dosha: input.dosha?.trim() || "",
    email: input.email?.trim() || "",
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    clinicId: clinic,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Every patient belonging to the caller's clinic. */
export async function listPatients(clinicId: string): Promise<Patient[]> {
  const clinic = requireClinic(clinicId);
  const snap = await getDocs(
    query(collection(db, "patients"), where("clinicId", "==", clinic)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Patient, "id">) }))
    .sort(
      (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
    );
}

export async function getPatient(patientId: string): Promise<Patient | null> {
  const snap = await getDoc(doc(db, "patients", patientId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Patient, "id">) };
}

/** Update identity fields. The owning clinic is never changed. */
export async function updatePatient(
  patientId: string,
  changes: Partial<NewPatientInput>,
): Promise<void> {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const key of ["name", "age", "gender", "dosha", "email"] as const) {
    const value = changes[key];
    if (value !== undefined) payload[key] = value;
  }
  // Measurements are optional and only written when supplied, so a visit that
  // omits them does not blank the values recorded previously.
  if (changes.heightCm !== undefined) payload.heightCm = changes.heightCm;
  if (changes.weightKg !== undefined) payload.weightKg = changes.weightKg;
  if (payload.name === "") throw new DomainError("Patient name is required.");
  await setDoc(doc(db, "patients", patientId), payload, { merge: true });
}

// ---------------------------------------------------------------------------
// assessments
// ---------------------------------------------------------------------------

export interface NewAssessmentInput {
  symptoms: string;
  age?: string;
  gender?: string;
  dosha?: string;
  season?: string;
  weather?: string;
  foodHabits?: string;
  heightCm?: number;
  weightKg?: number;
  result: AnalysisResult;
}

/**
 * Record one clinical event under a patient.
 *
 * The stored prediction is replaced by a neutral label when the model's
 * confidence is below the threshold, so history never presents an unreliable
 * guess as a finding.
 *
 * `mlPrediction` must hold the model's RAW label, never the shown one. On the
 * low-confidence path the API returns that raw label separately as
 * `ml_prediction`; on the normal path `prediction` is already the raw label.
 * Writing `prediction` into `mlPrediction` (as this once did) silently recorded
 * a neutralised label as though it were the model's output.
 *
 * `explanation` is stored verbatim so the record is self-contained: it holds
 * the feature contributions computed at the time of the analysis, alongside the
 * confidence they belong to. Absent when the model produced none.
 */
export async function createAssessment(
  clinicId: string,
  createdBy: string,
  patientId: string,
  input: NewAssessmentInput,
): Promise<string> {
  const clinic = requireClinic(clinicId);
  if (!patientId) throw new DomainError("A patient must be selected first.");
  if (!input.symptoms.trim()) {
    throw new DomainError("Symptoms are required before saving an assessment.");
  }

  const lowConfidence = input.result.confidence < CONFIDENCE_THRESHOLD;
  const shownPrediction = lowConfidence
    ? "General Imbalance (Review Required)"
    : input.result.prediction;
  const rawModelLabel = input.result.ml_prediction ?? input.result.prediction;

  const record: Record<string, unknown> = {
    patientId,
    clinicId: clinic,
    symptoms: input.symptoms.trim(),
    age: input.age || "",
    gender: input.gender || "",
    dosha: input.dosha || "",
    season: input.season || "",
    weather: input.weather || "",
    foodHabits: input.foodHabits || "",
    heightCm: input.heightCm ?? null,
    weightKg: input.weightKg ?? null,
    prediction: shownPrediction,
    mlPrediction: rawModelLabel,
    confidence: input.result.confidence,
    // Named for what it actually holds. The UI heading calls it the Ayurvedic
    // analysis; the field is the generated recommendation text.
    aiReport: input.result.recommendation || "",
    createdBy,
    createdAt: serverTimestamp(),
  };
  if (input.result.explanation) {
    record.explanation = input.result.explanation;
  }

  const ref = await addDoc(
    collection(db, "patients", patientId, "assessments"),
    record,
  );
  return ref.id;
}

/**
 * A patient's assessment history, newest first.
 *
 * `clinicId` is REQUIRED, and the filter is not cosmetic. The assessments read
 * rule authorises a practitioner with
 * `isDoctor() && resource.data.clinicId == myClinic()`, and Firestore evaluates
 * a LIST query against that same rule — a query whose own constraints cannot
 * satisfy it is denied in full. So an unfiltered read of this subcollection
 * succeeds for the patient (whose branch, `ownsPatient(patientId)`, is
 * path-scoped and needs no field) but is denied for the practitioner.
 *
 * That asymmetry was a real defect: a practitioner could create a patient and
 * an assessment, then be refused the page showing them, with the message
 * "Could not load this patient record." Constraining the query by the patient's
 * own clinic satisfies the rule for both callers.
 */
export async function listPatientAssessments(
  clinicId: string,
  patientId: string,
): Promise<Assessment[]> {
  const clinic = requireClinic(clinicId);
  const snap = await getDocs(
    query(
      collection(db, "patients", patientId, "assessments"),
      where("clinicId", "==", clinic),
    ),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Assessment, "id">) }))
    .sort(
      (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
    );
}

/** Every assessment in the caller's clinic, newest first. */
export async function listClinicAssessments(
  clinicId: string,
): Promise<Assessment[]> {
  const clinic = requireClinic(clinicId);
  const snap = await getDocs(
    query(
      collectionGroup(db, "assessments"),
      where("clinicId", "==", clinic),
    ),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Assessment, "id">) }))
    .sort(
      (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
    );
}

// ---------------------------------------------------------------------------
// patient_logs
// ---------------------------------------------------------------------------

export async function createPatientLog(
  userId: string,
  email: string | null,
  clinicId: string,
  symptoms: string,
  patientId?: string,
): Promise<void> {
  const clinic = requireClinic(clinicId);
  await addDoc(collection(db, "patient_logs"), {
    userId,
    email: email ?? "",
    symptoms: symptoms.trim(),
    clinicId: clinic,
    patientId: patientId ?? "",
    createdAt: serverTimestamp(),
  });
}

/**
 * The signed-in account's own diary entries, newest first.
 *
 * Keyed on `userId`, NOT on `patientId`, deliberately. An account that has not
 * yet redeemed a patient code still owns every entry it wrote, and keying on the
 * link meant a patient's own words were hidden from them until a practitioner
 * handed over a code — which read as data loss. The read rule is satisfied by
 * this exact query (`resource.data.userId == uid()`), so no index is required.
 */
export async function listMyLogs(userId: string): Promise<PatientLog[]> {
  const snap = await getDocs(
    query(collection(db, "patient_logs"), where("userId", "==", userId)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientLog, "id">) }))
    .sort(
      (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
    );
}

/**
 * One patient's diary entries, newest first, for a practitioner reviewing them.
 *
 * Both filters are required, and for two different reasons:
 *   * `clinicId` is what the read rule checks for a practitioner, so a query
 *     without it is denied in full (the same query-compatibility rule that bit
 *     the assessments subcollection).
 *   * `patientId` narrows it to the patient being viewed.
 * The pair needs a composite index; it is declared in firestore.indexes.json.
 */
export async function listPatientLogs(
  clinicId: string,
  patientId: string,
): Promise<PatientLog[]> {
  const clinic = requireClinic(clinicId);
  const snap = await getDocs(
    query(
      collection(db, "patient_logs"),
      where("clinicId", "==", clinic),
      where("patientId", "==", patientId),
    ),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientLog, "id">) }))
    .sort(
      (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
    );
}

export async function listClinicLogs(clinicId: string): Promise<PatientLog[]> {
  const clinic = requireClinic(clinicId);
  const snap = await getDocs(
    query(collection(db, "patient_logs"), where("clinicId", "==", clinic)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientLog, "id">) }))
    .sort(
      (a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0),
    );
}

// ---------------------------------------------------------------------------
// account <-> patient link
// ---------------------------------------------------------------------------

/**
 * Redeem a clinician-issued patient code, linking this account to that record.
 * Passing an empty string unlinks. The rules verify the target exists and
 * belongs to the account's own clinic.
 *
 * The code is the `patients/{patientId}` DOCUMENT ID, and Firestore document
 * IDs are case-sensitive. It must therefore be passed through unchanged.
 *
 * This previously called `.toUpperCase()` on it, which is right for a clinic ID
 * or an invite code (both are stored uppercase by construction) but wrong here:
 * a patient ID is an auto-generated mixed-case string, so uppercasing turned a
 * valid code into an ID that does not exist. The rules' `exists()` check then
 * failed and every link attempt was refused — a patient could not link their
 * own record with a perfectly correct code, and the error blamed the code.
 */
export async function linkPatientAccount(
  uid: string,
  patientCode: string,
): Promise<void> {
  const code = patientCode.trim();
  await setDoc(doc(db, "users", uid), { patientId: code }, { merge: true });
}
