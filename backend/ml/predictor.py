"""Model inference wrapper.

Keeps the same two-step call the original route used (`predict` then
`predict_proba`) against the shared model object, so patching
`model.predict_proba` still intercepts inference.
"""
from backend.ml.model_loader import encoders, model


def predict(features):
    """Return (disease_label, confidence_percent) for preprocessed features."""
    prediction_encoded = model.predict(features)[0]
    probabilities = model.predict_proba(features)[0]
    confidence = float(max(probabilities) * 100)
    label = str(encoders["Disease"].inverse_transform([prediction_encoded])[0])
    return label, confidence
