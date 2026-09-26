# ArogyaAI — Phase 4 Data Audit

> Read-only inspection of every path that touches Firestore, performed before
> any change. Findings marked **[VERIFIED]** were confirmed by running the
> Firestore emulator against the actual rules and the exact query patterns the
> UI issues today. Nothing was modified to produce this document.

---

## 1. Current collections

| Collection | Written by | Read by | Document shape |
|---|---|---|---|
| `users/{uid}` | LoginPage (registration) | `useAuth`, LoginPage | `email`, `role`, `clinicId` |
| `patients/{autoId}` | DiagnosePage `saveToCloud` | DashboardPage, PatientsPage, PatientHomePage | `name`, `age`, `gender`, `dosha`, `symptoms`, `diagnosis`, `confidence`, `clinicId`, `createdAt` |
| `patient_logs/{autoId}` | PatientCheckupPage | PatientsPage (doctor), PatientCheckupPage | `userId`, `email`, `symptoms`, `clinicId`, `createdAt` |
| `invites/{code}` | manual (console/admin) | LoginPage | `used`, `clinicId` |

**The backend never touches Firestore. [VERIFIED]** `grep` across `backend/` and
`arogya_predict.py` finds no `firestore` / `firebase_admin` usage. The backend is
a stateless ML + Gemini service; **every** read and write is performed by the
browser via the Firebase SDK. This is the single most important fact in this
audit, because it means all authorization runs through Firestore rules and the
client must supply every value the rules check.

---

## 2. Every write path

| # | Location | Operation | Payload |
|---|---|---|---|
| W1 | `DiagnosePage.tsx:188` | `addDoc(collection(db,"patients"))` | name, age, gender, dosha, symptoms, **diagnosis**, **confidence**, clinicId, createdAt |
| W2 | `PatientsPage.tsx:25` (patient logger) | `addDoc(collection(db,"patient_logs"))` | userId, email, symptoms, clinicId, createdAt |
| W3 | `LoginPage.tsx:84/94` | `setDoc(doc(db,"users",uid))` | email, role, clinicId (+inviteCode for doctor) |
| W4 | `LoginPage.tsx:90` | `updateDoc(doc(db,"invites",code))` | `{used:true}` |

**W1 is the defect at the heart of Phase 4.** A diagnosis — a *clinical event* —
writes a *new patient document*. Patient identity fields (name, age, gender,
dosha) are copied into every diagnosis. A second visit by the same person
produces a second, unrelated document. There is no `patientId`, so there is
nothing that ties two visits together.

---

## 3. Every read path

| # | Location | Query | Purpose |
|---|---|---|---|
| R1 | `DashboardPage.tsx:29` | `patients where clinicId == mine` | doctor stats |
| R2 | `PatientsPage.tsx:48` | `patients where clinicId == mine` | doctor records table |
| R3 | `PatientsPage.tsx:63` | `patient_logs where clinicId == mine` | doctor diaries tab |
| R4 | `PatientHomePage.tsx:26` | `patients where clinicId == mine`, then **client-side name substring filter** | patient "my advice" |
| R5 | `PatientCheckupPage.tsx` | `patient_logs` (own doc on read) | patient diary |
| R6 | `useAuth.ts:20` | `getDoc(users/{uid})` | role + clinic for the session |

### R4 is broken twice over

1. **Semantically:** a patient's own records are found by matching their *email
   prefix* against the record's *name* field (`name.includes(patientName)`).
   "Ananya Sharma" vs email `ananya@x.test` happens to match; `a.sharma@…` would
   not. Any patient whose name is not a superset of their email prefix sees nothing.
2. **By authorization [VERIFIED]:** under the Phase 3 rules the patient cannot
   read `patients` at all. The emulator probe returns `permission-denied` for
   both the collection query and a direct document get by a patient. So R4 is
   **already dead code in production** — it fails before the fragile name match
   even runs.

Similarly, **R1–R3 are clinic-scoped and work for a doctor [VERIFIED]**, while a
doctor querying another clinic is correctly denied.

---

## 4. Query ↔ rules compatibility

This is where most Firestore designs break, so each pattern was tested against
the live rules in the emulator:

