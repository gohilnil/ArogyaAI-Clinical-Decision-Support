# ArogyaAI — Model Card

> Every number in this card was produced by the pipeline in `ml/train.py` and is
> reproducible from the recorded seeds and hashes. The previous published
> figures (99–100% accuracy) came from a leakage-contaminated pipeline and are
> **withdrawn** — see §7.

---

## 1. Model purpose

ArogyaAI suggests a likely condition from a patient's symptoms and profile, to
support an Ayurvedic practitioner's reasoning.

**Intended use:** decision support for a qualified practitioner, as one input
among several, alongside their own clinical judgement.

**Not intended for:** autonomous diagnosis, triage without a clinician, patient
self-diagnosis, or any decision where an error would cause harm. The output is a
probabilistic suggestion over 399 labels, not a medical finding. Low-confidence
predictions are withheld entirely (below 35%).

**Outputs:** a predicted condition label and a confidence percentage.

## 2. Dataset

| Property | Value |
|---|---|
| File | `enhanced_ayurvedic_treatment_dataset.csv` |
| SHA-256 | `c4e81cd60736c79b070cfd02b90eb9915e8e5f0afd173c57de4910b3178fab79` |
| Size | 4,201 rows × 27 columns |
| Target | `Disease` |
| Classes | **399** |
| Class sizes | min **3**, median 6, max 52 |
| Classes with exactly 3 | 57 |

### Known limitations of the data

- **Severe class imbalance.** 399 labels over 4,201 rows means most classes have
  fewer than 10 examples. A model can score well on frequent classes while
  failing rare ones, which is why macro-F1 is reported alongside accuracy.
- **Label overlap.** Some diseases are near-synonyms in the label set
  (`Type 2 Diabetes` / `Diabetes Type 2`, `Type 1 Diabetes` / `Diabetes Type 1`).
  The most frequent confusions are of this kind (§6), and they reflect the
  dataset's labelling rather than a clinical distinction.
- **Synthetic-looking symptom text.** Symptoms are comma-separated keyword lists
  with underscores (`loss_of_balance`), not free clinical prose. Free text from a
  real clinician is out of distribution.
- **No provenance.** The dataset has no documented collection method, no
  diagnosis criteria, and no clinical validation. It is **not** a validated
  clinical dataset, and nothing here should be read as clinical evidence.
- **No demographic bias analysis** has been performed; `Gender`, `Age_Group`
  and `Season` are model inputs, so their distributions affect predictions.

## 3. Feature construction

| Block | Count | Construction |
|---|---|---|
| Structured | 12 | `Age, Height_cm, Weight_kg, BMI` + 8 label-encoded categoricals |
| Symptoms | 807 | TF-IDF over the symptom string |
| **Total** | **819** | |

The categoricals are `Age_Group, Gender, Body_Type_Dosha_Sanskrit, Food_Habits,
Current_Medication, Allergies, Season, Weather`. Unseen categories at inference
are mapped to a defined fallback per field, never silently dropped.

## 4. Training methodology

```
raw CSV
  -> clean (drop missing target/symptoms, median-fill numerics, normalise text)
  -> stratified train/test split (80/20, seed 42)          <- FIRST
  -> fit encoders + TF-IDF + scaler on the TRAIN split only
  -> model selection by cross-validation on the TRAIN split only
  -> final fit on the TRAIN split
  -> ONE evaluation on the untouched test split
```

Split sizes: **train 3,360 / test 841**.

Model selection used 3-fold `StratifiedKFold`, scored by **macro-F1** (not
accuracy, because of the imbalance).

| Candidate | CV mean macro-F1 | CV folds |
|---|---|---|
| Random Forest (`n_estimators=100`, `class_weight='balanced'`) | 0.7684 | 0.767 / 0.766 / 0.772 |
| Logistic Regression (`max_iter=300`, `class_weight='balanced'`) | **0.8360** | 0.830 / 0.838 / 0.840 |

