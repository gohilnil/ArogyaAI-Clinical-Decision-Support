#!/usr/bin/env python3
"""Evaluate a persisted ArogyaAI artifact on a held-out split.

Loads the artifact produced by `ml/train.py`, rebuilds the same deterministic
split, and reports the full metric set. The test split is used **only** here, to
produce numbers — never to influence training.

    python ml/evaluate.py                    # default 20% held-out split
    python ml/evaluate.py --split train      # score the training split instead
    python ml/evaluate.py --artifact path.pkl
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml.train import (  # noqa: E402
    ARTIFACT_PATH,
    ARTIFACTS_DIR,
    DATASET_PATH,
    SEED,
    TEST_SIZE,
    load_and_clean,
    score,
    transform,
)


def evaluate(artifact_path: Path, split: str) -> dict:
    print(f"artifact : {artifact_path}")
    artifact = joblib.load(artifact_path)
    for key in ("model", "scaler", "vectorizer", "encoders", "feature_columns"):
        if key not in artifact:
            raise KeyError(f"artifact is missing required key '{key}'")

    df = load_and_clean(DATASET_PATH)
    train_df, test_df = train_test_split(
        df, test_size=TEST_SIZE, random_state=SEED, stratify=df["Disease"],
    )
    frame = train_df if split == "train" else test_df
    frame = frame.reset_index(drop=True)

    # `transform` expects the training-fitted preprocessors, which are exactly
    # what the artifact stores — so no reference to the training frame is needed.
    pre = {
        "encoders": artifact["encoders"],
        "vectorizer": artifact["vectorizer"],
        "scaler": artifact["scaler"],
        "tfidf_cols": [f"tfidf_{i}"
                       for i in range(len(artifact["vectorizer"].get_feature_names_out()))],
    }
    X = transform(frame, pre)
    y = artifact["encoders"]["Disease"].transform(frame["Disease"])
    labels = artifact["encoders"]["Disease"].classes_

    expected = artifact["scaler"].n_features_in_
    if X.shape[1] != expected:
        raise AssertionError(
            f"feature mismatch: built {X.shape[1]}, artifact expects {expected}"
        )

    y_pred = artifact["model"].predict(X)
    metrics = score(y, y_pred, labels)

    print(f"split    : {split} ({len(frame)} rows, {X.shape[1]} features)")
    print(f"model    : {artifact.get('model_type', 'unknown')} "
          f"| version {artifact.get('metadata', {}).get('model_version', 'n/a')}")
    print("\nmetrics")
    for key in ("accuracy", "macro_precision", "macro_recall", "macro_f1",
                "weighted_precision", "weighted_recall", "weighted_f1"):
        print(f"  {key:20s} {metrics[key]:.4f}")

    report = classification_report(
        y, y_pred, labels=range(len(labels)),
        target_names=[str(x) for x in labels], output_dict=True, zero_division=0,
    )
    weakest = sorted(
        ((k, v["f1-score"]) for k, v in report.items()
         if isinstance(v, dict) and v.get("support", 0) > 0),
        key=lambda kv: kv[1],
    )[:10]
    print("\nweakest classes (lowest F1, with support > 0)")
    for name, f1 in weakest:
        support = int(report[name]["support"])
        print(f"  {name[:44]:46s} F1 {f1:.3f}  (n={support})")

    cm = confusion_matrix(y, y_pred, labels=range(len(labels)))
    print(f"\nconfusion matrix: {cm.shape[0]}x{cm.shape[1]}, "
          f"{int(cm.sum() - np.trace(cm))} misclassified of {int(cm.sum())}")

    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate an ArogyaAI artifact.")
    parser.add_argument("--artifact", type=Path, default=ARTIFACT_PATH)
    parser.add_argument("--split", choices=["test", "train"], default="test")
    parser.add_argument("--json", type=Path, default=None,
                        help="optional path to write the metrics as JSON")
    args = parser.parse_args()

    result = evaluate(args.artifact, args.split)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        print(f"\nwrote {args.json}")
    print(f"\nmacro-F1 {result['macro_f1']:.4f} | accuracy {result['accuracy']:.4f}")