| Pattern | Result (emulator, current rules) |
|---|---|
| doctor: `patients where clinicId == own` | ✅ ALLOWED |
| doctor: `patients where clinicId == other` | ✅ DENIED |
| patient: `patients where clinicId == own` | ✅ **DENIED** |
| patient: direct `get patients/{id}` | ✅ **DENIED** |
| doctor: `patient_logs where clinicId == own` | ✅ ALLOWED |
| patient: own `patient_logs/{id}` | ✅ ALLOWED |

Firestore evaluates a *query* against the rule for each candidate document, so a
rule of the form `resource.data.clinicId == myClinic()` is compatible with a
query that **filters on `clinicId`**. This matters for Phase 4: the new
`assessments` subcollection rule must likewise be satisfiable by the exact query
the UI issues, or legitimate reads will fail. **Any query introduced in Phase 4
must be probed the same way before it is considered done.**

---

## 5. Identification and ownership today

| Concept | Mechanism today | Problem |
|---|---|---|
| Patient identity | none — name/age/gender copied per diagnosis | no stable id; duplicates guaranteed |
| Patient ↔ user link | email-prefix vs name substring | unreliable; and the read is denied anyway |
| Record ownership | `clinicId` string on the document | works for doctors; cannot express "this patient owns this record" |
| `clinicId` provenance | **client-supplied** (`userData.clinicId`) | rules re-derive it from the caller's profile, so a tampered value fails closed — but the API itself is not clinic-aware |
| Practitioner attribution | **absent** | no `createdBy`; cannot tell which doctor wrote a record |

---

## 6. Dashboard calculations (today)

`DashboardPage` computes, from `patients where clinicId == mine`:
- **AI Diagnostics Run** = number of diagnosis documents
- **Average ML Confidence** = mean of `confidence` where > 0
- **Dominant Clinic Dosha** = modal `dosha`

All three are real (no hardcoding), but they describe *diagnoses*, not
*patients*. Under the new model they must become patient- and assessment-based
counts, or the labels become misleading.

---

## 7. Patient-facing behaviour (today)

- **PatientCheckupPage:** writes a `patient_logs` entry (works; rule-correct).
- **PatientHomePage:** attempts R4, which is **denied by the rules today**, so a
  patient sees an empty "Recent Practitioner Advice" panel. This is not a
  regression from Phase 3 — the rule was correctly tightened and this call path
  was never updated. Phase 4 must give patients a *correct* read path.

---

## 8. Migration risk assessment

**Can existing data be migrated?** There is **no production data locally** and no
Firestore credentials, so the emulator is the only environment available. The
question is therefore about (a) the algorithm being correct and (b) not
destroying whatever exists in the live project.

Key risks:

| # | Risk | Severity |
|---|---|---|
| M1 | Legacy `patients` rows have no `patientId`; two rows may be the same person (same name+age+gender+clinic) or genuinely different people with a common name | **HIGH** — auto-merging can silently fuse two patients' histories, a clinical-safety error |
| M2 | `patients` documents are indistinguishable from `assessments` in the new model | MEDIUM — needs a deliberate mapping |
| M3 | A migrated assessment must keep its original `createdAt`, or history ordering becomes wrong | MEDIUM |
| M4 | Changing rules **before** migrating makes legacy docs unreadable to the UI | HIGH — ordering matters |
| M5 | Deleting or rewriting live documents is irreversible | **HIGH** |

**Decision: no destructive migration.** Per the brief, Phase 4 will not delete or
overwrite anything. Legacy documents stay exactly as they are and are handled by
a documented, reversible strategy (see `PHASE_4_MIGRATION_PLAN.md`). New writes
use the new model from the moment it ships.

---

## 9. Summary of defects Phase 4 must fix

1. No stable patient identity (W1).
2. A clinical event (assessment) is stored as a person (W1).
3. Patient cannot read their own history; the existing attempt is denied (R4/§4).
4. No practitioner attribution on records (`createdBy` absent).
5. Dashboard metrics describe diagnoses while the UI implies patients (§6).
6. `clinicId` is client-supplied with no server-side clinic awareness (§5).

## 10. Explicitly out of scope for Phase 4

Per the brief: ML leakage, the Gemini confidence contradiction, XAI, structured
AI output, appointments, billing, notifications, chat. Not touched here.
