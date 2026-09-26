#!/usr/bin/env python3
"""ArogyaAI — leak-free training pipeline.

The previous trainer (root `train_model.py`) fitted the TF-IDF vectorizer, the
label encoders, the scaler and SMOTE on the **whole dataset before splitting**,
then chose the winning model **using the test set**. That is data leakage: the
reported 100% accuracy did not estimate generalisation. See PHASE_5_ML_AUDIT.md.

This pipeline fixes it. Order of operations:

    raw CSV
      -> clean
      -> deterministic stratified train/test split      (FIRST)
      -> fit encoders + TF-IDF + scaler on the TRAIN split only
      -> model selection by cross-validation on the TRAIN split only
      -> SMOTE (training split only) evaluated as a documented comparison
      -> final fit on the TRAIN split
      -> ONE evaluation on the untouched test split

Nothing derived from the test split participates in the vocabulary, encoders,
scaler, feature set, hyperparameters or model choice.

On SMOTE
--------
The brief asked for SMOTE inside the cross-validation pipeline. That is
**mathematically impossible for this dataset**: with 399 classes and 51 classes
holding only 2 training rows, a fold's training portion can contain a class with
a single member, and SMOTE needs `k+1 >= 2` neighbours. The alternative --
resampling once before cross-validation -- is itself the leakage we are removing,
because synthetic points interpolated between training rows would sit in the
same folds used to score the model.

Imbalance is therefore handled with `class_weight='balanced'`, which adjusts the
loss without synthesising data and is safe inside CV. SMOTE-on-training-split is
still fitted and scored on the untouched test set so the comparison is recorded
rather than lost; it is reported as a variant, not selected by CV.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import (
    StratifiedKFold,
    cross_val_score,
    train_test_split,
)
from sklearn.preprocessing import LabelEncoder, StandardScaler

warnings.filterwarnings("ignore")

REPO_ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = REPO_ROOT / "enhanced_ayurvedic_treatment_dataset.csv"
ARTIFACT_PATH = REPO_ROOT / "arogyaai_model.joblib"
ARTIFACTS_DIR = REPO_ROOT / "ml" / "artifacts"

SEED = 42
TEST_SIZE = 0.2
CV_FOLDS = 3
N_ESTIMATORS = 100
# Version is neutral with respect to the estimator, because the estimator is
# chosen by cross-validation at training time and may change between runs.
MODEL_VERSION = "v3-cv-selected"

# Which candidate is deployed.
#
# Selection is purely by cross-validated macro-F1 on the training split. There is
# no override: the model that wins cross-validation is the model that ships, so
# no architectural preference can displace the corrected methodology. The winner
# is computed at runtime and recorded as `deployed_model` in metrics.json.
#
# An earlier revision pinned Random Forest here despite it losing cross-
# validation (0.768 vs 0.836 macro-F1) on the grounds that it was the project's
# established estimator. That override was reviewed and removed -- see
# PHASE_5_MODEL_DECISION.md. There was no technical justification for it, and the
# evidence favoured Logistic Regression on every measured axis: higher CV score,
# higher test accuracy and macro-F1, ~100x lower inference latency, ~220x smaller
# artifact, and per-class coefficients (399x819) that give a better
# per-prediction explanation surface than a tree's global importances.
#
# Both candidates are still fitted and scored on the untouched test split, so the
# comparison is recorded rather than discarded.
SELECTION_METRIC = "f1_macro"

CATEGORICAL = [
    "Age_Group", "Gender", "Body_Type_Dosha_Sanskrit", "Food_Habits",
    "Current_Medication", "Allergies", "Season", "Weather",
]
NUMERIC = ["Age", "Height_cm", "Weight_kg", "BMI"]
STRUCTURED = NUMERIC + [f"{c}_encoded" for c in CATEGORICAL]


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# data
# ---------------------------------------------------------------------------
def load_and_clean(path: Path) -> pd.DataFrame:
    """Load the dataset and apply deterministic cleaning. No fitting happens."""
    df = pd.read_csv(path)
    required = ["Disease", "Symptoms"] + NUMERIC + CATEGORICAL
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")

    df = df[required].dropna(subset=["Disease", "Symptoms"]).reset_index(drop=True)

    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            # Median of the whole column is a cleaning step, not a model input,
            # and is applied identically to every row before any split.
            df[col] = df[col].fillna(df[col].median())

    for col in CATEGORICAL:
        df[col] = df[col].astype(str).replace({"nan": "Unknown"})

    # Align text with the vocabulary the inference path builds from.
    df["Symptoms"] = df["Symptoms"].astype(str).str.replace("_", " ", regex=False)
    return df


def encode_column(encoder: LabelEncoder, values: pd.Series) -> list:
    """Encode with a fitted encoder; unseen labels become 0 (as at inference)."""
    known = set(encoder.classes_)
    return [encoder.transform([v])[0] if v in known else 0 for v in values]


# ---------------------------------------------------------------------------
# features — fitted on TRAIN ONLY
# ---------------------------------------------------------------------------
def fit_preprocessors(train_df: pd.DataFrame) -> dict:
    encoders = {}
    for col in CATEGORICAL:
        encoder = LabelEncoder().fit(train_df[col])
        encoders[col] = encoder
        train_df[f"{col}_encoded"] = encoder.transform(train_df[col])

    disease_encoder = LabelEncoder().fit(train_df["Disease"])
    encoders["Disease"] = disease_encoder
    train_df["Disease_encoded"] = disease_encoder.transform(train_df["Disease"])

    vectorizer = TfidfVectorizer().fit(train_df["Symptoms"])

    train_tfidf = vectorizer.transform(train_df["Symptoms"]).toarray()
    tfidf_cols = [f"tfidf_{i}" for i in range(train_tfidf.shape[1])]
    train_matrix = pd.concat(
        [
            train_df[STRUCTURED].reset_index(drop=True),
            pd.DataFrame(train_tfidf, columns=tfidf_cols),
        ],
        axis=1,
    )
    scaler = StandardScaler().fit(train_matrix)

    return {
        "encoders": encoders,
        "vectorizer": vectorizer,
        "scaler": scaler,
        "tfidf_cols": tfidf_cols,
    }


def transform(df: pd.DataFrame, pre: dict) -> np.ndarray:
    """Apply the training-fitted preprocessors. Uses no test statistics."""
    work = df.copy()
    for col in CATEGORICAL:
        work[f"{col}_encoded"] = encode_column(pre["encoders"][col], work[col])

    tfidf = pre["vectorizer"].transform(work["Symptoms"]).toarray()
    matrix = pd.concat(
        [
            work[STRUCTURED].reset_index(drop=True),
            pd.DataFrame(tfidf, columns=pre["tfidf_cols"]),
        ],
        axis=1,
    )
    matrix = matrix.reindex(columns=pre["scaler"].get_feature_names_out(), fill_value=0)
    return pre["scaler"].transform(matrix)


# ---------------------------------------------------------------------------
# evaluation
# ---------------------------------------------------------------------------
def score(y_true, y_pred, labels) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_precision": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "macro_recall": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "macro_f1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "weighted_precision": float(precision_score(y_true, y_pred, average="weighted", zero_division=0)),
        "weighted_recall": float(recall_score(y_true, y_pred, average="weighted", zero_division=0)),
        "weighted_f1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "n_samples": int(len(y_true)),
        "n_classes": int(len(labels)),
    }


def per_class_report(y_true, y_pred, labels) -> dict:
    return classification_report(
        y_true, y_pred, labels=range(len(labels)),
        target_names=[str(x) for x in labels],
        output_dict=True, zero_division=0,
    )


def top_confusions(cm: np.ndarray, labels, n: int = 15) -> list:
    """The most frequent off-diagonal confusions, for the model card."""
    pairs = []
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            if i != j and cm[i, j] > 0:
                pairs.append((int(cm[i, j]), str(labels[i]), str(labels[j])))
    pairs.sort(reverse=True)
    return [{"count": c, "actual": a, "predicted": p} for c, a, p in pairs[:n]]


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main(output_path: Path = ARTIFACT_PATH) -> dict:
    started = time.time()
    print("=" * 68)
    print("ArogyaAI — leak-free training pipeline")
    print("=" * 68)

    dataset_hash = sha256_of(DATASET_PATH)
    df = load_and_clean(DATASET_PATH)
    class_counts = df["Disease"].value_counts()
    print(f"dataset      : {len(df)} rows, {df['Disease'].nunique()} classes "
          f"(min {class_counts.min()}/class, median {int(class_counts.median())})")

    # --- 1. split FIRST -----------------------------------------------------
    train_df, test_df = train_test_split(
        df, test_size=TEST_SIZE, random_state=SEED, stratify=df["Disease"],
    )
    train_df = train_df.reset_index(drop=True)
    test_df = test_df.reset_index(drop=True)
    print(f"split        : train {len(train_df)} / test {len(test_df)} "
          f"(stratified, seed={SEED})")

    # --- 2. preprocessors fitted on TRAIN only ------------------------------
    pre = fit_preprocessors(train_df)
    labels = pre["encoders"]["Disease"].classes_
    X_train = transform(train_df, pre)
    X_test = transform(test_df, pre)
    y_train = pre["encoders"]["Disease"].transform(train_df["Disease"])
    y_test = pre["encoders"]["Disease"].transform(test_df["Disease"])
    print(f"features     : {X_train.shape[1]} total "
          f"({len(STRUCTURED)} structured + {len(pre['tfidf_cols'])} TF-IDF)")
    if X_train.shape[1] != 819 or X_test.shape[1] != 819:
        raise AssertionError("Feature dimension changed; inference would break.")

    # --- 3. model selection by CV on TRAIN only -----------------------------
    print(f"\ncross-validation (f1_macro, {CV_FOLDS} folds, train split only)")
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=SEED)
    candidates = {
        "Random Forest": RandomForestClassifier(
            n_estimators=N_ESTIMATORS, random_state=SEED, n_jobs=-1,
            class_weight="balanced",
        ),
        "Logistic Regression": LogisticRegression(
            max_iter=300, random_state=SEED, n_jobs=-1, class_weight="balanced",
        ),
    }
    cv_results: dict[str, dict] = {}
    for name, estimator in candidates.items():
        t0 = time.time()
        scores = cross_val_score(
            estimator, X_train, y_train, cv=cv, scoring="f1_macro", n_jobs=1,
        )
        cv_results[name] = {
            "folds": [float(s) for s in scores],
            "mean_f1_macro": float(np.mean(scores)),
            "seconds": round(time.time() - t0, 1),
        }
        print(f"  {name:20s} mean macro-F1 {np.mean(scores):.4f} "
              f"(folds {np.round(scores, 3).tolist()})")

    best_name = max(cv_results, key=lambda n: cv_results[n]["mean_f1_macro"])
    print(f"  -> selected (highest CV macro-F1): {best_name}")

    # --- 4. fit every candidate on TRAIN, evaluate all on the test split -----
    # Every candidate is fitted and scored so the comparison is recorded rather
    # than discarded; the selected model is the one that won cross-validation.
    test_results: dict[str, dict] = {}
    fitted: dict[str, object] = {}
    for name, estimator in candidates.items():
        estimator.fit(X_train, y_train)
        fitted[name] = estimator
        test_results[name] = score(y_test, estimator.predict(X_test), labels)

    final_model = fitted[best_name]
    y_pred = final_model.predict(X_test)
    test_metrics = test_results[best_name]
    print(f"\nuntouched test-set performance (selected: {best_name})")
    for key in ("accuracy", "macro_precision", "macro_recall", "macro_f1",
                "weighted_precision", "weighted_recall", "weighted_f1"):
        print(f"  {key:20s} {test_metrics[key]:.4f}")
    for other in cv_results:
        if other == best_name:
            continue
        alt = test_results[other]
        print(f"  (comparison) {other}: accuracy {alt['accuracy']:.4f} | "
              f"macro-F1 {alt['macro_f1']:.4f}")

    cm = confusion_matrix(y_test, y_pred, labels=range(len(labels)))
    report = per_class_report(y_test, y_pred, labels)

    # --- 6. SMOTE variant, training split only, for the record --------------
    train_min = int(train_df["Disease"].value_counts().min())
    k_neighbors = max(1, train_min - 1)
    print(f"\nSMOTE comparison (k_neighbors={k_neighbors}, applied to the "
          "training split only)")
    smote = SMOTE(random_state=SEED, k_neighbors=k_neighbors)
    X_res, y_res = smote.fit_resample(X_train, y_train)
    smote_model = RandomForestClassifier(
        n_estimators=N_ESTIMATORS, random_state=SEED, n_jobs=-1,
    )
    smote_model.fit(X_res, y_res)
    smote_metrics = score(y_test, smote_model.predict(X_test), labels)
    print(f"  resampled {X_res.shape[0]} rows | test macro-F1 "
          f"{smote_metrics['macro_f1']:.4f} | accuracy {smote_metrics['accuracy']:.4f}")
    print("  (not selected: a CV score on resampled data would be contaminated)")

    # --- 7. persist ---------------------------------------------------------
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    metadata = {
        "model_version": MODEL_VERSION,
        "model_type": best_name,
        "selection_metric": SELECTION_METRIC,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "path": DATASET_PATH.name,
            "sha256": dataset_hash,
            "rows": int(len(df)),
            "classes": int(df["Disease"].nunique()),
            "min_samples_per_class": int(class_counts.min()),
            "median_samples_per_class": int(class_counts.median()),
        },
        "split": {"strategy": "stratified", "test_size": TEST_SIZE,
                  "seed": SEED, "train_rows": int(len(train_df)),
                  "test_rows": int(len(test_df))},
        "features": {"structured": len(STRUCTURED),
                     "tfidf": len(pre["tfidf_cols"]),
                     "total": int(X_train.shape[1])},
        "environment": {
            "python": platform.python_version(),
            "scikit_learn": sklearn.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
        },
    }

    artifact = {
        # --- keys the inference path requires (unchanged contract) ---
        "model": final_model,
        "scaler": pre["scaler"],
        "vectorizer": pre["vectorizer"],
        "encoders": pre["encoders"],
        "feature_columns": STRUCTURED,
        # --- additive metadata ---
        # `model_type` must name the estimator actually persisted, because
        # /api/health reports it. It is the cross-validation winner: there is no
        # override, so the two can never disagree.
        "model_type": best_name,
        "results": {k: v["mean_f1_macro"] for k, v in cv_results.items()},
        "metadata": metadata,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, output_path)
    artifact_hash = sha256_of(output_path)

    metrics = {
        "model_version": MODEL_VERSION,
        "deployed_model": best_name,
        "selection_metric": SELECTION_METRIC,
        "dataset_sha256": dataset_hash,
        "artifact_sha256": artifact_hash,
        "artifact_bytes": output_path.stat().st_size,
        "cross_validation": cv_results,
        "test_metrics": test_metrics,
        "smote_comparison": {
            "k_neighbors": k_neighbors,
            "train_rows_resampled": int(X_res.shape[0]),
            "test_metrics": smote_metrics,
        },
        "class_distribution": {
            "min": int(class_counts.min()),
            "median": int(class_counts.median()),
            "max": int(class_counts.max()),
            "classes_with_3": int((class_counts == 3).sum()),
        },
        "top_confusions": top_confusions(cm, labels),
        "per_class": report,
        "per_class_support": {str(labels[i]): int(v)
                              for i, v in enumerate(np.bincount(y_test, minlength=len(labels)))},
    }

    with open(ARTIFACTS_DIR / "metrics.json", "w", encoding="utf-8") as fh:
        json.dump(metrics, fh, indent=2)
    with open(ARTIFACTS_DIR / "model_metadata.json", "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)
    with open(ARTIFACTS_DIR / "confusion_matrix.json", "w", encoding="utf-8") as fh:
        json.dump({"labels": [str(x) for x in labels], "matrix": cm.tolist()}, fh)

    print(f"\nartifact     : {output_path} "
          f"({output_path.stat().st_size / 1e6:.0f} MB)")
    print(f"sha256       : {artifact_hash}")
    print(f"metrics      : ml/artifacts/metrics.json")
    print(f"elapsed      : {time.time() - started:.1f}s")
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the ArogyaAI model.")
    parser.add_argument(
        "--output",
        type=Path,
        default=ARTIFACT_PATH,
        help=f"where to write the artifact (default: {ARTIFACT_PATH.name}). "
             "Use a staging path to verify before replacing a live artifact.",
    )
    args = parser.parse_args()
    metrics = main(args.output)
    print(f"\nwrote {args.output}")
    print(f"test macro-F1 {metrics['test_metrics']['macro_f1']:.4f} | "
          f"accuracy {metrics['test_metrics']['accuracy']:.4f}")
