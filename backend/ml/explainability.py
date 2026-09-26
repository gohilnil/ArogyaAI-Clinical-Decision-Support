"""Genuine per-prediction explanations for the deployed linear model.

For multinomial logistic regression the model's score (logit) for class *k* is

    logit_k = intercept_k + SUM_i( coef[k, i] * x[i] )

where *x* is the scaled feature vector the inference preprocessing produced.
That identity is exact, so each term ``coef[k, i] * x[i]`` is that feature's real
contribution to the score the model used when it chose class *k*. Nothing here is
approximated and nothing is invented: the contributions sum back to the logit to
within floating point, which ``tests/test_ml.py`` asserts.

Limits, stated plainly so the UI cannot overclaim:

  * A contribution is a term in the model's SCORE, not a change in probability,
    and not a cause. "Supports" means the feature pushed the score up for the
    predicted condition; it is not evidence that the feature caused anything.
  * Contributions are computed in the standardised feature space, because that
    is the space the coefficients live in. The reported ``input_value`` is the
    raw value so the reader can see what they entered.
  * Only linear models expose per-feature coefficients. If the deployed
    estimator is not linear this returns ``None`` rather than fabricating an
    explanation the model cannot support.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from backend.ml.model_loader import encoders, model, scaler, vectorizer

# How many features to return, ranked by absolute contribution.
MAX_FEATURES = 8

# Human names for the structured columns, keyed by the name the scaler stored.
_STRUCTURED_LABELS: Dict[str, str] = {
    "Age": "Age",
    "Height_cm": "Height",
    "Weight_kg": "Weight",
    "BMI": "BMI",
    "Age_Group_encoded": "Age group",
    "Gender_encoded": "Gender",
    "Body_Type_Dosha_Sanskrit_encoded": "Body constitution (dosha)",
    "Food_Habits_encoded": "Food habits",
    "Current_Medication_encoded": "Current medication",
    "Allergies_encoded": "Allergies",
    "Season_encoded": "Season",
    "Weather_encoded": "Weather",
}

# For an encoded categorical column, show the original label rather than the code.
_ENCODED_SOURCE: Dict[str, str] = {
    "Age_Group_encoded": "Age_Group",
    "Gender_encoded": "Gender",
    "Body_Type_Dosha_Sanskrit_encoded": "Body_Type_Dosha_Sanskrit",
    "Food_Habits_encoded": "Food_Habits",
    "Current_Medication_encoded": "Current_Medication",
    "Allergies_encoded": "Allergies",
    "Season_encoded": "Season",
    "Weather_encoded": "Weather",
}

NOTE = (
    "Each value is the model's own term for the predicted condition: the "
    "coefficient for that feature multiplied by its value. They add up to the "
    "condition's model score. A positive value pushed the model toward this "
    "condition and a negative value pushed away. This is not a statement that "
    "the feature caused the condition."
)


def supports_explanations(estimator: Any = None) -> bool:
    """Whether the given (or deployed) estimator can produce real contributions."""
    estimator = model if estimator is None else estimator
    return hasattr(estimator, "coef_") and hasattr(estimator, "classes_")


def _raw_symptom_weights(user_data: Dict[str, Any]) -> np.ndarray:
    """The unscaled TF-IDF weights for the caller's symptom text."""
    text = user_data.get("Symptoms", "") or ""
    return vectorizer.transform([text]).toarray()[0]


def _structured_input_values(user_data: Dict[str, Any]) -> Dict[str, str]:
    """Raw, human-readable input values for the structured columns."""
    values: Dict[str, str] = {}

    age = user_data.get("Age")
    if age is not None:
        values["Age"] = f"{age}"
    height = user_data.get("Height_cm")
    if height is not None:
        values["Height_cm"] = f"{height} cm"
    weight = user_data.get("Weight_kg")
    if weight is not None:
        values["Weight_kg"] = f"{weight} kg"
    try:
        bmi = float(weight) / (float(height) / 100.0) ** 2
        values["BMI"] = f"{bmi:.1f}"
    except (TypeError, ValueError, ZeroDivisionError):
        pass

    for encoded, source in _ENCODED_SOURCE.items():
        raw = user_data.get(source)
        if raw is not None:
            values[encoded] = str(raw)
    return values


