# ArogyaAI — Phase 5 Report: ML Methodology

**Branch:** `feature/final-year-rebuild` · **Previous commit:** `dd06a7c`
**Scope:** replace the leakage-contaminated trainer with a reproducible pipeline,
publish honest metrics, preserve the inference contract.
**Rule honoured:** the old artifact was not deleted until the new one was
verified; no application behaviour changed.

---

## 1. Files created (7)

| File | Purpose |
|---|---|
| `PHASE_5_ML_AUDIT.md` | leakage located by file and line |
| `PHASE_5_PLAN.md` | corrected pipeline design and the SMOTE finding |
| `MODEL_CARD.md` | purpose, data, methodology, metrics, limitations, reproducibility |
| `ml/__init__.py` | package marker |
| `ml/train.py` | the leak-free trainer (also writes metrics + metadata) |
| `ml/evaluate.py` | scores a persisted artifact on a held-out split |
| `tests/test_ml.py` | 20 tests: contract, determinism, inference compatibility |

`ml/artifacts/` (generated, tracked): `metrics.json`, `model_metadata.json`,
`confusion_matrix.json`.

## 2. Files modified (2)

| File | Change |
|---|---|
| `train_model.py` | 248 lines of leaking trainer → thin delegator to `ml/train.py`, so the documented `python train_model.py` still works |
| `random_forest_model.pkl` | replaced with the leak-free artifact (1,105 MB → 569 MB RF; after the `b556dc2` amendment, the deployed Logistic Regression is 2.7 MB) |

## 3. Files deleted

None. The previous artifact remains in git history (reachable via `git show`).

---

## 4. Methodology: before → after

**Before** (`train_model.py`, lines cited in `PHASE_5_ML_AUDIT.md`):

```
clean -> encode ALL rows -> TF-IDF fit on ALL rows -> SMOTE on ALL rows
      -> scale ALL rows -> THEN split -> train -> pick winner BY TEST SCORE
```

**After** (`ml/train.py`):

```
clean -> stratified split FIRST (80/20, seed 42)
      -> fit encoders + TF-IDF + scaler on TRAIN only
      -> select model by 3-fold CV (macro-F1) on TRAIN only
      -> final fit on TRAIN
      -> ONE evaluation on the untouched TEST split
```

Six leaks removed: encoder fitting (L1, L2), TF-IDF vocabulary (L3), SMOTE
(L4), scaler (L5), and model selection on the test set (L6).

## 5. Old contaminated metrics (withdrawn)

| Model | Reported accuracy | Verdict |
|---|---|---|
| Random Forest | **1.0000** | ❌ leakage-affected — not performance |
| Logistic Regression | 0.9964 | ❌ leakage-affected |
| SVM | 0.9417 | ❌ leakage-affected |

Recorded here for the record only. These must not be presented as results.

## 6. New untouched-test metrics

> **Amended by the follow-up review `b556dc2`.** Phase 5 originally deployed
> Random Forest despite it losing cross-validation. That override was reviewed
> and removed; the deployed model is now the cross-validation winner, **Logistic
> Regression**. The original Random Forest numbers are retained below for the
> record. Full evidence: `PHASE_5_MODEL_DECISION.md`.

Deployed model **Logistic Regression** (`v3-cv-selected`), 841-row held-out split:

| Metric | Value |
|---|---|
| Accuracy | **0.8859** |
| Macro precision | 0.8310 |
| Macro recall | 0.8651 |
| **Macro F1** | **0.8372** |
| Weighted precision | 0.8839 |
| Weighted recall | 0.8859 |
| Weighted F1 | 0.8761 |

94 of 841 rows misclassified.

For comparison, Random Forest on the same untouched split: accuracy 0.8502,
macro-F1 0.7946 (126 misclassified).

Cross-validation on the training split (the selection basis):

| Candidate | CV mean macro-F1 |
|---|---|
| Random Forest | 0.7684 |
| Logistic Regression | **0.8360** |

The deployed model is whichever wins cross-validation — there is no override
constant, so an architectural preference cannot displace the methodology. This
was corrected in `b556dc2` after review found no technical justification for
retaining Random Forest: the linear model was also better on inference latency
(0.32 ms vs 32.03 ms), artifact size (2.7 MB vs 596.6 MB) and per-prediction
explanation surface (399×819 coefficients vs 819 global importances).

## 6a. Original Phase 5 deployment (superseded)

| Metric (Random Forest) | Value |
|---|---|
| Accuracy | 0.8502 |
| Macro precision | 0.7899 |
| Macro recall | 0.8392 |
| Macro F1 | 0.7947 |
| Weighted precision | 0.8701 |
| Weighted recall | 0.8502 |
| Weighted F1 | 0.8418 |

126 of 841 rows misclassified.

## 7. The SMOTE finding

The brief specified SMOTE inside the CV pipeline. That proved **mathematically
impossible** for this dataset, and the probe that revealed it is worth recording:

- 399 classes; 51 have only **2** training rows after the split.
- A 3-fold CV training portion can therefore hold a class with **1** member.
- SMOTE needs `k+1 ≥ 2` neighbours → `ValueError: Expected n_neighbors <= n_samples_fit`.

Resampling once *before* CV would be the original leakage again (synthetic points
interpolated between training rows land in the folds used to score).

Resolution: imbalance is handled with `class_weight='balanced'` (no synthetic
data, safe inside CV). A SMOTE variant was still fitted on the training split and
scored once on the test set, for the record:

| Variant | Test accuracy | Test macro-F1 |
|---|---|---|
| Deployed (`class_weight='balanced'`) | 0.8502 | 0.7946 |
| SMOTE variant | 0.8656 | 0.8121 |

The SMOTE variant scored marginally higher but is **not** deployed: choosing it
would mean selecting on the test set, which is the defect being fixed.

## 8. Two bugs found and fixed in my own code

Both were caught by verifying rather than assuming:

1. **`--output` was ignored.** `main(output_path=…)` accepted the argument but the
   `joblib.dump` call still used the module constant, so a run intended for a
   staging path wrote to the root artifact instead. Fixed (dump site, byte-count
   site, and log line now all use `output_path`). Impact: the first run overwrote
   the root artifact early; no data was lost, since the previous artifact is
   recoverable from git.
2. **`model_type` reported the wrong model.** It was written from the CV winner
   (`best_name`) while the deployed estimator was the `DEPLOYED_MODEL` override.
   Since `backend/api/routes/health.py:24` reads that field, `/api/health` would
   have reported "Logistic Regression" while serving a Random Forest. Fixed by
   removing the override entirely (`b556dc2`): the deployed estimator *is* the
   CV winner, and `deployed_model` is recorded in `metrics.json`.
   `tests/test_ml.py` asserts the declared type matches the actual estimator
   class, so this cannot regress silently.

## 9. Tests run

| Suite | Command | Result |
|---|---|---|
| ML | `python -m unittest tests.test_ml` | ✅ **20/20 pass** |
| Backend (all) | `python -m unittest discover -s tests` | ✅ **52/52 pass** (32 prior + 20 ML) |
| Rules (emulator) | `cd tests/rules && node --test` | ✅ **54/54 pass** |
| TypeScript | `npx tsc -b` | ✅ exit 0 |
| Production build | `npm run build` | ✅ exit 0 |
| Backend startup | `uvicorn backend.main:app` | ✅ up in 4 s |
| `/api/health` | `curl` | ✅ 200, model name asserted against the loaded artifact (Logistic Regression post-`b556dc2`), 399 diseases |
| `/api/predict` unauthenticated | `curl` | ✅ **401** (Phase 3 control intact) |
| Evaluation tool | `python ml/evaluate.py` | ✅ full metric set on the untouched split |

New ML tests cover: required artifact keys, `model_type` matching the real
estimator, encoder coverage, the 819-feature dimension, preprocessing
determinism, BMI derivation, age-group boundaries, unseen-categorical
normalisation, prediction shape, confidence range, label validity, prediction
determinism, and a guard asserting the recorded accuracy is not exactly 1.0.

## 10. Artifact

| Property | Value |
|---|---|
| Version | `v3-cv-selected` (amended by `b556dc2`; the superseded Phase 5 artifact was `rf-v2-leakfree`) |
| SHA-256 | `e000590b7cd745a6c2b375568a62ed57ee4e3ee35376aaf68a368ffcf6ecadd0` (the RF artifact was `19b0beca…`) |
| Size | 2,680,914 bytes (~2.7 MB), down from 596,609,130 bytes (~569 MB) and ~1,105 MB originally |
| Feature dimension | 819 (12 structured + 807 TF-IDF) |
| Inference contract | **unchanged** — `model`, `scaler`, `vectorizer`, `encoders`, `feature_columns` |

No change was made to the frontend, Firestore schema, authentication, Gemini
prompting, or the API response shape. `test_ml.py` plus the existing 52 backend
tests confirm the contract still holds.

## 11. Unresolved risks / items needing the owner's attention

1. **~~Deployed model is not the CV winner~~ — resolved by `b556dc2`.** The
   override was removed; the deployed model is the CV winner by construction
   (§6). No owner decision remains pending.
2. **Confidence is still uncalibrated.** `max(predict_proba)` is reported as a
   percentage; no calibration has been applied, so it likely over-states
   certainty. The 35% gate is an inherited safety heuristic, not a validated
   threshold. Calibration is future work.
3. **CV is slightly optimistic** — TF-IDF and the scaler are fitted once on the
   training split rather than per fold. No test contamination, but a fully nested
   pipeline would refit per fold. Flagged in `MODEL_CARD.md` §9.
4. **Label-synonym confusions** (`Crohn Disease` → `Inflammatory Bowel Disease`,
   `Type 1/2 Diabetes` ↔ `Diabetes Type 1/2`) are a dataset artefact that caps
   accuracy and understates practical usefulness for those pairs.
5. **The artifact is still tracked in git, now at ~2.7 MB** (was 569 MB). At this
   size tracking it is defensible; the original 1,105 MB blob remains in git
   history. Externalising large blobs is a later phase (17/22) if ever needed.
6. **No browser end-to-end run** was performed; verification is at the test,
   build and HTTP-contract level.

## 12. Git

Committed on `feature/final-year-rebuild`.

## 13. Phase 6 recommendation

**Explainability** — produce real per-prediction attributions so the frontend's
"AI X-Ray" panel can be populated with genuine model-derived data rather than
the empty placeholders it currently renders. `AnalysisResult.xai_breakdown` is
declared in the frontend types but never produced by the API. With the
`b556dc2` amendment the deployed model is Logistic Regression, whose 399×819
coefficient matrix gives an exact per-prediction contribution for every
feature (positive/negative class evidence), rather than the 819 global tree
importances the Random Forest offered.

*STOP — awaiting approval before Phase 6.*
