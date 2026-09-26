# ArogyaAI — PHASE 0 Project Audit

> Scope: full repository inspection (`frontend/`, `backend/`, ML artifacts, datasets,
> Firebase usage, docs, tests, deployment config). Every claim below was checked
> against the actual source. Claims that could **not** be verified are marked
> **UNVERIFIED** — never assumed true.
>
> Date: 2026-09-26 · Branch: `main` · Working tree: `frontend/src/firebase.ts` modified.
> No files were modified to produce this audit.

---

## 1. Current architecture (what actually exists)

```
React 19 + TS + Vite 8 + Tailwind 3 + Framer Motion      (frontend/src/App.tsx — 2120 lines, single file)
   │  Firebase Auth (email/password, Google popup)
   │  Firestore Web SDK (users, patients, patient_logs)
   │
   └─ fetch POST /api/predict  ──────────────►  FastAPI  (backend/index.py — 212 lines)
                                                   │  imports from root arogya_predict.py
                                                   ├─ derive_age_group + categorical fallback
                                                   ├─ preprocess_input (LabelEncoder×8, TF-IDF, BMI, StandardScaler)
                                                   ├─ RandomForest .predict / .predict_proba  → disease + confidence
                                                   └─ if confidence ≥ 35 → Gemini → free-text recommendation
```

There is **no OCR**, **no file/PDF ingestion**, **no RAG**, **no vector DB**, **no
Explainable-AI output**, **no assessment subcollection**, **no analytics service**,
**no backend auth**. The only "PDF" feature is `window.print()` labelled *Export PDF*.

### Repository inventory

| Path | Reality |
|---|---|
| `frontend/src/App.tsx` | 2120-line monolith: auth screen, sidebar, 7 page components, router — all in one file |
| `frontend/src/firebase.ts` | Firebase init; **config hardcoded**, currently pointed at `arogyaai-cloud-**ad667**` (uncommitted change) |
| `backend/index.py` | The only real backend file. 2 endpoints + `/` |
| `arogya_predict.py` | Model loader + `preprocess_input` + Gemini call + **CLI `main()`** |
| `train_model.py` | Training script (reads CSV, SMOTE, trains RF/LR/SVM, saves pkl) |
| `disease_prediction_system.py` | 510 lines, **dead** — imported only by a mock-based test |
| `demo.py` | **BROKEN** — imports `ArogyaAI`, a class that does not exist in `arogya_predict.py` |
| `test_disease_prediction.py` | Mocks every dependency (`sys.modules[...]=MagicMock`) — tests nothing real |
| `tests/test_backend_api.py` | Genuine FastAPI TestClient suite (10 tests). Cannot run — `httpx` not installed |
| `random_forest_model.pkl` | **1.1 GB**, committed to git |
| `enhanced_ayurvedic_treatment_dataset.csv` | 4201 rows, **399 diseases**, 27 columns, committed |
| `AyurCore.ipynb` | 71 KB notebook (source of training methodology) |
| Docs | `README.md`, `README.tmp.md`, `README_PREDICTION_SYSTEM.md`, `DEMO_GUIDE.md`, `FALLBACK_MECHANISM.md`, `THIRD_REVIEW_PREP.md` — several **contradict each other** |

---

## 2. Feature classification

Legend: **IMPLEMENTED** · **PARTIAL** · **BROKEN** · **HARDCODED** · **NOT IMPLEMENTED**

### Authentication & roles
| Feature | Status | Evidence |
|---|---|---|
| Email/password register + login | IMPLEMENTED | `handleAuth` App.tsx:1780 |
| Google login | IMPLEMENTED | `handleGoogleAuth` App.tsx:1817 |
| Logout | IMPLEMENTED | `signOut(auth)` sidebar |
| Auth state persists on refresh | IMPLEMENTED | `onAuthStateChanged` App.tsx:1762 |
| Auth loading state | IMPLEMENTED | `authLoading` App.tsx:1854 |
| Role-based UI (doctor/patient) | PARTIAL | Role from Firestore `users/{uid}.role`, but **client-assigned at signup** — no server enforcement |
| Protected routes | PARTIAL | Role gating is conditional rendering *inside* `<Routes>` (App.tsx:2067). No route guard component; there is **no separate protected-route wrapper** and no check that a logged-in user has a `users` doc — if the doc is missing, `userData` is null and the app renders the **patient** routes by default |
| Admin role | NOT IMPLEMENTED | Correctly absent — do not add for appearance |

