"""Prediction orchestration.

Owns the sequence the original route performed inline:
normalise input -> preprocess -> ML inference -> confidence gate -> Gemini.

`get_llm_validation_and_explanation` is imported by name so it can be replaced
with a stub in tests. That makes this module the patch target for the AI call
(previously `backend.index`, which no longer holds the call site).
"""
from backend.ai.gemini_service import get_llm_validation_and_explanation
from backend.core.config import CONFIDENCE_THRESHOLD
from backend.ml.explainability import explain_prediction
from backend.ml.predictor import predict
from backend.ml.preprocessing import (
    derive_age_group,
    normalize_categoricals,
    preprocess_input,
)

LOW_CONFIDENCE_MESSAGE = (
    "The AI confidence is below the safety threshold (35%). "
    "The symptoms provided may be too broad or ambiguous for a reliable prediction. "
    "Please consult a qualified healthcare professional."
)


def run_prediction(data) -> dict:
    """Run the full ML + AI pipeline for a validated request.

    Returns a dict shaped exactly like the pre-refactor response.
    """
    user_dict = data.model_dump() if hasattr(data, "model_dump") else data.dict()

    # Map age to Age_Group labels matching the trained encoder exactly
    user_dict["Age_Group"] = derive_age_group(user_dict["Age"])

    # Normalise unseen categorical values to their closest valid encoder class
    normalize_categoricals(user_dict)

    # Preprocess using the ML model pipeline (encoding + TF-IDF + scaling)
    scaled_features = preprocess_input(user_dict)

    # Predict disease label and confidence
    prediction, confidence = predict(scaled_features)

    if confidence < CONFIDENCE_THRESHOLD:
        # No explanation on this path on purpose: naming the features that
        # support a condition the system is simultaneously declining to name
        # would present an unreliable guess as a finding.
        return {
            "prediction": "Inconclusive Data",
            "confidence": round(confidence, 2),
            "recommendation": LOW_CONFIDENCE_MESSAGE,
            "ml_prediction": prediction,
        }

    # The model's real per-feature contributions for the condition it chose.
    # None when the deployed estimator exposes no coefficients; the response
    # schema treats that as optional rather than inventing an explanation.
    explanation = explain_prediction(user_dict, scaled_features, prediction)

    # Get LLM Ayurvedic explanation from Gemini
    llm_response = get_llm_validation_and_explanation(user_dict, prediction, confidence)

    return {
        "prediction": prediction,
        "confidence": round(confidence, 2),
        "recommendation": str(llm_response),
        "explanation": explanation,
    }
