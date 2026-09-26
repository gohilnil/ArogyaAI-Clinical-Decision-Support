# ArogyaAI — Phase 2 Implementation Plan (Backend Architecture)

**Branch:** `feature/final-year-rebuild` · **Previous commit:** `f23ca3f`
**Constraint:** refactor structure only — **zero API behaviour change**.

---

## 1. Current backend (inspected)

```
backend/index.py   212 lines — the ONLY backend file
  ├─ FastAPI app + CORS (allow_origins includes "*", allow_credentials=True)
  ├─ VALID_GENDERS / VALID_DOSHAS / VALID_FOOD_HABITS / VALID_MEDICATIONS / ALLERGIES / SEASONS / WEATHER
  ├─ derive_age_group()
  ├─ PredictRequest (Pydantic, with field validators)
  ├─ POST /api/predict   (normalise → preprocess → predict → gate → Gemini)
  ├─ GET  /
  └─ GET  /api/health

arogya_predict.py  302 lines — imported BY index.py
  ├─ module-level joblib.load  (model, scaler, vectorizer, encoders, feature_columns)
  ├─ GEMINI_MODELS fallback list
  ├─ preprocess_input()
  ├─ get_llm_validation_and_explanation()   (inline prompt template)
  ├─ get_safe_number_input() / main()  ← CLI only
  └─ if __name__ == "__main__"
```

`backend/` is a **namespace package** (no `__init__.py`). It works today but is implicit.

### Consumption of the current module surface

| Consumer | Imports |
|---|---|
| `tests/test_backend_api.py` | `backend.index`: `app`, `derive_age_group`, `VALID_GENDERS`, `VALID_DOSHAS`; `arogya_predict`: `preprocess_input`, `model`, `encoders` |
| `render.yaml` | starts `uvicorn backend.index:app` |
| `demo.py` | `arogya_predict.ArogyaAI` (already broken — Phase 18) |

**These import paths must keep working.**

### Behaviour frozen before refactor

`_phase2_baseline.json` pins 11 cases (status + exact JSON body): `/`, `/api/health`,
predict (valid / low-confidence / unknown categoricals), invalid age/height/weight,
empty symptoms, missing fields, malformed JSON. `tests/test_backend_api.py` = **12/12 pass**.

---

## 2. Target structure

```
backend/
  __init__.py                     # make the package explicit
  main.py                         # app factory, CORS, router registration, error handlers
  index.py                        # COMPAT SHIM → re-exports app + legacy names
  core/
    config.py                     # env-driven Settings (no hardcoded secrets/config)
    logging.py                    # "arogyaai" logger
    exceptions.py                 # typed application errors
  api/
    routes/
      health.py                   # GET /
      prediction.py               # POST /api/predict, GET /api/health
  schemas/
    prediction.py                 # PredictRequest, PredictResponse, VALID_* sets
  services/
    prediction_service.py         # orchestration: normalise → predict → gate → AI
  ai/
    prompts.py                    # build_prompt()
    gemini_service.py             # get_llm_validation_and_explanation()
  ml/
    model_loader.py               # joblib load (single source of truth)
    preprocessing.py              # derive_age_group + preprocess_input
    predictor.py                  # predict(features) → (label, confidence)
```

**Intentionally omitted:** `backend/utils/` and `backend/tests/` — nothing belongs
there yet; putting empty scaffolding in is exactly the appearance-driven complexity
the brief forbids. Tests stay in root `tests/` and are reorganised in Phase 11.

---

## 3. Key design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | `backend/index.py` becomes a **shim** re-exporting `app` + legacy names | `render.yaml` and the test suite keep working with no change |
| D2 | `arogya_predict.py` becomes a thin **CLI + re-export** layer | Test imports (`preprocess_input`, `model`, `encoders`) keep working |
| D3 | Model loaded **once** in `ml/model_loader.py`; other modules import the same object | `patch.object(model, "predict_proba")` still affects the real call site |
| D4 | Gemini function imported by name into `prediction_service` | Test patch target moves with the code (documented; assertions unchanged) |
| D5 | CORS origins, threshold, models, key all move to `core/config.py` with **defaults identical to today** | Configurable without changing behaviour |
| D6 | `preprocess_input`, `derive_age_group`, `get_llm_validation_and_explanation` moved **verbatim** | No ML methodology change (Phase 5 owns that) |
| D7 | Confidence threshold stays a literal default of `35.0` in config | Preserves the gate exactly |

### Behaviour-preservation risks

| Risk | Mitigation |
|---|---|
| Model path breaks when loader moves down a directory | Resolve `MODEL_PATH` from `core/config.py` as `parents[2]/random_forest_model.pkl` |
| Test patch on `backend.index.get_llm_validation_and_explanation` stops intercepting | Update patch target to the real call site in `prediction_service`; assertions untouched |
| Model load failure path changes | Keep the same console messages + `SystemExit` (server still refuses to start) |
| CORS headers differ | Keep the identical default origins list including `*` (tightened in Phase 3) |

---

## 4. Verification protocol

1. `python _phase2_capture.py _phase2_after.json` → `diff` against `_phase2_baseline.json` (**must be empty**).
2. `python -m unittest tests.test_backend_api` → 12/12.
3. Start `uvicorn backend.main:app` → probe `/`, `/api/health`, `/api/predict`, a validation error, low-confidence.
4. Start `uvicorn backend.index:app` → confirm the shim still serves (Render compatibility).
5. `npm run build` → no frontend regression.
6. Real (unpatched) Gemini call → confirm live integration still works.

## 5. Rollback

Single commit on a feature branch. `git revert <sha>` restores the working backend.
Model, dataset, Firestore and frontend behaviour are untouched by this phase.