### Patient management
| Feature | Status | Evidence |
|---|---|---|
| Add patient record (via diagnosis) | IMPLEMENTED | `saveToCloud` App.tsx:1104 |
| Patient list | IMPLEMENTED | `PatientRecords` App.tsx:589 |
| Patient **search** | NOT IMPLEMENTED | No search input anywhere (grep: only `.filter()` on arrays) |
| Patient **filter/sort UI** | NOT IMPLEMENTED | Sorted by `createdAt` only |
| Patient **edit** | NOT IMPLEMENTED | No update path |
| Patient **profile page** | NOT IMPLEMENTED | Rows are not clickable (cursor-pointer, no handler) |
| Patient **history / assessments** | NOT IMPLEMENTED | Flat `patients` docs, no `patientId` linkage, no subcollection |
| Patient–practitioner association | HARDCODED-ish | Only via shared `clinicId` string |
| "My Records" (patient) | **STUB** | App.tsx:2095 — literally renders *"Feature coming soon."* |
| Patient sees own records | **BROKEN** | `PatientDashboard` fetches **all** clinic patients then filters by `name.includes(email-prefix)` (App.tsx:352). Fragile and semantically wrong |

### Diagnostic engine
| Feature | Status | Evidence |
|---|---|---|
| ML prediction + confidence | IMPLEMENTED | `predict_disease` backend/index.py:123 |
| Preprocessing (encode/TF-IDF/BMI/scale) | IMPLEMENTED | `preprocess_input` |
| Confidence safety gate (<35%) | IMPLEMENTED | backend/index.py:162 |
| Confidence **calibration** | NOT IMPLEMENTED | Raw `max(predict_proba)` used as confidence |
| Evaluation metrics (P/R/F1/CM) | NOT IMPLEMENTED | Training prints accuracy only |
| Model comparison output | PARTIAL | Trains RF/LR/SVM, picks best by test accuracy — **leakage** (see §5) |
| XAI / feature attribution | **HARDCODED / NOT IMPLEMENTED** | Interface declares `xai_breakdown`, `indicators`, `reasoning`, `herbs`, `lifestyle` (App.tsx:86–91) but the backend **never returns them** → the "AI X-Ray" panel and the herbs/lifestyle branch render **nothing** |
| Model versioning | NOT IMPLEMENTED | `model_type` saved in pkl but never surfaced |

### GenAI (Gemini)
| Feature | Status | Evidence |
|---|---|---|
| Gemini Ayurvedic explanation | IMPLEMENTED | `get_llm_validation_and_explanation` |
| Model fallback chain | IMPLEMENTED | `GEMINI_MODELS` list, loops on failure |
| Graceful failure message | PARTIAL | Returns text, but **leaks `Details: {last_error}`** to the client |
| Structured JSON output | NOT IMPLEMENTED | Free-text only; frontend strips `**` with regex |
| Pydantic validation of AI output | NOT IMPLEMENTED | Raw string returned |
| Prompt-injection hardening | NOT IMPLEMENTED | Symptoms interpolated raw into prompt; output rendered directly |
| API key never on frontend | IMPLEMENTED | Key read server-side only ✅ |
| AI response persisted | NOT IMPLEMENTED | `recommendation` displayed but **never stored** |
| "Rule-based knowledge-base fallback" | **FALSE** | `FALLBACK_MECHANISM.md` describes `load_ayurvedic_database()` / `get_fallback_recommendations()` — **neither function exists** |

### Dashboard / analytics
| Feature | Status | Evidence |
|---|---|---|
| Diagnostics count | IMPLEMENTED (real) | `GlobalDashboard` reads Firestore App.tsx:486 |
| Average ML confidence | IMPLEMENTED (real) | App.tsx:492 |
| Dominant dosha | IMPLEMENTED (real) | App.tsx:499 |
| Charts / trends / time series | NOT IMPLEMENTED | None |
| Hardcoded statistics | none found ✅ | Prior commit fixed these |

