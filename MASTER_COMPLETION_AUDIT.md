# ArogyaAI — Master Completion Audit (Phase 0)

**Audit date:** 2026-09-26
**Branch:** `feature/final-year-rebuild` · **Commit:** `01fceaf` · working tree clean, 0 untracked files
**Auditor's rule:** every verdict below was checked against the repository at this commit. Where a
claim could not be verified locally (Firebase deployment, browser interaction), it is marked
**UNVERIFIED** rather than assumed.

This document supersedes the earlier phase reports as the current inventory of work. Those reports
remain as historical records and are not rewritten.

---

## 1. Repository shape

| Area | Path | State |
|---|---|---|
| Backend | `backend/` (25 `.py` files) | Layered FastAPI: `core/` `api/routes/` `services/` `ml/` `ai/` `schemas/` |
| Frontend | `frontend/src/` (21 `.ts`/`.tsx` files) | React 19 + TS 6 + Vite 8 + Tailwind 3; 9 pages, 2 layout components |
| ML | `ml/` (`train.py`, `evaluate.py`, `artifacts/`) | Leak-free pipeline; separate from serving path |
| Rules | `firestore.rules` | Version 2, invite-gated roles, clinic isolation, catch-all deny |
| Rules tests | `tests/rules/` | 54 emulator assertions (`node --test`) |
| Python tests | `tests/` (`test_backend_api`, `test_ml`, `test_security`) | 52 tests, all pass under `unittest` |
| Artifact | `arogyaai_model.joblib` | 2,680,914 B, SHA-256 `e000590b…`, tracked |

Verified test state at this commit:

```
python -m unittest discover -s tests   ->  Ran 52 tests ... OK
```

`node --test` (rules) requires the Firestore emulator and was **not** run in this audit pass; it was
last reported green (54/54) and must be re-run during Phase 17.

---

## 2. Working features (verified against code)

- **Firebase ID-token verification** — `backend/core/security.py` verifies signature (RS256),
  `aud`, `iss`, `exp`, `iat`, `sub`, and rejects `alg:none`. 12 unit tests exercise the real
  verifier with a locally generated RSA key (not a mock of the verifier).
- **Protected prediction route** — `POST /api/predict` depends on `require_user`; returns 401
  without a valid token. Verified live in the prior turn (401 unauthenticated, 200 with token).
- **Prediction pipeline** — preprocessing → 819 features → Logistic Regression → label + confidence,
  with a <35 % gate returning "Inconclusive Data" plus the raw label. Verified live.
- **Health/root routes** — `/` and `/api/health` public, report the artifact's own `model_type`.
- **Firestore domain layer** — patient/assessment/log CRUD in `frontend/src/services/firestore.ts`;
  `clinicId` and `createdBy` are taken from the authenticated profile, never a form.
- **Auth screens** — email/password + Google sign-in, doctor invite redemption, patient registration.
- **Doctor pages** — dashboard (real derived stats), diagnose (3-step wizard, PDF export, save),
  patient list + detail, health diaries.
- **Patient pages** — home (own record + history), symptom checkup, profile.

---

## 3. Broken / misleading features

### 3.1 Frontend declares API fields the backend never returns — **dead UI** (highest-impact)

`POST /api/predict` returns exactly four fields (`prediction`, `confidence`, `recommendation`,
`ml_prediction`; `backend/schemas/prediction.py:77-87`). `AnalysisResult` declares eight
(`frontend/src/types/index.ts:16-25`).

| Field | Declared | Backend sends | Render site | Effect |
|---|---|---|---|---|
| `xai_breakdown` | `types/index.ts:19` | ❌ | `DiagnosePage.tsx:829-847` | "AI X-Ray" card always empty |
| `indicators` | `types/index.ts:20` | ❌ | — | dead type, never read |
| `reasoning` | `types/index.ts:21` | ❌ | `DiagnosePage.tsx:888` | inside an unreachable `else` |
| `herbs` | `types/index.ts:22` | ❌ | `DiagnosePage.tsx:897-918` | unreachable + always undefined |
| `lifestyle` | `types/index.ts:23` | ❌ | `DiagnosePage.tsx:927-943` | unreachable + always undefined |
| `recommendation` | `types/index.ts:24` | ✅ | `DiagnosePage.tsx:878-880` | live (this is why the cards above never show) |
| `ml_prediction` | not declared | ✅ | — | returned but discarded by the frontend |

