# ArogyaAI — Phase 4 Target Model & Migration Plan

> Written before implementation. Defines the target schema, the patient↔account
> linking decision, and a **non-destructive** migration strategy.

---

## 1. Old schema (verified in `PHASE_4_DATA_AUDIT.md`)

```
users/{uid}          email, role, clinicId
patients/{autoId}    name, age, gender, dosha, symptoms, diagnosis, confidence, clinicId, createdAt
                     ^ ONE DOCUMENT PER DIAGNOSIS — a clinical event stored as a person
patient_logs/{autoId} userId, email, symptoms, clinicId, createdAt
```

Defects: no stable identity, no practitioner attribution, no assessment history,
patient cannot read their own data.

## 2. New schema

```
clinics/{clinicId}
    name, ownerUid, status, createdAt

users/{uid}
    email, role, clinicId, patientId?, createdAt
    patientId present only for role == "patient"; it links the account to a patient record.

patients/{patientId}
    clinicId, name, age, gender, dosha, email?, createdBy, createdAt, updatedAt
    ← IDENTITY. One document per person per clinic. No symptoms, no diagnosis.

patients/{patientId}/assessments/{assessmentId}
    clinicId, symptoms, age, gender, dosha,
    prediction, mlPrediction, confidence,
    aiReport, mlModelVersion, createdBy, createdAt
    ← CLINICAL EVENT. One document per consultation.

patient_logs/{logId}
    userId, patientId?, clinicId, symptoms, createdAt   (unchanged, append-only)
```

**Identity is not duplicated into assessments.** An assessment stores the
clinical *inputs* it was run against (age/gender/dosha at that moment) because
those are part of the prediction's provenance, not because they identify the
person. The person is `patients/{patientId}`.

### Why `patientId` is a clinician-generated code, not an auto-ID

The patient must be able to reach exactly their own record. Firestore rules
cannot express "find my record" (a query cannot be authorized by a condition the
query itself does not filter on), and an email-based link would require
`email_verified`, which unverified demo accounts do not have.

Instead the `patientId` **is the capability**: the clinician creates the patient,
sees its code, and shares it with that patient, who enters it once. The account
stores it in `users/{uid}.patientId`. The rule then reads:

```
allow read: if isDoctor() && resource.data.clinicId == myClinic();
allow read: if isSignedIn() && myPatientId() == patientId;
```

This is a deliberate capability model, stated plainly in `SECURITY.md`. It is
unguessable in practice, needs no email verification, and — unlike the current
name-substring match — it cannot return another person's data by accident.

## 3. Query ↔ rule compatibility (the constraint that shaped §2)

Firestore authorizes a **list** query only if the rule's conditions are
satisfiable from the query's own constraints. Therefore every collection query
must filter on the field the rule checks:

| Query | Filter | Rule it satisfies |
|---|---|---|
| doctor: patients | `where clinicId == myClinic` | `resource.data.clinicId == myClinic()` |
| doctor: assessments | `where clinicId == myClinic` | `resource.data.clinicId == myClinic()` |
| patient: own assessments | *no filter needed* — path-scoped | `myPatientId() == patientId` (path + `get()` only) |

The patient's assessment read is a **path-scoped** subcollection read
(`patients/{myId}/assessments`), so it needs no composite index and no filter.
This was checked against the running emulator before coding (§5 of this file's
verification), because a rule that protects a document but breaks its query is
exactly the failure the brief warns about.

## 4. Migration strategy

### A. Is existing data disposable?
There is **no data in this repository** — Firestore lives in the live project and
no credentials exist locally. Nothing can be migrated from here. **No migration
script will be run against the live project by this phase.** New writes use the
new model from ship date.

### B. Can `patients` be auto-migrated?
**No, not safely.** Legacy documents are one-per-diagnosis with identity copied
in. To convert them, a script must decide whether two rows with the same
name+age+gender are the *same person* (→ one patient, two assessments) or *two
people with a common name* (→ two patients). That is a **clinical-safety
decision** and guessing wrong silently fuses two patients' histories. The brief
forbids destroying data and forbids ambiguous automatic merges.

### C. Strategy chosen: **coexistence, not conversion**

| Data | Treatment |
|---|---|
| Existing `patients/*` docs | **Left untouched.** Never rewritten, never deleted. |
| New patients | Created in the new shape under `patients/{code}`. |
| New assessments | Written to the subcollection. |
| Legacy docs in the UI | **Not displayed** as patients. Doing so would require inferring identity, which is the unsafe operation in §B. |

Legacy documents remain readable via the Firebase console for inspection and
evidence. This is documented as a known limitation rather than hidden.

### D. Duplicate handling
None — automatic de-duplication is explicitly **not** attempted (see §B).

### E. Rollback
Rules and frontend change together in one commit. `git revert <sha>` restores the
previous rules and UI. Because nothing is deleted or rewritten, reverting cannot
lose data: legacy documents were never modified.

### F. Security implications
- Patients gain a *correct* read path (`myPatientId() == patientId`) that replaces
  the currently-denied name-substring attempt.
- Doctor access stays clinic-scoped and is re-derived from the caller's own
  `users/{uid}` document, so a tampered `clinicId` in a request fails closed.
- `clinicId` is **immutable** on both patients and assessments (`resource.data`
  vs `request.resource.data`), so a client cannot move a record between clinics.
- Assessments are **append-only** (update/delete denied), matching the existing
  treatment of `patient_logs`.

## 5. Data model decisions and their tradeoffs

| Decision | Alternative rejected | Why |
|---|---|---|
| Assessments as a subcollection | top-level `assessments` with `patientId` | subcollection makes "history of a patient" a path read; no composite index |
| `clinicId` denormalised onto each assessment | join through the parent patient | Firestore cannot join; the rule must be satisfiable from the queried document |
| `patientId` as capability code | email match | email match needs `email_verified`, breaking unverified demo accounts |
| Doctor keeps full clinic read of all patients | per-doctor ownership only | clinics are currently single-practitioner in practice; clinic scoping is the meaningful boundary |
| Legacy data left in place | convert | conversion is ambiguous and clinically unsafe (§B) |

## 6. Out of scope (per brief)

ML leakage, Gemini confidence contradiction, XAI, structured AI output,
appointments, billing, notifications, chat, rate limiting, backend clinic-awareness
(the backend has no Firestore credentials — restated as a gap in `SECURITY.md`).