### Logging / audit
| Feature | Status |
|---|---|
| Patient symptom diary | IMPLEMENTED (patient side only) |
| Audit logging | NOT IMPLEMENTED |
| Doctor can see diaries | IMPLEMENTED (`PatientRecords` logs tab) |

### Testing / deployment
| Feature | Status |
|---|---|
| Backend API tests | PARTIAL — 10 real tests exist, **cannot run** (`httpx` missing from requirements) |
| Legacy ML test | **HARDCODED** — fully mocked, asserts nothing |
| Frontend tests | NOT IMPLEMENTED |
| Firestore rules tests | NOT IMPLEMENTED |
| Frontend deploy (Vercel) | CONFIGURED (`vercel.json`) |
| Backend deploy (Render) | CONFIGURED (`render.yaml`) |
| CI (GitHub Actions) | **NOT IMPLEMENTED** — `.github` has only an issue template |

---

## 3. Security weaknesses

| # | Severity | Issue | Evidence |
|---|---|---|---|
| S1 | **CRITICAL** | **Firestore rules are not in the repo.** No `firestore.rules`, no `firebase.json`. `THIRD_REVIEW_PREP.md` §21.2 confirms rules live only in the console and "could not be inspected". We **cannot prove** the DB is not `allow read, write: if true`. **Must be treated as unknown-until-proven.** | repo scan |
| S2 | **CRITICAL** | **Privilege escalation:** `users/{uid}` is written from the client with `role` chosen by the user (`setDoc(...role: selectedRole)`, App.tsx:1805). Anyone can register as `doctor`. Combined with S1 this is a full trust break. | App.tsx:1794–1809 |
| S3 | **HIGH** | **`/api/predict` is unauthenticated** and CORS is `allow_origins=["*"]` **with `allow_credentials=True`** (invalid/misconfigured combo). Anyone can call the endpoint, including scraping. | backend/index.py:22–34, 123 |
| S4 | **HIGH** | **Clinic isolation is client-side only.** Any 6-char string is accepted as a `clinicId` at patient signup — no verification the clinic exists or that the patient belongs to it. Cross-tenant reads depend entirely on unknown rules. | App.tsx:1787, 1803 |
| S5 | **MEDIUM** | **Prompt injection → stored/rendered content.** Free-text symptoms go straight into the Gemini prompt and the model's reply is rendered with only a `**` strip. A crafted symptom string can steer the output. | arogya_predict.py:117–189, App.tsx:1667 |
| S6 | **MEDIUM** | **Internal error text leaked to users** in the AI fallback (`Details: {last_error}`). | arogya_predict.py:196 |
| S7 | **MEDIUM** | **No rate limiting / no input size cap** on `/api/predict`; an oversized `Symptoms` string flows into TF-IDF. | backend/index.py:85 |
| S8 | **LOW** | Firebase web config hardcoded in `firebase.ts` (web API keys are public by design, but the **project was switched** in the working tree — commit hygiene issue). | firebase.ts |
| S9 | **LOW** | Patient can point the API at an arbitrary URL via `localStorage.renderUrl`. | App.tsx:1070 |

---

## 4. Database weaknesses

- **Three flat collections, no relations.** `patients` is keyed by *auto-ID*, not by a stable patient identity. Every diagnosis **creates a new patient row** → repeat visits duplicate the same person; no patient entity exists.
- **`patients` doubles as two concepts** — the doctor's record store *and* the patient's "prescriptions" feed (`PatientDashboard` reads it as advice). Semantically overloaded.
- **AI output is not persisted.** `saveToCloud` writes `name/age/gender/dosha/symptoms/diagnosis/confidence/clinicId/createdAt` — not `recommendation`, not `ml_prediction`, not `model_version`. The assessment history therefore cannot show the AI report.
- **No timestamps beyond `createdAt`** (no `updatedAt`), no `practitionerId`, no `patientId`.
- **No indexes documented**; no composite index definitions in repo (only single-field `clinicId` equality queries today — auto-indexed).
- **Patient identity is inferred from a name substring match** (App.tsx:352) — incorrect by construction.