**Deployed model: Logistic Regression** (`v3-cv-selected`).

### How the deployed model is chosen

The model that wins cross-validation is the model that ships. There is no
override constant, so an architectural preference cannot displace the selection
methodology. The winner is computed at training time and written to
`metrics.json` as `deployed_model`.

An earlier revision of this pipeline pinned Random Forest despite it losing
cross-validation, on the grounds that it was the project's established estimator.
That override was reviewed and **removed** — see `PHASE_5_MODEL_DECISION.md` for
the full evidence. No technical justification for it existed; on every measured
axis the evidence favoured Logistic Regression (higher CV score, higher test
accuracy and macro-F1, ~100× lower inference latency, ~220× smaller artifact, and
per-class coefficients that give a better per-prediction explanation surface than
a tree's global importances).

Both candidates are still fitted and scored on the untouched test set, and both
sets of numbers are recorded in `ml/artifacts/metrics.json`.

### On SMOTE

The corrected pipeline initially tried SMOTE inside the cross-validation folds.
That is **mathematically impossible for this dataset**: with 399 classes, 51 of
which hold only 2 training rows, a fold's training portion can contain a class
with a single member, and SMOTE requires `k+1 ≥ 2` neighbours. Resampling once
before cross-validation is itself the leakage being removed, because synthetic
points interpolated between training rows would sit in the folds used to score.

Imbalance is handled with `class_weight='balanced'`, which reweights the loss
without synthesising data and is safe inside CV. A SMOTE variant was still fitted
on the training split and scored on the untouched test set, so the comparison is
recorded rather than lost:

| Variant | Test accuracy | Test macro-F1 |
|---|---|---|
| Deployed (Logistic Regression, `class_weight='balanced'`) | 0.8859 | 0.8372 |
| Random Forest candidate, `class_weight='balanced'` | 0.8502 | 0.7946 |
| SMOTE variant (RF on resampled train, 16,758 rows) | 0.8656 | 0.8121 |

(The deployed row was previously mislabelled "Random Forest" and carried that
model's numbers. The deployed estimator is Logistic Regression; the Random
Forest row is now shown separately as the comparison candidate.)

The SMOTE variant scored slightly higher on both. It is **not** deployed because
its selection could not be justified by cross-validation without reintroducing
contamination; deploying it on the basis of a test-set comparison would be
selecting on the test set, which is the original defect.

## 5. Final test metrics (untouched 841-row split)

Deployed model — Logistic Regression:

| Metric | Value |
|---|---|
| Accuracy | **0.8859** |
| Macro precision | 0.8310 |
| Macro recall | 0.8651 |
| **Macro F1** | **0.8372** |
| Weighted precision | 0.8839 |
| Weighted recall | 0.8859 |
| Weighted F1 | 0.8761 |

94 of 841 test rows were misclassified. The gap between weighted F1 (0.876) and
macro F1 (0.837) is the expected signature of class imbalance: frequent classes
are predicted well, rare ones less so.

For comparison, Random Forest on the same untouched split: accuracy 0.8502,
macro-F1 0.7946. Both figures are in `ml/artifacts/metrics.json`.

### Confidence interpretation — important

The confidence returned by the API is `max(predict_proba)` as a percentage. It is
a **raw, uncalibrated** model probability.

- It is **not** a probability that the prediction is correct.
- No calibration (Platt scaling, isotonic regression, reliability curves) has been
  applied. On 399 heavily imbalanced classes a softmax-style probability is not a
  calibrated confidence, and it may be over-confident or under-confident in ways
  that have not been measured.
- The 35% gate is a **safety choice**, not a statistically derived cut-off. It was
  inherited from the original application and has not been validated against this
  model's probability distribution.

### Per-prediction explanations (the "AI X-Ray" panel)

The API returns an `explanation` object alongside the prediction. It is the
model's own arithmetic, not a generated narrative.

For multinomial logistic regression the score (logit) for class *k* is exactly

```
logit_k = intercept_k + SUM_i( coef[k, i] * x[i] )
```

so each term `coef[k, i] * x[i]` **is** that feature's contribution to the score
the model used when it chose class *k*. `backend/ml/explainability.py` returns the
largest-magnitude terms for the predicted class, and `tests/test_ml.py`
re-derives `intercept + total_contribution` from the model object and asserts it
equals the logit, so a decorative explanation cannot pass.

What the numbers are, and are not:

- They are terms in the model's **score**, not changes in probability, and not
  percentages.
- `direction: "supports"` means the feature pushed the score **toward** this
  condition; `"opposes"` means away. Neither is a causal claim.
- Contributions are computed in the standardised feature space, because that is
  where the coefficients live. The `input_value` shown is the raw value the user
  entered, so the reader can see what produced the term.
- Only terms the caller's own symptom text actually produced are listed; a
  vocabulary term they never typed contributes zero and would be noise.
- Ties among ranked features are not resolved into a confidence — the ordering
  is by absolute contribution only.

Explanations are produced only when the deployed estimator exposes
coefficients. If a future deployment used a non-linear estimator, the field is
omitted rather than approximated. No explanation is returned on the
low-confidence path, because listing the features that support a condition the
system is simultaneously declining to name would present an unreliable guess as a
finding.

## 6. Error analysis

Most frequent confusions on the test split (Logistic Regression):

| Count | Actual | Predicted |
|---|---|---|
| 3 | Crohn Disease | Inflammatory Bowel Disease |
| 2 | Osteoarthritis | Arthritis |
| 2 | Influenza | Flu |
| 2 | Hepatitis D | Hepatitis C |
| 2 | Hepatitis C | Hepatitis B |
| 2 | Hepatitis B | Hepatitis C |

These are **label-synonym** confusions — clinically near-identical labels the
model cannot distinguish because the dataset treats them as separate classes.
This is a data-modelling artefact, and it means reported accuracy understates
practical usefulness for those pairs.

Classes with a single test example score F1 0.000 (e.g. `Anxiety`, `Aplastic
Anemia`, `Brugada Syndrome`). With one example, a single miss is unavoidable, so
these figures are statistical noise rather than evidence about those conditions.

## 7. Comparison with the previous methodology

The previous trainer (root `train_model.py`) fitted the label encoders, the
TF-IDF vectorizer, the scaler and SMOTE on the **entire dataset before splitting**,
then selected the winning model using the **test set**. The exact lines are cited
in `PHASE_5_ML_AUDIT.md`. That is leakage, and it produced:

| Model | Previously reported accuracy | Status |
|---|---|---|
| Random Forest | **1.0000** | ❌ **contaminated** — not valid performance |
| Logistic Regression | 0.9964 | ❌ contaminated |
| SVM | 0.9417 | ❌ contaminated |

**These figures must never be presented as model performance.** A perfect score
across 399 classes is the signature of test-set contamination.

After correcting the methodology, the honest numbers are in §5: **88.6% accuracy,
0.837 macro-F1** for the deployed model. The lower figures are the accurate ones.
The project's credibility now rests on a leak-free measurement rather than a
leaked 1.0.

## 8. Artifact & version

| Property | Value |
|---|---|
| Model version | `v3-cv-selected` |
| Estimator | `LogisticRegression` (399 classes) |
| Artifact | `arogyaai_model.joblib` |
| SHA-256 | `e000590b7cd745a6c2b375568a62ed57ee4e3ee35376aaf68a368ffcf6ecadd0` |
| Size | 2,680,914 bytes (~2.7 MB) |
| Feature dimension | 819 |
| Previous artifact SHA-256 | `ed880a38cfb1ed5d79ff21390877298115e183f28d1f2fbceab1827239561248` (~1,105 MB, contaminated) |

**Filename history:** the artifact was named `random_forest_model.pkl` — a
misnomer once the deployed estimator became a Logistic Regression. It was
renamed to the model-neutral `arogyaai_model.joblib`. The file's identity is
its `model_type` field, which `/api/health` reports; the name no longer claims
an estimator.

The artifact is ~99.8% smaller than the original because the deployed model is a
linear classifier rather than an ensemble of 100 trees, and it no longer trains
on the 16,758-row SMOTE-resampled set.

### Inference contract (unchanged)

The artifact keeps the keys the backend reads
(`backend/ml/model_loader.py`): `model`, `scaler`, `vectorizer`, `encoders`,
`feature_columns`. Metadata is additive: `model_type`, `results`, `metadata`.
The feature array remains `(1, 819)`.

## 9. Reproducibility

| Property | Value |
|---|---|
| Command | `python ml/train.py` (or `python train_model.py`) |
| Evaluation | `python ml/evaluate.py` |
| Tests | `python -m unittest tests.test_ml` |
| Split seed | 42 (stratified, 80/20) |
| CV | `StratifiedKFold(3, shuffle=True, random_state=42)`, scoring `f1_macro` |
| Random Forest (candidate) | `n_estimators=100, random_state=42, n_jobs=-1, class_weight='balanced'` |
| Logistic Regression (selected) | `max_iter=300, random_state=42, n_jobs=-1, class_weight='balanced'` — converged in 149 iterations |
| Environment recorded | Python 3.14.5, scikit-learn 1.9.0, pandas 3.0.5, numpy 2.5.2 |

`ml/artifacts/metrics.json` holds the full metric set, per-class report, and
confusion matrix; `model_metadata.json` holds the version, dataset hash, split,
feature and environment metadata.

**Residual non-determinism, stated honestly:** TF-IDF and the scaler are fitted
once on the whole training split rather than refitted inside each CV fold. This is
train-only, so **there is no test contamination**, but it means the CV score is a
slightly optimistic estimate relative to a fully nested pipeline. A nested
implementation would refit the vectorizer per fold at several times the cost for a
small, unmeasured difference. Flagged rather than glossed over.

### Inference latency (measured)

Measured directly on the deployed artifact, because figures like this are
meaningless without their environment:

| Property | Value |
|---|---|
| Method | `predict` + `predict_proba` on one `(1, 819)` row, after 20 warm-up calls |
| Sample count | 300 |
| Mean | **0.372 ms** |
| Median | 0.258 ms |
| p95 | 0.586 ms |
| Min / max | 0.235 ms / 1.971 ms |
| Environment | Python 3.14.5, scikit-learn 1.9.0, numpy 2.4.6 |
| Platform | Windows 11 (10.0.26200), Intel64 Family 6 Model 186 |

This is the model call only, excluding HTTP, preprocessing and the Gemini round
trip (which dominates real request latency when it runs). Earlier documents
quoted 0.32 ms for Logistic Regression against 32.03 ms for Random Forest; those
were taken on a different machine and are superseded by the figures above. The
ordering they established still holds — the linear model is far cheaper per
call — but the specific numbers here are the ones measured against this artifact.

**Frontend bundle:** the production build emits a single ~786 kB chunk (~240 kB
gzipped) and Vite warns about it. It is not code-split. Noted as a real, low
priority issue rather than left unmentioned.

## 10. Limitations summary

1. Not clinically validated; dataset provenance is undocumented.
2. Severe imbalance: macro-F1 (0.837) is materially below accuracy (0.886).
3. Synonym labels inflate confusion between near-identical classes.
4. Confidence is uncalibrated; the 35% gate is a safety heuristic, not a measured
   threshold.
5. Symptom input is keyword-style; free clinical text is out of distribution.
6. No demographic fairness analysis has been performed.
7. The artifact filename is historical and no longer describes the estimator (§8).
8. Logistic Regression was selected over Random Forest on this dataset. That is a
   statement about this dataset, not a general claim that linear models are
   better suited to clinical prediction.
