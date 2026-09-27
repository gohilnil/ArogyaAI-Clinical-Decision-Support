// Shared domain types for the ArogyaAI frontend.

export interface FormData {
  name: string;
  age: string;
  gender: string;
  height: string;
  weight: string;
  dosha: string;
  season: string;
  symptoms: string;
  foodHabits: string;
  weather: string;
}

/** One term in the model's own score for the predicted condition.
 *  `contribution` is coefficient × feature value; positive pushed the model
 *  toward the condition, negative away. It is not a causal claim. */
export interface FeatureContribution {
  feature: string;
  group: "symptom" | "profile";
  input_value: string;
  contribution: number;
  direction: "supports" | "opposes";
}

/** The model's real per-feature contributions. Present only when the deployed
 *  estimator exposes coefficients (a linear model), so it is optional. */
export interface PredictExplanation {
  method: string;
  predicted_class: string;
  intercept: number;
  total_contribution: number;
  features: FeatureContribution[];
  note: string;
}

/** Exactly what POST /api/predict returns. Fields the API does not send must
 *  not appear here — a type that promises data the backend never provides is
 *  how dead UI gets built. */
export interface AnalysisResult {
  prediction: string;
  confidence: number;
  recommendation: string;
  /** The model's raw label, sent only when the confidence gate suppresses it. */
  ml_prediction?: string;
  explanation?: PredictExplanation;
}

export interface UserData {
  role: string;
  /** The clinic this account belongs to, or ABSENT for an administrator.
   *
   *  A patient or practitioner always carries one: `clinicId` is the tenancy
   *  boundary their clinical reads are scoped by, so an account without one
   *  would own records nothing could reach. An ADMIN is a platform operator —
   *  they work across every clinic and belong to none, so the field is not set
   *  on an admin document at all. Code that needs a clinic must therefore run
   *  under a role check, which the clinical pages already do. */
  clinicId?: string;
  email: string;
  /** Practitioner onboarding state. `pending` until an admin approves the
   *  account; `rejected` denies access. Absent on accounts created before the
   *  approval workflow existed, which the rules treat as approved. */
  status?: "pending" | "approved" | "rejected";
  /** Present only for a patient account that has redeemed a clinician-issued
   *  patient code. Links the account to exactly one patients/{patientId} doc. */
  patientId?: string;
}

/** A person. Stable identity — created once, reused for every later visit. */
export interface Patient {
  id: string;
  name: string;
  age?: string;
  gender?: string;
  dosha?: string;
  email?: string;
  /** Last recorded measurements. Optional: records created before these were
   *  stored simply have no value, and the form falls back to asking. */
  heightCm?: number;
  weightKg?: number;
  clinicId: string;
  createdBy?: string;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

/** One clinical event. The inputs an analysis ran on, its result, and the AI report. */
export interface Assessment {
  id: string;
  patientId: string;
  clinicId: string;
  symptoms: string;
  age?: string;
  gender?: string;
  dosha?: string;
  season?: string;
  weather?: string;
  foodHabits?: string;
  heightCm?: number;
  weightKg?: number;
  /** What the clinician is shown. Replaced by a neutral label below threshold. */
  prediction: string;
  /** The model's raw label, kept even when the confidence gate suppresses it. */
  mlPrediction?: string;
  confidence: number;
  /** Ayurvedic contextual analysis, stored verbatim. */
  aiReport?: string;
  /** The model's per-feature contributions as computed when this assessment
   *  ran. Stored with the event so the history shows the analysis that
   *  actually produced the result, not a recomputation against a later model.
   *  Absent on assessments written before this field existed. */
  explanation?: PredictExplanation;
  createdBy?: string;
  createdAt?: FirestoreTimestamp;
}

export interface PatientLog {
  id: string;
  userId?: string;
  patientId?: string;
  email?: string;
  symptoms?: string;
  clinicId?: string;
  createdAt?: FirestoreTimestamp;
}

/** Minimal shape of a Firestore Timestamp, so pages can sort without the SDK type. */
export interface FirestoreTimestamp {
  toMillis: () => number;
  toDate: () => Date;
}

/** One administrative action, as recorded in `audit_logs`.
 *
 *  This is an accountability trail written by the admin's own client, not a
 *  tamper-proof server log — an operator who bypassed the app could write
 *  whatever they liked. It records what was done THROUGH the product, which is
 *  what an audit of the product asks for. See the rules for the constraints
 *  that are enforced (admin-only, actor must be the caller, append-only). */
export interface AuditLogEntry {
  id: string;
  /** The administrator who performed the action. */
  actorUid: string;
  actorEmail: string;
  /** A short machine-readable verb, e.g. "approve-doctor", "update-account". */
  action: string;
  /** Human-readable summary shown in the log. */
  summary: string;
  /** The account or entity acted upon. */
  targetId: string;
  targetLabel?: string;
  /** Values before and after, for changes that overwrite something. */
  before?: Record<string, string>;
  after?: Record<string, string>;
  at?: FirestoreTimestamp;
}

/** Organisational details of a clinic. The document id IS the clinic ID that
 *  accounts carry, so there is no separate link to keep in step. */
export interface Clinic {
  id: string;
  name: string;
  type?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  registrationNo?: string;
  notes?: string;
  createdBy?: string;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}
