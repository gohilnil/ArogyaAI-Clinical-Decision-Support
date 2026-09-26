#!/usr/bin/env python3
"""ArogyaAI — model training entry point.

The training pipeline lives in `ml/train.py`. This module keeps the documented
command working:

    python train_model.py

It previously held a trainer that fitted the TF-IDF vectorizer, the label
encoders, the scaler and SMOTE on the whole dataset *before* splitting, and then
selected the winning model on the test set. Those five leaks are described with
line numbers in PHASE_5_ML_AUDIT.md. That code is gone; this now delegates to the
leak-free pipeline, which returns honest metrics.

See MODEL_CARD.md for the methodology and the measured results.
"""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent


def main() -> int:
    print("ArogyaAI training has moved to ml/train.py (leak-free pipeline).")
    print("See MODEL_CARD.md and PHASE_5_ML_AUDIT.md for the methodology.\n")
    return subprocess.call(
        [sys.executable, "-W", "ignore", str(REPO_ROOT / "ml" / "train.py"), *sys.argv[1:]]
    )


if __name__ == "__main__":
    raise SystemExit(main())