The `recommendation` truthiness check at `DiagnosePage.tsx:878` makes the herbs/lifestyle/reasoning
branch unreachable in practice. **The most prominent "analysis" panels on the result screen are
permanently empty.** This is the Phase 6 target.

### 3.2 Model output is stored under a name that misdescribes it

`frontend/src/services/firestore.ts:168` writes `mlPrediction: input.result.prediction` — i.e. the
*gated* prediction, not the backend's separate `ml_prediction` field. The stored field name implies
the raw model label when it may hold the neutralised one.

### 3.3 The dosha quiz produces a value outside the encoder vocabulary

`DiagnosePage.tsx:152-171` composes `"Vata 40%, Pitta 30%, Kapha 30%"` and assigns it to
`formData.dosha`; `runAnalysis` passes it to `Body_Type_Dosha_Sanskrit` (`:208`) only for the six
display labels (`doshaMap`, `:186-197`). The quiz string bypasses the map, is normalised to a
fallback by `normalize_categoricals`, and is persisted to the patient and the assessment. History
then shows a dosha the model never saw.

### 3.4 Stale source comment and default

`backend/api/routes/health.py:23-24` — comment says the value "resolves to 'Random Forest'" and the
`model_components.get("model_type", "Random Forest")` default names a model that is no longer
deployed. Behaviour is correct (the artifact supplies the real name); the comment and default are not.

### 3.5 LLM may overrule the model and invent a confidence figure

`backend/ai/prompts.py:31` instructs the LLM to "determine the final diagnosis" and permits it to
"correct" the model; `:39` asks for a `[Confidence Level: in %]`. The UI renders that prose beside
the ML confidence, so two different confidence numbers can appear, and a re-diagnosis can contradict
the recorded prediction. `ARCHITECTURE_PLAN.md:238-240` already flags this as unfixed.

### 3.6 Provider error detail leaks to the client

`backend/ai/gemini_service.py:42` appends `(Details: {last_error})` to the user-visible message. The
module's own docstring (`:8-12`) flags this for later phases. It exposes internal provider state.

---

## 4. Authorization gaps in `firestore.rules`

Both were found by reading the rules; neither is covered by the current emulator suite.

1. **`patient_logs` create does not bind `clinicId` to the caller.** `firestore.rules:208-210`
   requires only `request.resource.data.clinicId is string`. A signed-in user can therefore write a
   diary entry into **any** clinic's feed, where the owning practitioner will read it
   (`:203-206` doctor branch matches on `clinicId`). The `patients` and `assessments` rules bind
   `clinicId` to `myClinic()`; this one does not. **Genuine cross-tenant write.**
2. **Any signed-in user may read any invite by code.** `firestore.rules:143` allows `read` for
   `isSignedIn()`. Invites are the doctor-registration capability, so enumerable read access leaks
   which codes exist and their `clinicId`. (Redemption is still constrained by `inviteGrants`.)

---

## 5. Unhandled / missing states

| Location | Issue |
|---|---|
| `frontend/src/hooks/useAuth.ts:18-32` | No `try/catch`. A failed `users/{uid}` read leaves `authLoading === true` forever → app stuck on "Initializing Secure Portal". |
| `frontend/src/pages/PatientsPage.tsx:31` | `if (!userData?.clinicId) return;` without `setLoading(false)` → permanent spinner. `DashboardPage.tsx:27-30` handles the same case correctly. |
| `frontend/src/pages/LoginPage.tsx:233,303` | Submit button not disabled while in flight → double-submit possible. |
| `frontend/src/pages/PatientCheckupPage.tsx:22` | Early-returns silently when unauthenticated; an unlinked patient can still submit a log with `patientId: ""`. |
| `frontend/src/pages/ProfilePage.tsx:16` | `useState` seeds the patient-code input once; `userData` arrives later, so the input never reflects a link made in another session. |

