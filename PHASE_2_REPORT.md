# ArogyaAI — Phase 2 Report: Backend Architecture

**Branch:** `feature/final-year-rebuild` · **Previous commit:** `f23ca3f`
**Constraint honoured:** structure refactored, **API behaviour unchanged** (proven in §5).

---

## 1. Objective

Replace the single 212-line `backend/index.py` — where routes, validation, model
wiring and config all lived together — with a layered structure, while keeping
`GET /`, `GET /api/health` and `POST /api/predict` byte-for-byte identical and
keeping the Render entry point working.

---

## 2. Files created (17)

| File | Purpose |
|---|---|
| `backend/__init__.py` | makes `backend` an explicit package (was an implicit namespace package) |
| `backend/main.py` | app factory `create_app()`; CORS + router registration; clean entry point |
| `backend/core/config.py` | env-driven settings: model path, Gemini key + model chain, confidence threshold, CORS origins |
| `backend/core/logging.py` | the `arogyaai` logger |
| `backend/core/exceptions.py` | `ArogyaError` / `PredictionError` / `AIProviderError` |
| `backend/ml/model_loader.py` | single load of the pickle; one source of truth for `model`/`encoders`/… |
| `backend/ml/preprocessing.py` | `derive_age_group`, `normalize_categoricals`, `preprocess_input` (moved verbatim) |
| `backend/ml/predictor.py` | `predict()` → `(label, confidence)` |
| `backend/schemas/prediction.py` | `PredictRequest`, `PredictResponse`, the seven `VALID_*` sets |
| `backend/schemas/common.py` | `RootResponse`, `HealthResponse` |
| `backend/services/prediction_service.py` | orchestration: normalise → preprocess → predict → gate → AI |
| `backend/ai/prompts.py` | `build_prompt()` (moved verbatim) |
| `backend/ai/gemini_service.py` | `get_llm_validation_and_explanation()` with model fallback chain |
| `backend/api/routes/health.py` | `GET /`, `GET /api/health` |
| `backend/api/routes/prediction.py` | `POST /api/predict` |
| `backend/{api,api/routes,core,ml,schemas,services,ai}/__init__.py` | package markers |
| `PHASE_2_PLAN.md` | plan, design decisions, risks, rollback |

## 3. Files modified (4)

| File | Change |
|---|---|
| `backend/index.py` | **212 lines → compatibility shim.** Re-exports `app` and the legacy names so `uvicorn backend.index:app` and existing imports keep working |
| `arogya_predict.py` | **302 → ~170 lines.** Logic moved to `backend.*`; this keeps the documented CLI (`python arogya_predict.py`) and re-exports `model`, `encoders`, `preprocess_input`, … |
| `tests/test_backend_api.py` | Patch targets repointed (see §4) — **assertions untouched** |
| `requirements.txt` | added `imbalanced-learn`, `httpx`, `pytest` (genuinely missing: the suite could not run, and `train_model.py` imports `imblearn`) |

## 4. Behaviour-affecting edits (the only two)

1. **Test mock targets moved with the call sites.** The Gemini call now resolves in
   `services/prediction_service.py` and inference in `ml/predictor.py`, so
   `@patch("backend.index.*")` no longer intercepted anything — one test made a
   **real** Gemini request (43.5 s) and failed on live output. Repointed to
   `backend.services.prediction_service.get_llm_validation_and_explanation` and
   `backend.ml.predictor.model.predict_proba`. Assertions were not changed.
   Runtime fell to **0.153 s**, which confirms the mocks intercept again.
2. **`/api/health` `model` is now read from the artifact** (`model_components["model_type"]`)
   instead of the literal `"Random Forest"`. The artifact stores exactly
   `"Random Forest"`, so the response is unchanged — but it is no longer hardcoded.

No other logic changed.

## 5. Verification — API behaviour before vs after

A deterministic capture script pinned 11 cases (status + exact JSON) with Gemini
stubbed, run **before** the refactor and again **after**:

```
$ diff _phase2_baseline.json _phase2_after2.json
IDENTICAL ✅
```

Cases covered: `/` · `/api/health` · predict (valid, low-confidence, unknown
categoricals) · invalid age / height / weight · empty symptoms · missing fields ·
malformed JSON. **Response bodies and status codes are byte-identical.**

| Check | Command | Result |
|---|---|---|
| Behaviour diff | `diff` of frozen captures | ✅ **IDENTICAL** |
| Test suite | `python -m unittest tests.test_backend_api` | ✅ **12/12 pass** (was 11/12 mid-refactor, fixed by §4) |
| New entry point | `uvicorn backend.main:app` :8012 | ✅ `/` 200, `/api/health` 399 diseases, invalid age **422** |
| Legacy entry point | `uvicorn backend.index:app` :8013 | ✅ `/api/health` 200, predict returns Inconclusive Data at 4% |
| App identity | `backend.main.app is backend.index.app` | ✅ **True** (shim serves the same object) |
| Legacy imports | `backend.index.model`, `.encoders`, `.derived_age_group`, `VALID_*` | ✅ all present |
| `arogya_predict` imports | `model`, `encoders`, `preprocess_input` | ✅ present (`ArogyaAI` absent — it never existed; `demo.py` stays broken until Phase 18) |
| Frontend build | `npm run build` | ✅ exit 0, bundle unchanged at 766.86 kB |

**Live Gemini integration:** exercised end-to-end. A real request returned a full
Ayurvedic plan — confirming the moved AI module still calls Gemini correctly.

## 6. Observations recorded (not fixed — out of Phase 2 scope)

1. **Gemini still invents a confidence figure.** The live call returned
   `Predicted Disease: Vata-Pitta Jwara … [Confidence Level: 92%]` while the ML
   confidence was different. Fresh evidence for Phase 7; the prompt template that
   causes it was moved verbatim, deliberately.
2. **The model artifact records `results = {"Random Forest": 1.0, …}`** — the
   leakage-inflated perfect score. Phase 5 owns the corrected evaluation.
3. **`demo.py` imports a class (`ArogyaAI`) that has never existed.** Confirmed
   again; scheduled for Phase 18 cleanup.
4. The Gemini failure message still appends the raw provider error (`Details: …`),
   visible to clients → Phase 12.

## 7. Remaining risks

| # | Risk | Status |
|---|---|---|
| R1 | The shim adds an import indirection for Render | Verified working; documented |
| R2 | Live Firestore rules still unknown | **Blocks Phase 3** |
| R3 | CORS still `*` with `allow_credentials=True` | Deliberately preserved; Phase 3 |
| R4 | `/api/predict` still unauthenticated | Phase 3 |
| R5 | Client-chosen role at registration | Phase 3 |
| R6 | `backend/utils/` and `backend/tests/` were **not** created | Intentional — no content belongs there yet |

## 8. Git

- **Commit:** Phase 2 changes committed on `feature/final-year-rebuild`.
- Rollback: `git revert <sha>` restores the previous backend; no database, model,
  dataset or frontend behaviour was modified by this phase.

## 9. Phase 3 recommendation

Proceed to **Phase 3 — Authorization & Security**, which requires:

1. The **current live Firestore rules** (Firebase console → Firestore → Rules).
   Without the text I cannot audit or safely replace them, and guessing rules is
   exactly what the brief forbids.
2. Then: server-controlled roles (default `patient`), versioned `firestore.rules` +
   `firebase.json`, Firebase ID-token verification on `/api/predict`, and tightening CORS.

*STOP — awaiting approval before Phase 3.*