---

## 5. ML weaknesses

- **Data leakage in `train_model.py`** (three independent leaks):
  1. **SMOTE applied to the full dataset before the split** (`smote.fit_resample(X_combined_full, y_full)`, line 164), then the "test" set is drawn from original indices — synthetic neighbours of test rows pollute training.
  2. **TF-IDF and `StandardScaler` fitted on the full dataset** (lines 133, 169) before any hold-out separation.
  3. **Model selection uses the test set** — RF/LR/SVM are compared by `accuracy_score(y_test)` and the winner is picked (lines 201–213). The reported number is therefore optimistic and not a valid generalisation estimate.
- **Only accuracy is reported.** No precision/recall/F1, no confusion matrix, no per-class analysis, no cross-validation, no calibration curve.
- **Severe class imbalance unaddressed honestly:** 399 classes, median counts in the low single digits, minimum 3 (`Metabolic Syndrome`, `Anxiety`, `PMS`, …). A model can score high accuracy while being useless on rare classes — and the class distribution is never reported.
- **Documented accuracy is unverified and probably inflated:** `README.md` and `README_PREDICTION_SYSTEM.md` claim "99%+" / "99.5%"; `DEMO_GUIDE.md` claims "100% accuracy". No artefact in the repo supports these. **Do not repeat these numbers until re-measured.**
- **Doc↔code drift on features:** `README.md` says 819 features (12 + 807 TF-IDF); `DEMO_GUIDE.md` says 889 symptom features. Only the live model knows; must be measured from the pkl.
- **1.1 GB pickle** — huge for 4201 rows × 399 classes. Loading it at Render cold-start is slow and memory-hungry; it is also committed to git (repo bloat).
- **Duplicate/divergent age-group maps:** `backend.derive_age_group` (6 buckets incl. `Middle Age`, `Elderly`) vs `arogya_predict.preprocess_input` (4 buckets) vs CLI `main()` (5 buckets, different names). Only the backend path is used by the API, but the CLI path would encode unseen labels as `0` silently.
- **Unseen-category fallback silently maps to class `0`** (arogya_predict.py:86) rather than the encoder's default — skews features.

---

## 6. GenAI weaknesses

- Free-text output; no schema, no validation, no retry-on-malformed.
- Single monolithic prompt with the response template inlined; no separation of system/user content.
- No medical-safety guardrails beyond one boilerplate disclaimer sentence appended by the frontend.
- No handling of empty/blocked Gemini responses (`response.text` could raise).
- Free tier quota/timeouts handled only by "try next model, else apology string".
- No token/latency budget, no caching.

---

## 7. API weaknesses

- Only 3 routes (`/`, `/api/health`, `/api/predict`). No `/api/model-info`, no assessments, no patients, no auth middleware.
- `/api/health` reports a hardcoded `"model": "Random Forest"` string (not derived from the loaded model — `model_type` is available in the pkl but unused).
- No dependency-injection / service layer; everything lives in the route function.
- No request IDs, no structured logging, no rate limiting.

---

## 8. UI/UX weaknesses