---

## 6. Dead code, dead files, stale docs

### 6.1 Files that are dead or broken

| File | Verdict | Evidence |
|---|---|---|
| `demo.py` | **DEAD/BROKEN** | imports `ArogyaAI` from `arogya_predict`, a class that has never existed (`arogya_predict.py` exports `ArogyaAIPredictor`) |
| `disease_prediction_system.py` | **DEAD** | 510 lines, imported only by the all-mock test; no live reference |
| `test_disease_prediction.py` | **DEAD** | mocks every dependency via `sys.modules[...]=MagicMock`; asserts nothing real |
| `README.tmp.md` | **DEAD** | tracked scratch copy of an older README |
| `templates/index.html` | **DEAD** | 12 KB template, no code reads `templates/` |
| `presentation_screenshots/` | **HISTORICAL** | 12 PNGs of the pre-rebuild UI; not referenced by code |
| `venv/`, `backend/venv/` | **DEAD (untracked)** | two virtualenv trees in the working tree; not tracked |
| `.uv8000.log` | **DEAD (untracked)** | stray log; `*.log` is already gitignored |

### 6.2 Living documentation that makes false claims

Classified as living (must describe current behaviour) vs historical (allowed to describe the past).

| Document | Verdict | Worst offenders |
|---|---|---|
| `FALLBACK_MECHANISM.md` | **STALE — almost entirely false** | documents `load_ayurvedic_database()` and `get_fallback_recommendations()`, which **do not exist** (verified by grep); a `test_fallback.py` that **does not exist**; "100% accuracy"; "HIPAA-friendly"; "Works in air-gapped environments"; "Status: ✅ Production Ready" |
| `README_PREDICTION_SYSTEM.md` | **STALE** | "99.5% accuracy"; "889 symptom features"; "901 total"; RF 100% / LR 99.5% / SVM 95%; "10+ diseases" (actual 399) |
| `README.md` | **PARTIALLY STALE** | "Random Forest" as the deployed model (`:32,55,76,151,213`); "SVM … trained and compared" (`:335`) though `ml/train.py` trains RF+LR only; "Confidence Calibration ✅ DONE" (`:461`) though `MODEL_CARD.md:160-164` says none is applied; "Integration with real medical datasets ✅ DONE" (`:491`) contradicting `MODEL_CARD.md:49-51`; lists `test_fallback.py` (`:470`), which does not exist |
| `DEMO_GUIDE.md` | **STALE** | RF/100%/889 (`:5,15,27,54,85`); "rule-based database" fallback (`:70-71`); "high statistical precision" (`:60`) |
| `ARCHITECTURE_PLAN.md` | **STALE header** | claims to describe "the current state (verified in Phase 0)" but its current-state sections predate the rebuild (App.tsx "2120 lines", `random_forest_model.pkl` "1105 MB", "firestore.rules ← DOES NOT EXIST") |
| `MODEL_CARD.md` | **ONE DEFECT** | `:124-127` labels the deployed row "Random Forest" with RF's numbers, contradicting `:89` and `:136-146` |
| `SECURITY.md` | **SOUND** | one naming slip: `:215` says `AUTH_REQUIRED`, the env var is `AROGYA_AUTH_REQUIRED` |
| `.env.example`, `CONTRIBUTING.md` | **CLEAN** | verified against `config.py` |

Historical documents (`PROJECT_AUDIT.md`, `PROJECT_BASELINE.md`, `PHASE_*.md`, `THIRD_REVIEW_PREP.md`,
`AyurCore.ipynb`) deliberately describe past states and are **not** to be rewritten.

