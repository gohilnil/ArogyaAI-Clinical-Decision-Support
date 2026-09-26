# ArogyaAI — Final Project Completion Report

**Date:** 2026-09-26
**Branch:** `feature/final-year-rebuild`
**Final commit:** `0e82a71` (`0e82a71141f4984f1794e86f2465722130f4116a`)
**Working tree:** clean
**Commits ahead of `main`:** 19

Every claim below is either backed by a command run during this engagement or
explicitly marked **UNVERIFIED**. Nothing is asserted from inference alone.

---

## 1. Executive summary

This engagement continued the Phase 1–5 rebuild, covering Phases 6–24. The work
had four thrusts: implement the explainability that was previously an empty UI
panel; repair frontend/backend contract mismatches and genuine broken flows;
harden security with two real authorization fixes; and make the documentation
stop describing a system that does not exist.

**The most serious finding was not in the phase reports.** Practitioner
registration was broken: both registration paths read `invites/{code}` before the
caller was signed in, while the rule requires `isSignedIn()`, so the read was
denied and doctor signup could not complete. The same rule allowed any signed-in
user to enumerate every invite and its `clinicId`. Separately, `patient_logs`
entries could be written into another clinic's feed. All three are fixed, with
regression tests.

**Explainability is now real.** The model's `coef_` matrix is (399, 819), so for
multinomial logistic regression the score for class *k* is exactly
`intercept_k + Σ(coef[k,i] × x[i])`. The API returns each feature's actual term
in that sum. A test re-derives the identity from the model object and asserts it
equals the logit, so a decorative explanation cannot pass.

**Documentation was materially false.** `FALLBACK_MECHANISM.md` documented an
offline recommendation subsystem — including two functions and a test file that
do not exist — with "100% accuracy", "HIPAA-friendly" and "Production Ready"
claims. `README_PREDICTION_SYSTEM.md` reported 99.5–100% accuracy, 889/901
features, and an SVM that is never trained. Both were rewritten against the code.

**The project is not deployed by this work and I did not deploy it.** No Render,
Vercel or Firebase credentials were available. Everything is verified locally and
the external steps are documented in `DEPLOYMENT.md` and marked UNVERIFIED.

---

## 2. Final architecture

```
frontend/  React 19 + TypeScript 6 + Vite 8 + Tailwind 3
   pages/       9 role-gated pages (doctor: dashboard, diagnose, patients, detail;
                patient: home, checkup; shared: profile, help, login)
   services/    api.ts (single HTTP boundary), firestore.ts (single Firestore boundary)
   hooks/       useAuth.ts
   types/       shared domain types (contract mirror)

backend/   FastAPI, layered
   api/routes/     health.py, prediction.py
   services/       prediction_service.py (orchestration)
   ml/             model_loader.py, preprocessing.py, predictor.py, explainability.py
   ai/             gemini_service.py, prompts.py
   core/           config.py, security.py, rate_limit.py, logging.py
   schemas/        prediction.py, common.py

ml/        train.py (leak-free pipeline), evaluate.py, artifacts/
tests/     test_backend_api.py, test_ml.py, test_security.py, test_rate_limit.py,
           rules/firestore.rules.test.js
```

Data flow: browser → Firebase ID token → FastAPI `require_user` → rate limiter →
preprocessing (819 features) → Logistic Regression → explanation → Gemini
narrative. Firestore reads/writes are authorized independently by rules; the
backend holds no Firestore credentials and never touches the database.

## 3. Completed features

| Feature | State |
|---|---|
| Firebase ID-token verification (RS256, aud/iss/exp/iat/sub, `alg:none` rejected) | verified |
| Role-based authorization (invite-gated doctor, immutable role/clinic) | verified (59/59 rules tests executed against the emulator) |
| Clinic isolation of patients and assessments | verified (code-level) |
| Patient↔account linking by capability code | verified |
| Model prediction (399 classes, 819 features) | verified |
| Per-prediction explanations | verified |
| Ayurvedic narrative via Gemini, with safe degradation | verified |
| Confidence gate at 35% | verified |
| Patient/assessment history | verified |
| Symptom diary (clinic-bound, append-only) | verified |
| Rate limiting on the expensive endpoint | verified |
| PDF export of a result | verified (browser `window.print`) |

