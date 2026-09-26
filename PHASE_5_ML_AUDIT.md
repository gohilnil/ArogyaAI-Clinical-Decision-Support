# ArogyaAI — Phase 5 ML Audit

> Verifies the **current** training pipeline and locates data leakage in the
> actual code. Every claim below cites a file and line. No behaviour was changed
> to produce this document.

---

## 1. Dataset

| Property | Value (measured) |
|---|---|
| File | `enhanced_ayurvedic_treatment_dataset.csv` |
| SHA-256 | `c4e81cd60736c79b070cfd02b90eb9915e8e5f0afd173c57de4910b3178fab79` |
| Size | 3.5 MB, 4,201 rows × 27 columns |
| Target column | `Disease` |
| Classes | **399** |
| Class sizes | max 52, median 6, **min 3**, 57 classes have exactly 3 |
| Missing values | 553 across the 14 required columns (filled during training) |

Class distribution is severely skewed: 399 labels over 4,201 rows. There is no
class with fewer than 3 examples, so a stratified split is feasible (each class
contributes ≥1 to a 20% test set).

## 2. Feature construction

From `train_model.py:58-60` and `:127`:

- **12 structured features**: `Age, Height_cm, Weight_kg, BMI` + 8 label-encoded
  categoricals (`Age_Group, Gender, Body_Type_Dosha_Sanskrit, Food_Habits,
  Current_Medication, Allergies, Season, Weather`)
- **807 TF-IDF features** from the `Symptoms` text
- **819 total model inputs** — verified by loading the artifact
  (`scaler.n_features_in_ == 819`, `len(vectorizer.get_feature_names_out()) == 807`)

## 3. Leakage — located precisely

`train_model.py` fits every preprocessing step on the **full dataset before**
splitting, then chooses the winning model **on the test set**. Five distinct
leaks:

| # | Line | Code | Leak |
|---|---|---|---|
| L1 | `106` | `df[f'{col}_encoded'] = encoder.fit_transform(df[col])` | categorical encoders fitted on all rows, including future test rows |
| L2 | `111` | `disease_encoder.fit_transform(df['Disease'])` | target encoder fitted on the full label set |
| L3 | `133` | `vectorizer.fit_transform(df['Symptoms'])` | **TF-IDF vocabulary and IDF weights learned from the test set** |
| L4 | `164` | `smote.fit_resample(X_combined_full, y_full)` | SMOTE runs on the full dataset; synthetic points are interpolated between rows that later land in the test set |
| L5 | `169` | `scaler.fit_transform(X_resampled)` | scaler fitted on the full resampled data |
| L6 | `201-213` | RF/LR/SVM scored with `accuracy_score(y_test, …)`, best chosen | **model selection performed on the test set** |

The split itself happens at `150-152`, *after* L3/L4/L5 have already seen every
row. The reported accuracies are therefore not estimates of generalisation:

```
results = {'Random Forest': 1.0, 'Logistic Regression': 0.9964, 'SVM': 0.9417}
```

A perfect 1.0 is the signature of this failure mode. **These numbers are
contaminated and must not be reported as performance.**

## 4. Frozen baseline

| Property | Value |
|---|---|
| Artifact | `random_forest_model.pkl` |
| SHA-256 | `ed880a38cfb1ed5d79ff21390877298115e183f28d1f2fbceab1827239561248` |
| Size | **1,105 MB** (tracked in git) |
| Model | `RandomForestClassifier`, 399 classes |
| Stored metrics | RF 1.0000 / LR 0.9964 / SVM 0.9417 — **leakage-affected** |
| Feature count | 819 (12 structured + 807 TF-IDF) |

### Inference contract (must be preserved)

`backend/ml/model_loader.py:39-43` reads these keys from the artifact:

```python
model_components["model"]             # .predict(), .predict_proba()
model_components["scaler"]            # .transform(), .get_feature_names_out()
model_components["vectorizer"]        # .transform()
model_components["encoders"]          # {col: LabelEncoder} for 8 cat cols + "Disease"
model_components["feature_columns"]   # the 12 structured column names
```

`backend/ml/preprocessing.py` then: encodes the 8 categoricals →
`vectorizer.transform(Symptoms)` → concatenates with the 12 structured columns →
reindexes to `scaler.get_feature_names_out()` → `scaler.transform` → returns a
`(1, 819)` array. The backend calls `model.predict` and `model.predict_proba`,
taking `max(probabilities) * 100` as confidence
(`backend/ml/predictor.py:11-15`).

**Any new artifact must expose the identical keys and array shape**, or the
backend breaks. That constraint is treated as fixed in the corrected pipeline.

## 5. What the corrected pipeline must guarantee

1. Split **before** any fitting.
2. Fit categorical encoders, TF-IDF and scaler on the **training split only**.
3. Apply SMOTE to the **training split only**.
4. Select the model by **cross-validation on the training split**.
5. Touch the test set **exactly once**, at the end.
6. No test-set information may reach the vocabulary, encoders, scaler, SMOTE,
   feature selection, or model selection.

Where practical this must be **structural** (sklearn/imblearn `Pipeline` objects)
rather than a matter of developer discipline.

## 6. Additional observations (recorded, not fixed here)

- **Confidence is uncalibrated.** `max(predict_proba)` is reported as a
  percentage. With 399 classes and heavy resampling, a Random Forest's raw
  probabilities are typically over-confident. Calibration is future work.
- **The artifact is 1.1 GB and tracked in git.** Reducing it is a later phase
  (17/22); Phase 5 notes the size of whatever it produces.
- **Duplicate symptoms across classes**: the same symptom string may appear under
  several labels, which caps achievable accuracy and is a property of the data.
- `train_model.py` reads the notebook `AyurCore.ipynb` only to print a cell count
  (`extract_notebook_code`) — it does not execute it. That indirection is dead
  weight the corrected trainer drops.