### 6.3 TODO / FIXME inventory

No `TODO`, `FIXME`, `XXX` or `HACK` markers exist in first-party code (`backend/`, `frontend/src/`,
`ml/`, `tests/`). Every match was inside `backend/venv/**/pip/` (third-party). The unfixed items in
this project are recorded in prose (module docstrings, phase reports), not as markers.

---

## 7. Dependency audit

`requirements.txt` — used: `pandas`, `numpy`, `scikit-learn`, `joblib`, `google-generativeai`,
`python-dotenv`, `fastapi`, `uvicorn`, `pydantic`, `imbalanced-learn` (SMOTE comparison in
`ml/train.py`), `httpx` (transitive requirement of `fastapi.testclient`).

**Unused:** `pytest` — every suite uses `unittest`. It is a real dependency of nothing.
Missing from the file: `pyjwt` and `cryptography`, both **imported by `backend/core/security.py`**.
They resolve today only because `google-generativeai` pulls them in transitively; that is fragile.

---

## 8. Security posture

Verified controls: token verification (strict), role-from-document with invite gating, immutable
`role`/`clinicId`/`email`, clinic-scoped reads, append-only assessments, catch-all deny, CORS
allowlist (no wildcard).

Open items (all fixable in this engagement):

| # | Item | Severity |
|---|---|---|
| S1 | `patient_logs` create does not bind `clinicId` to the caller (§4.1) | **High** — cross-tenant write |
| S2 | Any signed-in user can read any invite (§4.2) | Medium — capability enumeration |
| S3 | No rate limiting on `POST /api/predict`, the one expensive, token-gated endpoint | Medium |
| S4 | Provider error text reaches the client (§3.6) | Low-Medium — info leak |
| S5 | `AROGYA_AUTH_REQUIRED=false` disables verification; it is explicit and documented, but must never reach production | Low (by design) |
| S6 | Live Firestore rules deployment status | **UNVERIFIED** — cannot be checked without Firebase credentials |

---

## 9. ML posture

- Pipeline is leak-free: split first, fit encoders/TF-IDF/scaler on train only, select by 3-fold CV
  on train only, one evaluation on the untouched test split (`ml/train.py:250-340`).
- Deployed artifact matches its metadata: LR, `v3-cv-selected`, 399 classes, 819 features,
  2,680,914 B, SHA-256 `e000590b…` (re-verified this pass).
- Metrics are honest and self-consistent: accuracy 0.8859, macro-F1 0.8372, weighted-F1 0.8761.
- **Confidence is uncalibrated.** `max(predict_proba)` is presented as a percentage
  (`backend/ml/predictor.py:14`). `MODEL_CARD.md:155-167` states this honestly; the UI does not
  qualify it. The 35 % gate is an inherited heuristic, not a validated threshold.
- CV is mildly optimistic (preprocessing fitted once outside the fold), already disclosed in
  `MODEL_CARD.md`.
- Explainability: **none produced**. Coefficients exist (`coef_` shape `(399, 819)`), so genuine
  per-prediction contributions are technically available — this is Phase 6.

---

## 10. Deployment posture

Config present and internally consistent: `firebase.json` (rules + emulators), `.firebaserc`
(`arogyaai-cloud-ad667`), `render.yaml` (`uvicorn backend.index:app`), `vercel.json` (frontend
build), `.env.example`.

**UNVERIFIED (no credentials/access in this environment):** live Firestore rules deployment, live
Firebase auth configuration, Render backend deployment, Vercel frontend deployment, browser
end-to-end run. These must be documented as manual steps, not claimed as done.

Note: `render.yaml` pins `PYTHON_VERSION 3.10.12` while the artifact's metadata records Python 3.14.5
and scikit-learn 1.9.0. The artifact is a pickle; loading it under an older scikit-learn than it was
fitted with is a real risk and must be checked or documented.

---

## 11. UX and performance