## 4. Security model

- **No privileged credential on the server.** Token verification uses Google's
  public certificates; there is no service-account key to leak.
- **Identity from the token, never the body.** `require_user` returns verified
  claims; handlers never accept a caller-supplied identity.
- **CORS allowlist**, no wildcard, credentials enabled.
- **Rate limiting** per verified uid, sliding window, in-process (§16).
- **No secrets in the repository.** Scanned all 131 tracked files: the only
  credential-shaped match is `frontend/src/config/firebase.ts`, which holds the
  Firebase **web config** — those values are public by design and ship in every
  client bundle. No `.env`, service-account JSON, or key file is tracked.

Fixes made this engagement:

| # | Issue | Severity |
|---|---|---|
| 1 | `patient_logs` create did not bind `clinicId` to the caller → cross-tenant write | **High** |
| 2 | Any signed-in user could enumerate every invite + its `clinicId` | **High** |
| 3 | Practitioner registration could not complete (invite read while signed out) | **High (functional)** |
| 4 | Provider error text appended to client-visible message | Low-Medium |
| 5 | No ceiling on the per-request-LLM-cost endpoint | Medium |

## 5. Authentication model

Email/password and Google sign-in via Firebase Auth. A `users/{uid}` document is
the account's source of truth; a failed profile write deletes the just-created
auth account rather than leaving a user who can sign in but has no role.

**Fixed this engagement:** registration now creates the auth account *before*
reading the invite (the rules require a signed-in caller). The no-orphan
invariant is preserved by removing the account when the profile write fails.

**Missing error state fixed:** a failed `users/{uid}` read previously left the app
on "Initializing Secure Portal" permanently. Now caught, with the signed-in
identity retained and no profile.

## 6. Authorization model

Two layers:

1. **Backend** — `require_user` gates `POST /api/predict`.
2. **Firestore rules** — everything else. A signed-in user has no access until
   their `users/{uid}` document is resolved and its `role`/`clinicId` checked.

Rules invariants: doctor creation requires an unused invite bound to the claimed
clinic; `role`, `clinicId`, `email` are immutable; patients/assessments are
clinic-scoped; a patient reads only their linked record; assessments and diary
entries are append-only; unmatched paths deny by default.

## 7. Firestore schema

```
users/{uid}                      role, clinicId, email, [patientId], [inviteCode]
invites/{code}                   used: bool, clinicId
patients/{patientId}             name, age, gender, dosha, email, clinicId, createdBy, timestamps
patients/{patientId}/assessments/{assessmentId}
                                 symptoms, profile fields, prediction, mlPrediction,
                                 confidence, aiReport, [explanation], clinicId, createdBy, createdAt
patient_logs/{logId}             userId, email, symptoms, clinicId, [patientId], createdAt
```

No composite indexes required (`firestore.indexes.json` is empty).

## 8. ML methodology

```
raw CSV → clean → stratified 80/20 split (seed 42)          ← split FIRST
        → fit encoders + TF-IDF + scaler on TRAIN only
        → select by 3-fold CV macro-F1 on TRAIN only
        → SMOTE evaluated as a scored variant (not deployed)
        → final fit on TRAIN
        → ONE evaluation on the untouched TEST split
```

Six leaks removed relative to the original trainer (encoder fitting, TF-IDF
vocabulary, SMOTE, scaler, model selection on test). Imbalance is handled with
`class_weight='balanced'`; SMOTE inside CV is mathematically unsafe at this class
sparsity (classes with a single training member) and is reported, not selected.

## 9. Current model metrics

Untouched 841-row test split:

