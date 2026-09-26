# ArogyaAI — Phase 5 Plan: Leak-Free ML Pipeline

**Goal:** replace the leakage-contaminated training/evaluation with a
reproducible pipeline, **preserving the inference contract** so the backend,
frontend, Firestore schema and Gemini layer are untouched.

---

## 1. Target pipeline

```
raw CSV (4201 × 27)
   ↓  clean (required cols, coerce numerics, fill medians, normalise text)
deterministic stratified split   ← FIRST, before any fitting
   ├── train  (80%)                                  test (20%)
   ↓                                                   │
fit encoders (8 cats + Disease) on TRAIN only          │
fit TfidfVectorizer on TRAIN symptoms only             │
fit StandardScaler on TRAIN combined features only     │
   ↓                                                   │
SMOTE on TRAIN only                                    │
   ↓                                                   │
model selection by cross-validation on TRAIN only      │
   ↓                                                   │
final fit of the selected model on TRAIN               │
   ↓                                                   │
                                       ONE evaluation on the untouched test
```

**Invariant:** nothing derived from the test split may influence the vocabulary,
encoders, scaler, SMOTE, feature set, hyperparameters or model choice.

## 2. Making it structural, not disciplinary

| Step | Mechanism |
|---|---|
| Split before fitting | split is the first operation on the cleaned frame |
| SMOTE inside CV folds | `imblearn.pipeline.Pipeline([('smote', SMOTE), ('clf', …)])` scored with `cross_val_score`, so resampling never crosses a fold boundary |
| Model selection | `cross_val_score(..., scoring='f1_macro', cv=StratifiedKFold(5))` on training data only |
| Test use | a single `evaluate_on_test()` call, after the model is frozen |

**Residual, stated honestly:** the TF-IDF vocabulary and scaler are fitted once on
the whole training split before CV, rather than refitted per fold. This is
train-only, so there is **no test contamination**; a fully nested pipeline would
refit per fold at several times the cost for a small, documented difference. This
is recorded in `MODEL_CARD.md` rather than glossed over.

## 3. Preserved inference contract (non-negotiable)

The persisted artifact must keep exactly these keys, consumed by
`backend/ml/model_loader.py` and `backend/ml/preprocessing.py`:

```
"model"            .predict() / .predict_proba()
"scaler"           .transform() / .get_feature_names_out()
"vectorizer"       .transform()
"encoders"         {8 categorical cols + "Disease"} -> LabelEncoder
"feature_columns"  the 12 structured column names
```

The returned array must remain `(1, 819)`. New keys may be **added** (metadata)
but none may be removed or renamed.

## 4. Hyperparameters

Unchanged from the original so that the *methodology* is the only thing that
changes and the before/after comparison is fair:

- `RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)`
- `LogisticRegression(random_state=42, max_iter=1000)`
- `SVC(kernel='rbf', probability=True, random_state=42)`
- `SMOTE(random_state=42, k_neighbors=<from training split>)`

`k_neighbors` is computed from the **training** split's smallest class (not the
full dataset, which was another subtle leak).

## 5. Deliverables

| File | Purpose |
|---|---|
| `ml/train.py` | the canonical leak-free trainer; writes artifact + metrics |
| `ml/evaluate.py` | loads an artifact, reports the full metric set on a held-out split |
| `ml/artifacts/` | new artifact + `metrics.json` + `model_metadata.json` |
| `train_model.py` | becomes a thin shim delegating to `ml/train.py` (documented command still works) |
| `MODEL_CARD.md` | purpose, data, methodology, metrics, limitations, version |
| `tests/test_ml.py` | determinism, artifact loading, prediction shape, confidence range |

## 6. Verification plan

1. `python ml/train.py` → artifact + metrics
2. `python ml/evaluate.py` → prints the full metric set, incl. per-class and
   confusion matrix
3. `python -m unittest tests.test_ml` → ML tests
4. `python -m unittest discover -s tests` → backend tests still pass
5. rules tests (emulator), `tsc -b`, `npm run build`
6. backend startup; `/api/health`; authenticated `/api/predict`

## 7. Safety

- The old artifact is **not deleted** until the new one loads and predicts correctly.
- No deployment, no Firestore writes, no frontend/Gemini/API-shape changes.
- Rollback: revert the commit; the previous artifact is untouched in git history.
