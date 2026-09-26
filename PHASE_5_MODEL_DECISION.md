# ArogyaAI — Phase 5 Model-Selection Review

> Focused review of the model-selection decision taken in Phase 5. **Outcome:
> the override was removed; the cross-validation winner is now deployed.**
> No further optimisation against the test set was performed, and no repeated
> experiments were run to obtain a preferred number.

---

## 1. What was reviewed

Phase 5 shipped a leak-free pipeline but pinned the deployed estimator to Random
Forest (`DEPLOYED_MODEL`) even though Logistic Regression won cross-validation.
The stated reason was that Random Forest is "the project's established
architecture". That is a preference, not evidence, so the decision was re-opened.

## 2. Verification of the selection code (`ml/train.py`)

| Question | Finding | Evidence |
|---|---|---|
| How were CV scores computed? | `cross_val_score(estimator, X_train, y_train, cv=cv, scoring="f1_macro")` | lines 295–302 |
| Identical folds for both models? | Yes — one `StratifiedKFold(3, shuffle=True, random_state=42)` reused for both | line 282 |
| Is preprocessing fair between models? | Yes — both receive the **same** `X_train` / `X_test` matrices; there is no per-model preprocessing | lines 269–270, 317 |
| Was the test set used for model selection? | **No.** `best_name = max(cv_results, key=…)` reads CV results only | line 306 |
| Is the test set used for hyperparameters? | **No.** No `GridSearchCV`, `RandomizedSearchCV`, `optuna` or `hyperopt` exists anywhere in the repo (grep-verified) |
| When is the test set first touched? | line 318 — after selection, purely to report | lines 315–320 |

**Conclusion: the selection methodology was sound.** The override was applied
*after* a correct CV comparison, not instead of one.

## 3. Independent reproduction

Both models were re-fitted and re-scored from the deterministic pipeline, and the
resulting metrics matched the saved `metrics.json` exactly:

| Model | Reproduced accuracy | Reproduced macro-F1 | metrics.json |
|---|---|---|---|
| Random Forest | 0.8502 | 0.7946 | 0.8502 / 0.7946 ✅ |
| Logistic Regression | 0.8859 | 0.8372 | 0.8859 / 0.8372 ✅ |

The reported figures are reproducible, not artefacts of a single run.

## 4. Is there any legitimate technical reason to retain Random Forest?

Every axis was measured. A diagnostic script (since deleted) compared properties
that are **independent of test performance**, so this was not tuning against the
test set:

| Property | Random Forest | Logistic Regression | Favours |
|---|---|---|---|
| CV macro-F1 (the selection metric) | 0.7684 | **0.8360** | LR |
| Test accuracy | 0.8502 | **0.8859** | LR |
| Test macro-F1 | 0.7946 | **0.8372** | LR |
| Converged within `max_iter=300` | n/a | ✅ 149 iterations | — |
| Inference latency (1 row, pred+proba) | 32.03 ms | **0.32 ms** | LR (~100×) |
| Artifact size (model + preprocessors) | 596.6 MB | **2.7 MB** | LR (~220×) |
| Explanation surface | 819 global importances | **399 × 819 per-class coefficients** | LR |

**No technical justification for Random Forest was found.** The one argument
originally offered — that Phase 6 (explainability) depends on tree feature
importances — is **weaker, not stronger**, for the tree model:

- Random Forest exposes `feature_importances_`: 819 **global** values, identical
  for every patient and every prediction. It cannot answer "why *this*
  prediction for *this* patient?".
- Logistic Regression exposes `coef_` with shape **(399, 819)**: one coefficient
  vector per class. For a given prediction, the input features weighted by that
  class's coefficients give a genuine **per-prediction** attribution.

The only remaining argument was architectural preference, which the reviewer
explicitly rejected as insufficient.

## 5. Decision

**`DEPLOYED_MODEL` was removed.** The trainer now deploys whichever candidate
wins the `f1_macro` cross-validation, computed at runtime. There is no override
constant, so an architectural preference can no longer displace the corrected
methodology. A side benefit: `model_type` and the actual estimator can no longer
disagree, because both derive from the same value.