| Metric | Value |
|---|---|
| Accuracy | 0.8859 |
| Macro precision | 0.8310 |
| Macro recall | 0.8651 |
| **Macro F1** | **0.8372** |
| Weighted F1 | 0.8761 |

94 of 841 rows misclassified. The RF comparison candidate scores 0.8502 / 0.7946.
The previously published 99–100% figures are withdrawn as leakage-contaminated
and appear only inside retraction sentences.

## 10. Model artifact

| Property | Value |
|---|---|
| File | `arogyaai_model.joblib` |
| Estimator | `LogisticRegression` (multinomial) |
| Version | `v3-cv-selected` |
| Size | 2,680,914 bytes |
| SHA-256 | `e000590b7cd745a6c2b375568a62ed57ee4e3ee35376aaf68a368ffcf6ecadd0` |
| Classes / features | 399 / 819 (12 structured + 807 TF-IDF) |
| Fitted under | Python 3.14.5, scikit-learn 1.9.0, pandas 3.0.5, numpy 2.5.2 |

Verified this engagement: the file loads, the estimator class is
`LogisticRegression`, and both the SHA-256 and byte count match
`ml/artifacts/metrics.json` exactly. The dataset SHA-256 also matches.

## 11. Explainability implementation

`backend/ml/explainability.py`. For the predicted class *k*, each feature's
contribution is `coef[k,i] × x[i]` — its actual term in the model's score. The
response carries `method`, `predicted_class`, `intercept`, `total_contribution`,
and the top-N `features` (each with `feature`, `group`, `input_value`,
`contribution`, `direction`).

Honest boundaries, enforced in code and stated in the payload's `note`:

- Score terms, not probability changes, not percentages, not causes.
- Only symptom terms the caller's own text produced are listed.
- `None` for a non-linear estimator rather than a fabricated explanation.
- **No explanation on the low-confidence path** — naming features that support a
  condition being simultaneously withheld would present a guess as a finding.

UI: the "AI X-Ray" panel renders it live; assessment history renders the
explanation **stored with the event**, so history shows the analysis that ran.

## 12. API inventory

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | public | Service banner |
| GET | `/api/health` | public | Model name read from the artifact |
| POST | `/api/predict` | Bearer token + rate limit | Returns `prediction`, `confidence`, `recommendation`, optional `ml_prediction`, optional `explanation` |

Errors use a stable envelope: `{"detail":{"error":{"code","message"}}}`.
Codes: `MISSING_TOKEN`, `INVALID_TOKEN` (401), `RATE_LIMITED` (429, `Retry-After`).

## 13. Frontend inventory

| Page | Role | Notes |
|---|---|---|
| LoginPage | — | email/password + Google; submit-in-flight state added |
| DashboardPage | doctor | real derived stats; missing-clinicId state fixed |
| DiagnosePage | doctor | 3-step wizard, X-Ray panel, PDF, save; dosha-quiz encoder bug fixed |
| PatientsPage | doctor | per-patient summary; infinite-spinner state fixed |
| PatientDetailPage | doctor | history + stored model contributions |
| PatientHomePage | patient | own record + history |
| PatientCheckupPage | patient | diary; silent no-op and unlinked warning fixed |
| ProfilePage | both | patient code link; API URL now validated + explicit save |
| HelpPage | both | static |

Removed: the orphaned `/my-records` "coming soon" route. No `any` types; the
`AnalysisResult` mirror no longer declares fields the API never sends.

## 14. Test results

| Suite | Command | Result |
|---|---|---|
| ML (incl. explainability) | `python -m unittest tests.test_ml` | **29 pass** |
| Backend API | `python -m unittest tests.test_backend_api` | **18 pass** |
| Token verification | `python -m unittest tests.test_security` | **14 pass** |
| Rate limiting | `python -m unittest tests.test_rate_limit` | **8 pass** |
| **All Python** | `python -m unittest discover -s tests` | **69 pass** |
| TypeScript | `npx tsc -b` | exit 0 |
| Production build | `npm run build` | exit 0 |
| Firestore rules | `firebase emulators:exec … "npm test"` | **56 pass** |

