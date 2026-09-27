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
  updateDoc,
  deleteDoc,
  deleteField,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type {
  AnalysisResult,
  Assessment,
  AuditLogEntry,
  Clinic,
  Patient,
  PatientLog,
  UserData,
} from "../types";

/** An account profile with its document id, as the admin panel lists it. */
export interface UserDataWithId extends UserData {
  id: string;
}

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

/**
 * One assessment by its id, scoped to a patient the caller may read.
 *
 * The path carries the patient id as well as the assessment id, and both come
 * from the caller's own linked record rather than a route parameter, so this
 * cannot be pointed at another patient's history. A missing document returns
 * null — the caller renders "not found" rather than treating it as an error.
 */
export async function getAssessment(
  patientId: string,
  assessmentId: string,
): Promise<Assessment | null> {
  if (!patientId || !assessmentId) return null;
  const snap = await getDoc(
    doc(db, "patients", patientId, "assessments", assessmentId),
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Assessment, "id">) };
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

export interface NewLogInput {
  severity?: number;
  tags?: string[];
  onset?: string;
}

export async function createPatientLog(
  userId: string,
  email: string | null,
  clinicId: string,
  symptoms: string,
  patientId?: string,
  extra: NewLogInput = {},
): Promise<string> {
  const clinic = requireClinic(clinicId);
  const record: Record<string, unknown> = {
    userId,
    email: email ?? "",
    symptoms: symptoms.trim(),
    clinicId: clinic,
    patientId: patientId ?? "",
    createdAt: serverTimestamp(),
  };
  if (extra.severity) record.severity = extra.severity;
  if (extra.tags && extra.tags.length > 0) record.tags = extra.tags;
  if (extra.onset) record.onset = extra.onset;

  const ref = await addDoc(collection(db, "patient_logs"), record);
  return ref.id;
}

/**
 * Edit one of the caller's OWN diary entries.
 *
 * The rules confine this to the entry's author and to the content fields — the
 * entry cannot be reassigned to another account, moved to another clinic, or
 * re-dated into the past. `updatedAt` is written so an edit is visible rather
 * than silent.
 */
export async function updateMyLog(
  logId: string,
  changes: { symptoms: string; severity?: number; tags?: string[]; onset?: string },
): Promise<void> {
  if (!changes.symptoms.trim()) {
    throw new DomainError("An entry cannot be saved empty.");
  }
  const update: Record<string, unknown> = {
    symptoms: changes.symptoms.trim(),
    updatedAt: serverTimestamp(),
  };
  // Absent values are written as empty rather than left stale, so clearing a
  // severity or a tag actually removes it from the entry.
  update.severity = changes.severity ?? deleteField();
  update.tags = changes.tags && changes.tags.length > 0 ? changes.tags : deleteField();
  update.onset = changes.onset || deleteField();

  await updateDoc(doc(db, "patient_logs", logId), update);
}

/** Remove one of the caller's OWN diary entries. The rules permit this only for
 *  the author; a clinic practitioner cannot delete a patient's entry. */
export async function deleteMyLog(logId: string): Promise<void> {
  await deleteDoc(doc(db, "patient_logs", logId));
}

/**
 * Attach one of the caller's own diary entries to the patient record their
 * account is linked to.
 *
 * Entries written before the link exists carry no `patientId`. That leaves them
 * stranded: they appear in the clinic diary, but a practitioner opening one for
 * analysis has no patient to load, and the entry never reaches the patient's own
 * history. The rules permit exactly this one change — the affected field — and
 * pin the value to the writer's own linked record, so this cannot be used to
 * move an entry to another patient.
 */
export async function attachLogToMyRecord(
  logId: string,
  patientId: string,
): Promise<void> {
  if (!patientId) {
    throw new DomainError(
      "Link your account to a health record first, then attach your entries.",
    );
  }
  await updateDoc(doc(db, "patient_logs", logId), { patientId });
}

/**
 * Attach every stranded diary entry the caller owns to their linked record.
 *
 * Run when a patient redeems their patient code. Until then their earlier
 * entries have no patient, so a practitioner cannot open them for analysis and
 * they never appear in the patient's own history — the entries exist but are
 * unusable, which reads as data loss to both sides.
 *
 * Best-effort by design: linking must still succeed if an attachment fails, so
 * a failure here is logged and reported as a count rather than thrown. Returns
 * how many entries were attached.
 */
export async function attachMyOrphanedLogs(
  userId: string,
  patientId: string,
): Promise<number> {
  if (!patientId) return 0;
  const logs = await listMyLogs(userId);
  const orphaned = logs.filter((log) => !log.patientId);
  let attached = 0;
  for (const log of orphaned) {
    try {
      await updateDoc(doc(db, "patient_logs", log.id), { patientId });
      attached += 1;
    } catch (e) {
      console.error("Could not attach diary entry", log.id, e);
    }
  }
  return attached;
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
// admin — account management only
// ---------------------------------------------------------------------------

/** Every account profile. Admin-only by rule; the query needs no extra filter. */
export async function listAllUsers(): Promise<UserDataWithId[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<UserDataWithId, "id">) }))
    .sort((a, b) => (a.email || "").localeCompare(b.email || ""));
}

/** Accounts awaiting an approval decision. Admin-only by rule. */
export async function listPendingDoctors(): Promise<UserDataWithId[]> {
  const all = await listAllUsers();
  return all.filter((u) => u.role === "doctor" && (u as UserDataWithId).status === "pending");
}

/** The administrator performing an audited action: their uid and email. */
export interface AuditActor {
  uid: string;
  email: string;
}