Changes made:

| File | Change |
|---|---|
| `ml/train.py` | `DEPLOYED_MODEL` constant deleted; `SELECTION_METRIC = "f1_macro"` records the criterion; `model_type`, `metadata.model_type` and `metrics.deployed_model` all derive from the CV winner; `cv_winner` no longer recorded (it would always equal the deployed model) |
| `ml/train.py` | `MODEL_VERSION` `rf-v2-leakfree` → `v3-cv-selected` (the old name asserted an estimator that may change) |
| `tests/test_backend_api.py` | `/api/health` model-name assertion now compares against the loaded artifact instead of the literal `"Random Forest"` |
| `frontend/src/pages/HelpPage.tsx` | "Random Forest Machine Learning model" → "machine-learning classifier"; added that the model is CV-selected and that the system is decision support |
| `MODEL_CARD.md` | rewritten for the LR model and the new rationale |

## 6. Post-switch verification

| Check | Result |
|---|---|
| Artifact loads, contract keys present | ✅ `model`, `scaler`, `vectorizer`, `encoders`, `feature_columns` |
| `model_type` matches the estimator class | ✅ `"Logistic Regression"` ↔ `LogisticRegression` |
| Classes / feature dimension | ✅ 399 / 819 |
| `coef_` shape | ✅ (399, 819) |
| ML tests | ✅ **20/20** |
| Backend tests | ✅ **52/52** |
| Rules tests (emulator) | ✅ **54/54** |
| TypeScript / production build | ✅ exit 0 / exit 0 |
| `/api/health` | ✅ 200 — `"model":"Logistic Regression"`, 399 diseases |
| Prediction output shape | ✅ `(1, 819)` → label `"Diarrhea"`, confidence `98.27` (within 0–100) |
| Unauthenticated `/api/predict` | ✅ **401** (Phase 3 control intact) |

## 7. Selected model and metrics

**Deployed: Logistic Regression** (`v3-cv-selected`), selected by 3-fold
stratified cross-validation on the training split, scored by macro-F1.

| Metric | Value |
|---|---|
| Accuracy | **0.8859** |
| Macro precision | 0.8310 |
| Macro recall | 0.8651 |
| **Macro F1** | **0.8372** |
| Weighted precision | 0.8839 |
| Weighted recall | 0.8859 |
| Weighted F1 | 0.8761 |

Artifact: `arogyaai_model.joblib` (renamed from `random_forest_model.pkl` —
see §8), SHA-256
`e000590b7cd745a6c2b375568a62ed57ee4e3ee35376aaf68a368ffcf6ecadd0`,
**2.68 MB** (down from 1,105 MB for the original contaminated artifact).

Most frequent confusions remain label-synonym artefacts
(`Crohn Disease` → `Inflammatory Bowel Disease`, `Influenza` → `Flu`,
`Hepatitis B` ↔ `Hepatitis C`), which caps accuracy regardless of estimator.

## 8. Known cost of this change

- ~~The artifact filename is still `random_forest_model.pkl`~~ — **resolved**:
  the artifact is now `arogyaai_model.joblib`, a model-neutral name that no
  longer describes a specific estimator. The rename updated
  `backend/core/config.py`, `ml/train.py`, `.env.example`, `.gitignore` (the
  deployed artifact is un-ignored so re-trains overwrite the tracked file) and
  the living docs. The artifact bytes were not changed, so the SHA-256 is
  unchanged.
- Confidence is **still uncalibrated** (`max(predict_proba)`), and Logistic
  Regression probabilities on 399 heavily-imbalanced classes may be
  under-confident or over-confident in ways not yet measured. Unchanged by this
  review; calibration remains future work.
- The CV remains slightly optimistic (TF-IDF/scaler fitted once on the training
  split rather than per fold) — train-only, so no test contamination. Unchanged.