Rules tests grew 54 → 59 (two authorization regressions, plus query-level tests
for the list queries the UI issues), and the suite was subsequently **executed
against the emulator: 59/59 pass** (Temurin JRE
21.0.12.1). It had been reported unverified because `java` was not on `PATH`; a
JRE was in fact installed under `C:\Program Files\Eclipse Adoptium\`, so setting
`JAVA_HOME` unblocked it. The rules in this repository are therefore executed,
not merely syntax-checked.

Verifying that also exposed a reproducibility defect: `tests/rules/package.json`
declared no dependencies while the test imports `@firebase/rules-unit-testing`
and `firebase`. It had passed only because `node_modules` already existed here;
on a fresh clone `npm install` would have installed nothing and the suite would
have failed. Both are now declared at the verified versions.

Adversarial probe against a live local server (all correct): no token → 401;
malformed token → 401; forged `alg:none` token → 401; `Basic` scheme → 401;
`/` and `/api/health` → 200; 401 body leaked no internals.

## 15. Deployment status

**UNVERIFIED.** No Render, Vercel or Firebase credentials were available, so
nothing was deployed by this work. `DEPLOYMENT.md` documents the exact commands,
required secrets, rollback, and a post-deploy checklist.

One real defect found and fixed: `render.yaml` pinned `PYTHON_VERSION 3.10.12`,
but the installed scikit-learn 1.9 declares `Requires-Python >=3.11` and the
artifact was fitted under 3.14.5 — the pin could not install the declared
dependency at all. Now `3.12.7`, with a note tying it to the artifact's recorded
environment and warning that the pickle must be re-verified after any change.

## 16. Known limitations

1. **Not clinically validated.** Dataset provenance is undocumented; no
   clinician has reviewed the outputs.
2. **Confidence is uncalibrated.** `max(predict_proba)`, presented as a "Model
   Score" after this engagement (it was labelled "Confidence"). No calibration
   applied, no calibration error measured.
3. **The 35% gate is an inherited heuristic**, not a validated threshold.
4. **Severe class imbalance** — macro-F1 (0.837) is materially below accuracy
   (0.886); classes with one or two test examples score F1 0.000.
5. **Label-synonym confusion** caps achievable accuracy for near-identical
   classes (`Crohn Disease` / `Inflammatory Bowel Disease`).
6. **Rate limiting is per-process**, so N instances multiply the effective limit.
7. **The frontend bundle is one ~786 kB chunk** (~240 kB gzipped); Vite warns.
   Not code-split.
8. **Symptom input is keyword-style**; free clinical text is out of distribution.
9. **CV is mildly optimistic** — preprocessing is fitted once on the training
   split rather than per fold. No test contamination.
10. **The API does not check the caller's clinic** — it holds no Firestore
    credentials; all data authorization is in rules.

## 17. Unverified items

Stated plainly so they are not mistaken for done:

| Item | Why |
|---|---|
| ~~Firestore rules execution~~ | **Closed**: 59/59 pass with JRE 21 on `PATH` |
| Live rules deployment | No Firebase credentials; what is deployed may differ from the repo |
| Live authentication / browser E2E | No browser automation or live Firebase project available |
| Render deployment | No credentials |
| Vercel deployment | No credentials |
| Legacy record migration | Deliberately not automated (§18) |

## 18. Historical limitations

- Legacy pre-Phase-4 per-diagnosis documents are **not migrated**. Merging rows
  into people requires deciding whether two records describe the same human, which
  is a clinical-safety judgement no script should make. Plan:
  `PHASE_4_MIGRATION_PLAN.md` §4.
- The 99–100% accuracy figures from the original trainer are **withdrawn** and
  appear only inside retraction sentences.
- `presentation_screenshots/` (12 PNGs) and `AyurCore.ipynb` are kept as
  historical/viva material, not code.

## 19. Remaining manual actions

1. ~~Install Java, run the rules suite, and get it green.~~ **Done** — 59/59 pass
   with `JAVA_HOME` pointed at the Temurin JRE.
2. Deploy `firestore.rules` (`firebase deploy --only firestore:rules`).
3. Deploy the backend to Render; set `GEMINI_API_KEY` (and confirm the other
   env vars in `DEPLOYMENT.md` §2).
4. Deploy the frontend to Vercel with `VITE_API_URL` pointing at the backend.
5. Create at least one invite document in the console with a **long random**
   code before any doctor registers.
6. Walk the post-deploy checklist (`DEPLOYMENT.md` §8).

## 20. Commands to run the project

```bash
pip install -r requirements.txt
```

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

```bash
python -m unittest discover -s tests
```

## 21. Commands to deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes --project arogyaai-cloud-ad667
```

