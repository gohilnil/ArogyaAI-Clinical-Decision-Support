"""Offline ML training pipeline for ArogyaAI.

This package trains and evaluates the model. It is separate from
`backend/ml/`, which loads the artifact and runs inference at request time.

    python ml/train.py       train, evaluate once, write the artifact
    python ml/evaluate.py    re-load an artifact and score it on a fresh split
"""