def _resolve_index(predicted_label: Optional[str], scaled_features: np.ndarray) -> Optional[int]:
    """The class index the explanation is for.

    Prefers the label the caller was actually shown, so the explanation always
    matches the prediction on screen; falls back to the model's own argmax.
    """
    disease_encoder = encoders.get("Disease")
    if predicted_label is not None and disease_encoder is not None:
        try:
            return int(disease_encoder.transform([predicted_label])[0])
        except ValueError:
            # Label not in the encoder (e.g. a neutralised label): fall through.
            pass
    try:
        return int(np.asarray(model.predict(scaled_features)).ravel()[0])
    except Exception:
        return None


def explain_prediction(
    user_data: Dict[str, Any],
    scaled_features: np.ndarray,
    predicted_label: Optional[str] = None,
    max_features: int = MAX_FEATURES,
) -> Optional[Dict[str, Any]]:
    """Return the model's real per-feature contributions, or None if unsupported.

    Never raises: an explanation is a reporting concern, so any structural
    mismatch returns None rather than breaking a prediction that succeeded.
    """
    if not supports_explanations():
        return None

    x = np.asarray(scaled_features, dtype=float)
    if x.ndim == 2:
        x = x[0]
    if x.ndim != 1:
        return None

    coef = np.asarray(model.coef_, dtype=float)
    if coef.ndim != 2 or coef.shape[1] != x.shape[0]:
        return None

    index = _resolve_index(predicted_label, scaled_features)
    if index is None or not (0 <= index < coef.shape[0]):
        return None

    feature_names = list(scaler.get_feature_names_out())
    contributions = coef[index] * x
    if len(feature_names) != contributions.shape[0]:
        return None

    raw_symptoms = _raw_symptom_weights(user_data)
    structured_values = _structured_input_values(user_data)
    terms = vectorizer.get_feature_names_out()

    items: List[Dict[str, Any]] = []
    for i, name in enumerate(feature_names):
        contribution = float(contributions[i])
        if name.startswith("tfidf_"):
            token_index = int(name[len("tfidf_"):])
            term = str(terms[token_index]) if 0 <= token_index < len(terms) else name
            raw = (
                float(raw_symptoms[token_index])
                if 0 <= token_index < raw_symptoms.shape[0]
                else 0.0
            )
            # A term the caller never actually typed contributes 0 and is noise
            # in the ranking; keep only the terms their text produced.
            if raw <= 0.0:
                continue
            items.append({
                "feature": term,
                "group": "symptom",
                "input_value": f"{raw:.3f}",
                "contribution": contribution,
                "direction": "supports" if contribution >= 0 else "opposes",
            })
        else:
            items.append({
                "feature": _STRUCTURED_LABELS.get(name, name),
                "group": "profile",
                "input_value": structured_values.get(name, ""),
                "contribution": contribution,
                "direction": "supports" if contribution >= 0 else "opposes",
            })

    items.sort(key=lambda item: abs(item["contribution"]), reverse=True)
    items = items[:max_features]

    intercept = float(np.asarray(model.intercept_, dtype=float).ravel()[index])

    predicted_class = str(
        encoders["Disease"].inverse_transform([index])[0]
    ) if "Disease" in encoders else str(index)

    return {
        "method": "logit-contribution",
        "predicted_class": predicted_class,
        "intercept": intercept,
        # Sum over every feature, not just the returned top-N, so the identity
        # intercept + total == model score can be checked by a reader.
        "total_contribution": float(np.sum(contributions)),
        "features": items,
        "note": NOTE,
    }
