# ArogyaAI — Phase 4 Report: Clinical Data Model

**Branch:** `feature/final-year-rebuild` · **Previous commit:** `9459def`
**Scope:** replace "one diagnosis → one patient document" with a patient identity
and a per-visit assessment history, plus the rules, UI and tests that go with it.
**Rule honoured:** no data deleted, no rules weakened, no migration claimed
without verification.

---

## 1. Files created (4)

| File | Purpose |
|---|---|
| `PHASE_4_DATA_AUDIT.md` | Every read path, write path and query, with emulator-verified rule compatibility |
| `PHASE_4_MIGRATION_PLAN.md` | Old→new schema, the patient-link decision, non-destructive migration strategy |
| `frontend/src/services/firestore.ts` | The only place pages touch Firestore; derives `clinicId`/`createdBy` from the authenticated user |
| `frontend/src/pages/PatientDetailPage.tsx` | A patient's profile + full assessment history, expandable reports |

## 2. Files modified (14)

`firestore.rules` · `frontend/src/types/index.ts` · `services/api` neighbours:
`DiagnosePage`, `PatientsPage`, `PatientHomePage`, `PatientCheckupPage`,
`DashboardPage`, `ProfilePage`, `AppShell` · docs: `README.md`,
`ARCHITECTURE_PLAN.md`, `SECURITY.md` · `tests/rules/firestore.rules.test.js`

## 3. Files deleted

**None.** No legacy document, file or collection was removed.

---

## 4. The audit's decisive finding

Before designing, I probed the **current** rules with the exact query patterns the
UI issues. Result:

```
ALLOWED | doctor  patients where clinicId == own
DENIED  | doctor  patients where clinicId == other
DENIED  | patient patients where clinicId == own   ← the patient "my records" path
DENIED  | patient direct get of a record doc
ALLOWED | doctor  patient_logs where clinicId == own
ALLOWED | patient own patient_logs/{id}
```

So the existing patient dashboard was **already dead code**: Phase 3's rules
correctly denied it, and nobody had noticed. Phase 4 replaces the fragile
email-prefix-vs-name match with a capability link that the rules can actually
authorize.

---

## 5. Schema implemented

```
users/{uid}                                     email, role, clinicId, patientId?
patients/{patientId}                            clinicId, name, age, gender, dosha,
                                                createdBy, createdAt, updatedAt    ← PERSON
patients/{patientId}/assessments/{assessmentId} patientId, clinicId, symptoms, inputs,
                                                prediction, mlPrediction, confidence,
                                                aiReport, createdBy, createdAt      ← EVENT
patient_logs/{logId}                            userId, patientId?, clinicId, symptoms, createdAt
```

Identity is **not** duplicated into assessments. An assessment stores the inputs
it ran against (age/gender/dosha at that moment) as provenance, not as a second
copy of the person.

**Not created:** `clinics`, `ai_reports`, `appointments`, `notifications` — no
behaviour attaches to them yet; empty collections are the appearance-complexity
trap the brief forbids.

## 6. How a patient reaches their own record

The rules cannot express "find my record", and email-based linking would need
`email_verified` (false for the demo's accounts). So the `patientId` **is a
capability**: the clinician creates the patient, sees the code, shares it, and
the patient redeems it once in Profile. The account stores it as
`users/{uid}.patientId`, and the rule grants read only where that stored value
equals the document id:

```
function ownsPatient(patientId) {
  return isPatient() && myPatientId() != '' && myPatientId() == patientId;
}
```

The link is guarded: it may only point at a patient that exists **and** belongs
to the account's own clinic (`validPatientLink`). This is documented as a
capability trade-off, not identity proof, in `SECURITY.md` §6.7.

## 7. Security changes

- Patients may now read exactly one record and its assessments — their own.
- Doctors remain clinic-scoped for patients **and** assessments, including via
  collection-group queries.
- Assessments are **append-only**; patients cannot be deleted.
- `clinicId` is immutable on patients and assessments; a client cannot move a
  record between clinics.
- A doctor cannot file an assessment under a mismatched `patientId`.

**A hole in my own first draft was caught by the tests**: the `users` create rule
did not validate `patientId`, so a patient could have self-linked to an arbitrary
code at registration. Fixed in the rule (`validPatientLink` on create), with a
test.

## 8. Tests executed

| Suite | Command | Result |
|---|---|---|
| Rules (emulator, real rules) | `cd tests/rules && node --test` | ✅ **54/54 pass** (was 29) |
| Backend (all) | `python -m unittest discover -s tests` | ✅ **32/32 pass** |
| TypeScript | `npx tsc -b` | ✅ exit 0 |
| Production build | `npm run build` | ✅ exit 0 |
| Backend startup | `uvicorn backend.main:app` | ✅ up in 4 s |
| Health / root | `curl` | ✅ 200, 399 diseases |
| `/api/predict` unauthenticated | `curl` | ✅ **401** (Phase 3 control intact) |

New rules coverage includes: cross-clinic patient read/write denial, cross-clinic
assessment read/write denial, clinic mutation denial, patient own-record read,
patient cross-patient denial, unlinked-patient denial, mismatched `patientId`
denial, append-only assessments, collection-group clinic scoping, and the
patient-link guards.

## 9. Migration status — **not run, by design**

There is no Firestore data in this repository and no credentials locally, so no
migration was executed and none is claimed. Legacy per-diagnosis documents are
left untouched and are **not displayed**, because deciding whether two rows are
the same person is a clinical-safety judgement that cannot be automated safely.
Documented in `PHASE_4_MIGRATION_PLAN.md` §4 and `SECURITY.md` §6.2.

## 10. Behaviour changes

- **Doctor**: records list now shows *people* with their latest assessment and
  visit count; clicking opens history. Diagnosis still saves, now as
  patient + assessment.
- **Patient**: dashboard shows their own assessment history via the link, or a
  clear "not yet linked" state. Diaries now carry `patientId`.
- **Dashboard**: metrics recomputed as Total Patients, Total Assessments, Average
  Confidence, Assessments Today, Most Frequent Predicted Condition — all derived,
  none hardcoded.
- **Login/registration**: unchanged from Phase 3.

## 11. What I did **not** do (per brief)

ML leakage, the Gemini confidence contradiction, XAI, structured AI output,
appointments, billing, notifications, chat, rate limiting. Not touched.

## 12. Remaining risks

1. **The new rules are not deployed** — proven in the emulator and committed;
   publishing to `arogyaai-cloud-ad667` needs a console/CLI action.
2. Legacy documents are not migrated (deliberate; §9).
3. The patient link is a capability code, not verified identity (`SECURITY.md` §6.7).
4. The API is still not clinic-aware (it has no Firestore credentials).
5. **No browser end-to-end run was executed.** The patient/assessment flows are
   verified by rules tests, type-checking and build; a live signed-in
   create-patient → assessment → history round trip has **not** been performed.

## 13. Git

Committed on `feature/final-year-rebuild`.

## 14. Phase 5 recommendation

**ML methodology** — retrain with the leakage fixed (split first, fit
preprocessing on train only, SMOTE on train only, select by cross-validation,
evaluate once on an untouched test set) and publish honest metrics in
`MODEL_CARD.md`, replacing the withdrawn 99–100% claims.

*STOP — awaiting approval before Phase 5.*