- One 2120-line component; no component/test separation.
- `alert()` used for errors (patient logger).
- Auth screen: password "min 6" is a placeholder only — no client validation.
- **Dead UI:** the entire "AI X-Ray" card and the herbs/lifestyle branch are wired to fields the API never returns → they render empty containers.
- `- Start New Analysis` and report header use a leading `-` instead of an icon.
- Animated gradient body + heavy Framer Motion on every page — against the "minimal, professional, no excessive animation" bar.
- No empty/loading/error states consistently (some pages have them, some don't).
- Accessibility not audited: no `aria-*`, no visible focus ring on several custom buttons, decorative icons unlabelled.

---

## 9. Deployment weaknesses

- No CI; `render.yaml` builds from `requirements.txt`, which is **incomplete** (missing `imbalanced-learn` needed by `train_model.py`, missing `httpx` needed by the test suite).
- 1.1 GB model on a Render web service → slow cold start.
- `vercel.json` at repo root mixes a `buildCommand` with `outputDirectory` — works for the current layout but fragile.
- No `.env.example` anywhere; no documented variable list beyond two docs that disagree.
- No health-check wiring in `render.yaml`.

---

## 10. Documentation weaknesses (accuracy is the problem)

| Doc | Problem |
|---|---|
| `README.md` | Claims 99%+ accuracy, "Explainable AI (XAI)", 819 features, "Gemini 2.5 Pro" — **XAI does not exist**; accuracy unverified |
| `README_PREDICTION_SYSTEM.md` | Claims 99.5% accuracy and 889 features |
| `DEMO_GUIDE.md` | Claims **100% accuracy**, "889 symptom features", and a "Rule-Based Knowledge Base" fallback that **does not exist** |
| `FALLBACK_MECHANISM.md` | Documents two functions that **do not exist** in the codebase |
| `THIRD_REVIEW_PREP.md` | **The only honest document** — correctly flags the unauthenticated API and missing rules |
| `README.tmp.md` | Stale duplicate of README |

---

## 11. Dead / duplicate / broken code

- **Dead:** `disease_prediction_system.py` (510 lines), `test_disease_prediction.py` (all-mock).
- **Broken:** `demo.py` (imports non-existent `ArogyaAI`).
- **Superseded docs:** `README.tmp.md`, and parts of the others.
- **Duplicate logic:** three different `Age_Group` maps; dosha/season label maps duplicated in the frontend and backend.

---

## 12. Technical debt summary

1. Monolithic 2120-line frontend.
2. No service/schema layer in the backend.
3. Three flat Firestore collections, no relations, no persisted AI report.
4. ML pipeline with leakage and accuracy-only reporting.
5. Fabricated capability claims in four documents (XAI, fallback DB, accuracy numbers).
6. No CI, no `.env.example`, incomplete `requirements.txt`.
7. 1.1 GB model committed to git.

---

## 13. Missing final-year-project features (with academic value)

| Gap | Why it matters to a viva |
|---|---|
| Real **model evaluation** (P/R/F1/CM, per-class, stratified CV, calibration) | Proves you understand ML validation, not just `fit/predict` |
| **Assessment history** as a subcollection | Demonstrates NoSQL data modelling and longitudinal records |
| **Backend authentication** (Firebase ID-token verification) | Demonstrates real API security |
| **Firestore rules in version control** + tests | Demonstrates least-privilege authorisation |
| **Structured Gemini output** validated with Pydantic | Demonstrates LLM engineering discipline |
| **Explicit safety layer** (red flags, low-confidence, emergency) | Demonstrates clinical-safety reasoning |
| **Tests that actually run** (backend + rules + a frontend smoke test) | Directly assessable |
| Honest **README** + `ML_MODEL_CARD.md` + `AI_SAFETY.md` | Defensible, not inflated |

---

## 14. Recommended target architecture

```
frontend/src/
  app/ (router, providers, ProtectedRoute)
  features/{auth,dashboard,diagnose,patients,assessments,patient-portal}/
  lib/{firebase.ts, api.ts, hooks/}
  types/
backend/app/
  main.py
  core/{config.py, security.py}          # Firebase token verification, env
  api/routes/{health,predict,assessments,patients}.py
  schemas/{predict.py, assessment.py}
  services/{prediction_service.py, ai_service.py}
  ml/{preprocess.py, model_loader.py}
  ai/{prompts.py, gemini_client.py, safety.py}
ml/
  train.py            # leak-free: split → (SMOTE only on train) → fit → evaluate
  evaluate.py         # P/R/F1/CM/calibration → model_card.json
  artifacts/          # versioned model + metrics (NOT in git; fetched at deploy)
firestore.rules + firebase.json + rules tests
docs/ (ARCHITECTURE, DATABASE_SCHEMA, ML_MODEL_CARD, AI_SAFETY, SECURITY, API, DEPLOYMENT)
```

**Firestore target model**

```
users/{uid}                                     role, clinicId, email, createdAt
clinics/{clinicId}                              name, ownerUid, createdAt        (NEW — makes clinicId real)
patients/{patientId}                            clinicId, practitionerId, name, age, gender, dosha, createdAt, updatedAt
patients/{patientId}/assessments/{assessmentId} symptoms, profile snapshot, prediction, confidence, model_version,
                                                ai_report{}, ai_model, createdAt            (NEW)
patient_logs/{logId}                            patientId, clinicId, symptoms, createdAt
audit_logs/{logId}                              actorUid, action, targetId, createdAt        (NEW, optional)
```

`ai_reports`, `appointments`, `notifications` — **not recommended**: the current
product has no use for them, and empty collections are exactly the "feature for
appearance" the brief forbids.

---

## 15. Recommended implementation order (mapped to your phases)

| Order | Phase | Rationale |
|---|---|---|
| 1 | **B — Database + schema** (`clinics`, `patients` + `assessments` subcollection, persist AI report) | Everything else (history, analytics, rules) depends on the data model |
| 2 | **C — Security** (Firestore rules in repo + tests; Firebase ID-token verification on FastAPI; fix CORS) | Closes S1–S4; the single largest risk |
| 3 | **D — ML** (leak-free retrain, real metrics, model card, versioning) | Replaces unverified accuracy with measured metrics |
| 4 | **E — GenAI** (structured JSON + Pydantic validation + safety layer) | Enables AI report persistence and the safety layer |
| 5 | **F/G — Patient management + assessment history** | Consumes B and E |
| 6 | **H — Dashboard/analytics** on real data | Consumes B |
| 7 | **I — Tests** (backend, rules, frontend smoke) | Locks in correctness |
| 8 | **J — UI/UX + accessibility** (remove dead UI, split the monolith) | Last, per your instruction |
| 9 | **K — Docs + deployment** (honest README + the 7 docs, `.env.example`, CI) | Consolidates |

**Do not skip step 1.** Changing the data model after building rules, history and
analytics means rewriting all three.

---

## 16. Immediate blockers to fix before any feature work

1. **Confirm the live Firestore rules.** They are not in the repo and cannot be
   verified from source. Until they are read from the console (or the Firebase
   CLI), **S1 is open and we cannot claim the system is secure.**
2. **Decide the Firebase project.** The working tree switched to
   `arogyaai-cloud-ad667` while three docs describe `arogyaai-cloud`. Auth,
   Firestore and the rules must all point at the same project.
3. **Confirm the current model's real metrics and class count** by loading the
   pkl and evaluating it — the documented numbers are not trustworthy.
4. **Add `imbalanced-learn` and `httpx` to `requirements.txt`** so training and
   tests can run.

---

## 17. Honesty ledger (claims to retract)

The following must **not** be repeated in any deliverable until implemented and
measured:

- ❌ "Explainable AI / XAI" — not implemented (fields exist, values never produced).
- ❌ "99% / 99.5% / 100% accuracy" — unverified, leak-inflated, must be re-measured.
- ❌ "Rule-based knowledge-base fallback" — the documented functions do not exist.
- ❌ "Gemini 2.5 Pro" — the code uses flash-family aliases.
- ❌ "889" vs "819" feature counts — inconsistent; measure from the pkl.
- ❌ "Securely encrypted and shared only with your clinic" — no rules were verified.
- ❌ "Real-time analytics" — none exist.
- ❌ "OCR / medical report analysis" — none exists (already correctly denied in `THIRD_REVIEW_PREP.md`).

---

## 18. Files: to delete / to keep

**Keep (authoritative):** `backend/index.py`, `arogya_predict.py`, `train_model.py`,
`enhanced_ayurvedic_treatment_dataset.csv`, `tests/test_backend_api.py`,
`frontend/src/*`, `render.yaml`, `vercel.json`, `THIRD_REVIEW_PREP.md`.
**Delete (dead/broken/stale):** `disease_prediction_system.py`, `demo.py`,
`test_disease_prediction.py`, `README.tmp.md`.
**Rewrite/replace:** `README.md`, `README_PREDICTION_SYSTEM.md`,
`DEMO_GUIDE.md`, `FALLBACK_MECHANISM.md`, `SECURITY.md` (still the GitHub stub).
**Move out of git:** `random_forest_model.pkl` (1.1 GB) → external artifact.

---

*End of Phase 0 audit. No project files were modified. Awaiting approval before
Phase B (database & schema).*