/**
 * Append one administrative action to the audit trail.
 *
 * Written from the admin's own client, so this is an accountability record
 * rather than a tamper-proof one — an operator who bypassed the app could
 * write whatever they liked. It is what an audit of the PRODUCT asks for, and
 * the rules still constrain it (admin-only, actor must be the caller,
 * append-only). A hardened deployment would move this server-side.
 *
 * A failure here must not fail the action it describes: the role change has
 * already been applied, and reporting an error the operator cannot act on
 * would be worse than a missing log line. So this is best-effort and logs to
 * the console on failure.
 */
async function writeAudit(actor: AuditActor, entry: {
  action: string;
  summary: string;
  targetId: string;
  targetLabel?: string;
  before?: Record<string, string>;
  after?: Record<string, string>;
}): Promise<void> {
  try {
    await addDoc(collection(db, "audit_logs"), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: entry.action,
      summary: entry.summary,
      targetId: entry.targetId,
      targetLabel: entry.targetLabel ?? "",
      before: entry.before ?? {},
      after: entry.after ?? {},
      at: serverTimestamp(),
    });
  } catch (e) {
    console.error("Could not write the audit entry:", e);
  }
}

/** Every audit entry, newest first. Admin-only by rule. */
export async function listAuditLogs(): Promise<AuditLogEntry[]> {
  const snap = await getDocs(collection(db, "audit_logs"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, "id">) }))
    .sort((a, b) => (b.at?.toMillis() || 0) - (a.at?.toMillis() || 0));
}

/**
 * Correct an account's role, clinic, email or patient link. Admin-only by rule.
 *
 * `clinicId` and `patientId` accept null to REMOVE the field. An admin account
 * has neither: an operator belongs to no clinic and holds no patient record, so
 * the keys are absent rather than empty. The rules enforce this — an admin
 * document carrying a clinic or a link is refused — so promoting an account to
 * admin MUST clear both in the same write, which is why the panel sends null
 * for them. A patient or doctor always keeps a real clinic.
 *
 * `actor` is optional so the call sites that do not audit are not forced to
 * supply one. When present, the change is recorded.
 */
export async function adminUpdateUser(
  userId: string,
  changes: {
    role?: string;
    clinicId?: string | null;
    email?: string;
    patientId?: string | null;
    status?: "approved" | "pending" | "rejected";
  },
  actor?: AuditActor,
  context?: { targetLabel?: string; before?: Record<string, string> },
): Promise<void> {
  const payload: Record<string, unknown> = { ...changes };
  // null means "remove this field". deleteField() is the only way to unset a
  // key in Firestore; writing '' would leave a field that still exists.
  for (const key of ["clinicId", "patientId"] as const) {
    if (changes[key] === null) payload[key] = deleteField();
  }
  await updateDoc(doc(db, "users", userId), payload);
  if (!actor) return;
  const changed = Object.keys(changes).filter(
    (k) => changes[k as keyof typeof changes] !== undefined,
  );
  await writeAudit(actor, {
    action: "update-account",
    summary: `Updated ${changed.join(", ")} on ${context?.targetLabel || userId}.`,
    targetId: userId,
    targetLabel: context?.targetLabel,
    before: context?.before,
    after: Object.fromEntries(
      changed.map((k) => [
        k,
        changes[k as keyof typeof changes] === null
          ? "(none)"
          : String(changes[k as keyof typeof changes]),
      ]),
    ),
  });
}

/**
 * Approve or reject a pending practitioner. Admin-only by rule; the rules
 * confine status to the known states, so an invalid value is refused there.
 */
export async function setDoctorStatus(
  userId: string,
  status: "approved" | "pending" | "rejected",
  actor?: AuditActor,
  context?: { targetLabel?: string },
): Promise<void> {
  await updateDoc(doc(db, "users", userId), { status });
  if (!actor) return;
  await writeAudit(actor, {
    action: `status-${status}`,
    summary: `${status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Set pending"} ${context?.targetLabel || userId}.`,
    targetId: userId,
    targetLabel: context?.targetLabel,
    after: { status },
  });
}

// ---------------------------------------------------------------------------
// clinics
// ---------------------------------------------------------------------------

/** The clinic's organisational details, or null when none are recorded yet. */
export async function getClinic(clinicId: string): Promise<Clinic | null> {
  const snap = await getDoc(doc(db, "clinics", clinicId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Clinic, "id">) };
}

/**
 * Record or correct a clinic's details.
 *
 * `createdBy` is sent ONLY on the first write, and that detail matters: the
 * rules require it to equal the caller's uid on create and pin it to its
 * existing value on update. A clinic is shared, so a SECOND practitioner of the
 * same clinic editing the address would otherwise send their own uid, fail the
 * pin, and be denied — the clinic's details would be editable only by whoever
 * registered first. Omitting it on an edit leaves it untouched and keeps the
 * affected-keys allowlist satisfied.
 */
export async function saveClinic(
  clinicId: string,
  createdBy: string,
  details: Omit<Clinic, "id" | "createdBy">,
): Promise<void> {
  const clinic = requireClinic(clinicId);
  if (!details.name?.trim()) {
    throw new DomainError("A clinic name is required.");
  }
  const ref = doc(db, "clinics", clinic);
  const existing = await getDoc(ref);
  const payload: Record<string, unknown> = {
    ...details,
    name: details.name.trim(),
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) payload.createdBy = createdBy;
  await setDoc(ref, payload, { merge: true });
}

/** Every clinic that has a details record. Admin-only by rule. */
export async function listClinics(): Promise<Clinic[]> {
  const snap = await getDocs(collection(db, "clinics"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Clinic, "id">) }));
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
 * or a clinic ID (stored uppercase by construction) but wrong here:
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