Backend (Render) and frontend (Vercel) deploy from their dashboards using
`render.yaml` and `vercel.json` respectively. Full detail: `DEPLOYMENT.md`.

## 22. Final git commit

```
0e82a71  phase-7-ui: surface the stored explanation in assessment history
0e82a71141f4984f1794e86f2465722130f4116a
```

Working tree clean; 19 commits ahead of `main` on `feature/final-year-rebuild`.

Commits added this engagement:

```
0e82a71 phase-7-ui: surface the stored explanation in assessment history
cf98479 deploy: fix the Python pin, add a runbook, mark external steps unverified
ace80aa honesty(confidence): label the model score as what it is
e0b37c3 security: bound the prediction endpoint per caller
9f6fcfc docs: make living documentation describe the actual system
584c658 chore: remove dead and broken files
cc42c76 fix(deps): declare the auth libraries the backend imports, drop unused pytest
2ab0df9 phase-7-auth: fix practitioner registration, close two rule gaps
cbf1005 phase-7-contract: fix broken states, stop the prose contradicting the result
2c71704 phase-6-xai: genuine per-prediction explanations, real AI X-Ray panel
```

## 23. Rollback procedure

Independent per component; nothing in this engagement adds a destructive
migration, so no rollback loses data.

```bash
git revert <commit>
```

- **Frontend** — redeploy the previous Vercel build, or revert and let it rebuild.
- **Backend** — redeploy the previous Render image/commit.
- **Model artifact** — `git checkout <prev> -- arogyai_model.joblib`, then verify
  it loads and `/api/health` reports the expected `model_type`.
- **Rules** — `git checkout <prev> -- firestore.rules`, re-run the emulator suite,
  then redeploy.

---

## Status by area

| Area | Status | Evidence |
|---|---|---|
| Frontend | COMPLETE | `tsc -b` exit 0; `npm run build` exit 0; dead UI removed; contract mirror matches the API |
| Backend | COMPLETE | 69 tests pass; `/` + `/api/health` + `/api/predict` verified live |
| Authentication | COMPLETE | 14 token tests; live adversarial probe (401 × 4 cases); registration ordering fixed |
| Authorization | PARTIAL | **59/59 rules tests executed green**; two authorization gaps fixed and regression-tested. Live deployment still unverified |
| Firestore | PARTIAL | Schema and rules coherent and now executed (59/59); deployed state unverified |
| ML | COMPLETE | Leak-free pipeline; artifact SHA + bytes match metadata; 29 tests |
| Explainability | COMPLETE | Identity `intercept + Σcontrib = logit` asserted in tests; rendered live and in history |
| Security | COMPLETE* | Secrets scan clean; rate limiting added; error leak closed; *live deployment unverified |
| Testing | PARTIAL | 78 Python tests pass; 59/59 rules tests executed; no browser E2E possible without a live Firebase project |
| Deployment | PARTIAL | Config coherent and a real Python-pin defect fixed; **nothing deployed**; runbook written |
| Documentation | COMPLETE | Living docs rewritten against code; historical records preserved; `DEPLOYMENT.md` added |

`COMPLETE` means verified here. `PARTIAL` means a named external step remains
unverified, not that the work is unfinished.
