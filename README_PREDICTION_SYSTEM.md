# ArogyaAI — Prediction System

**Status:** describes the current implementation at commit `2ab0df9`.

> **Replaced.** An earlier version of this file reported 99.5–100% accuracy, 889
> or 901 features, an SVM model, and 10+ supported diseases. Every one of those
> numbers was wrong. The accuracy figures came from a training pipeline that
> leaked the test set into preprocessing and model selection, and were formally
> withdrawn in Phase 5 (`PHASE_5_ML_AUDIT.md`). The feature count was never 889 or
> 901. No SVM is trained. The system predicts 399 labels, not 10. The withdrawn
> numbers must not be quoted anywhere.

## What the system does

Two stages, in this order:

1. **Model prediction** — a scikit-learn classifier scores the patient's
   structured profile plus their symptom text and returns one of **399**
   condition labels with a confidence value.
2. **Ayurvedic explanation** — Google Gemini turns that prediction into an
   Ayurvedic narrative and supportive guidance. The model's own per-feature
   contributions are returned alongside it.

The prediction is decision support. It is not a diagnosis, and the confidence is
not a validated probability (see [Confidence](#confidence) below).

## The model, accurately

| Property | Value |
|---|---|
| Estimator | **Logistic Regression** (multinomial) |
| Version | `v3-cv-selected` |
| Classes | 399 |
| Features | **819** = 12 structured + 807 TF-IDF |
| Artifact | `arogyaai_model.joblib` (2,680,914 bytes) |
| Selection | highest 3-fold CV macro-F1 on the training split |

Random Forest is trained alongside it as a comparison candidate and is **not**
deployed — it lost cross-validation (macro-F1 0.7684 vs 0.8360) and was worse on
test accuracy, latency and artifact size. There is no longer an override that can
deploy a model other than the CV winner.

## Measured performance

On an untouched 841-row test split, from the leak-free pipeline:

| Metric | Value |
|---|---|
| Accuracy | 0.8859 |
| Macro precision | 0.8310 |
| Macro recall | 0.8651 |
| **Macro F1** | **0.8372** |
| Weighted F1 | 0.8761 |

94 of 841 rows misclassified. These are the authoritative figures. Full detail,
including per-class results and the error analysis, is in `MODEL_CARD.md` and
`ml/artifacts/metrics.json`.

Two honest caveats: the dataset contains label synonyms the model cannot
separate (`Crohn Disease` vs `Inflammatory Bowel Disease`, `Influenza` vs `Flu`),
which caps achievable accuracy; and macro-F1 is dragged down by classes with only
one or two test examples.

## Input features (819)

**12 structured** — `Age`, `Height_cm`, `Weight_kg`, `BMI` (derived), and encoded
`Age_Group`, `Gender`, `Body_Type_Dosha_Sanskrit`, `Food_Habits`,
`Current_Medication`, `Allergies`, `Season`, `Weather`.

**807 TF-IDF** — term weights over the symptom text, vocabulary fitted on the
training split only.

Unseen categorical values are normalised onto a known class before encoding
(`backend/ml/preprocessing.py`), so an unexpected value degrades gracefully
instead of breaking the request.

## Confidence

The reported confidence is `max(predict_proba)` as a percentage. It is a **raw,
uncalibrated** model score.

- It is **not** a probability that the prediction is correct.
- No calibration (Platt scaling, isotonic regression, reliability curves) has
  been applied, and no calibration error has been measured.
- Below a **35%** threshold the API returns `Inconclusive Data` and withholds the
  label from the clinician-facing field, keeping the raw label in
  `ml_prediction`. That threshold is an inherited **safety heuristic**, not a
  validated cut-off.

## Per-prediction explanations

For a linear model the score for class *k* is exactly

```
logit_k = intercept_k + SUM_i( coef[k,i] * x[i] )
```

so each term is that feature's real contribution to the score the model used.
The API returns the largest-magnitude terms for the predicted class under
`explanation`, and `tests/test_ml.py` re-derives the sum from the model object to
prove the identity holds. These are **score terms, not probabilities and not
causes**. No explanation is returned on the low-confidence path.

## Quick start

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Run the interactive CLI (uses the same model and preprocessing):

```bash
python arogya_predict.py
```

Retrain from scratch (only if the artifact is missing — it is committed):

```bash
python train_model.py
```

## Interface

The application talks to the model through the HTTP API, not by importing Python:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/` | public | Service banner |
| `GET` | `/api/health` | public | Status, loaded model name, class count |
| `POST` | `/api/predict` | **Firebase ID token** | Model prediction + explanation + Ayurvedic narrative |

`POST /api/predict` returns `prediction`, `confidence`, `recommendation`,
optionally `ml_prediction` (low-confidence path) and optionally `explanation`.

## When the LLM is unavailable

The prediction still succeeds; only the Ayurvedic narrative is replaced by a
fixed message. See `FALLBACK_MECHANISM.md` for exactly what does and does not
degrade.

## What this system does not do

- It does **not** validate a diagnosis, and it has not been clinically evaluated.
- It does **not** report a calibrated confidence.
- It does **not** ship an offline Ayurvedic recommendation database; the dataset's
  treatment columns are training data and are never read at runtime.
- It does **not** claim treatment efficacy for anything it suggests.

## Disclaimer

For educational and research purposes. Not a substitute for professional medical
advice, diagnosis or treatment. Always consult a qualified healthcare
professional.

**Last reviewed:** 2026-09-26 (Phase 18 documentation truthfulness pass).