Bundle warning: the production build emits a single 786 kB chunk (240 kB gzip) and Vite warns about
it. Prediction latency was previously measured (0.32 ms) — those numbers were taken on the prior
turn's machine and, if retained anywhere, must carry their environment or be re-measured.

Accessibility basics are largely absent (icon-only buttons without `aria-label`), noted but not
prioritised over correctness.

---

## 12. Classification of the required search terms

| Term | Classification |
|---|---|
| `random_forest_model` (as artifact path) | **DEAD** — file does not exist; only historical docs and intentional "filename history" notes mention it |
| `Random Forest` (as deployed model) | **STALE** in README.md, DEMO_GUIDE.md, MODEL_CARD.md §124-127, `health.py:23` |
| `fallback` | **DEAD** in `FALLBACK_MECHANISM.md` and `README_PREDICTION_SYSTEM.md`; **INTENTIONAL** as the Gemini model-fallback chain in `gemini_service.py` |
| `mock` | **INTENTIONAL** — test doubles in `tests/test_backend_api.py` and `tests/test_security.py`; tests patch the LLM and the cert fetch, not the security control under test |
| `placeholder` | **INTENTIONAL** — HTML `placeholder=` attributes on form inputs |
| `coming soon` | **DEAD** — the orphaned `/my-records` route (`AppShell.tsx:96-106`) |
| `demo` | **DEAD** — `demo.py`; also `DEMO_GUIDE.md` (STALE) |
| `temporary` / `hardcoded` | **INTENTIONAL** — prose in `config.py:4`, `DashboardPage.tsx:17` |
| old Firebase project IDs | **NONE** — every live reference uses `arogyaai-cloud-ad667`; the bare `arogyaai-cloud` appears once as a historical risk note in `ARCHITECTURE_PLAN.md:271` |
| old API paths | **NONE live** — `/api/model/info` appears only as a planned target in `ARCHITECTURE_PLAN.md:188-190` |

---

## 13. Work plan derived from this audit

| Phase | Deliverable |
|---|---|
| 6 | Genuine per-prediction contributions from the LR coefficient matrix; API field; real AI X-Ray UI; tests proving the maths |
| 7 | Reconcile `AnalysisResult` with the real response; delete the phantom fields; fix the stored-prediction naming |
| 8 | Auth/authorization flow verification; fix the missing states in §5 |
| 9 | Fix S1 and S2 in `firestore.rules`; add emulator coverage; document live deployment as manual |
| 10 | Legacy per-diagnosis records: deterministic migration plan or documented blocker (no auto-merge) |
| 11–12 | Artifact/metadata re-verification; label confidence honestly everywhere |
| 13–14 | Remove the provider-error leak; add rate limiting; error-envelope consistency |
| 15–16 | Remove dead UI and dead files; measure latency honestly |
| 17–19 | Full test matrix; documentation truthfulness pass; deployment runbook |
| 20–24 | Adversarial review; cleanup; full verification; final report |

---

## 14. Unresolved assumptions carried into the work

> **Resolution note (added later, record preserved).** These were the open
> assumptions at audit time. What subsequently happened to each:
>
> 1. **Resolved.** The rules suite was executed against the emulator with Temurin
>    JRE 21 and passes **59/59** (was 54 at audit time; +2 authorization
>    regressions, +3 query-level tests). `java` was installed but not on `PATH`.
> 2. **Still unresolved.** No live deployment could be inspected.
> 3. **Resolved.** The dataset SHA-256 was recomputed and matches the recorded
>    `dataset_sha256` exactly.
> 4. **Still unresolved.** No project access; Phase 10 remains a plan.

1. That the emulator rules suite still passes (not re-run in this pass).
2. That no live deployment diverges from the repository configuration (unverifiable here).
3. That the 4,201-row dataset is the one the artifact was trained on — supported by the recorded
   `dataset_sha256`, but the file itself has not been re-hashed in this pass.
4. That no legacy per-diagnosis patient documents exist in the live project — unverifiable without
   access. Phase 10 therefore produces a plan, not a migration.
