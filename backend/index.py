"""Compatibility entry point.

Historically this module held the whole backend; it now re-exports the app and
the public names that other code (render.yaml, the test suite) still imports, so
`uvicorn backend.index:app` keeps working without change.

New code should import from `backend.main` and the submodules instead.
"""
from backend.main import app, create_app  # noqa: F401
from backend.ml.model_loader import encoders, model, model_components  # noqa: F401
from backend.ml.preprocessing import (  # noqa: F401
    derive_age_group,
    normalize_categoricals,
    preprocess_input,
)
from backend.ai.gemini_service import (  # noqa: F401
    get_llm_validation_and_explanation,
)
from backend.schemas.prediction import (  # noqa: F401
    PredictRequest,
    VALID_ALLERGIES,
    VALID_DOSHAS,
    VALID_FOOD_HABITS,
    VALID_GENDERS,
    VALID_MEDICATIONS,
    VALID_SEASONS,
    VALID_WEATHER,
)

__all__ = [
    "app",
    "create_app",
    "derive_age_group",
    "normalize_categoricals",
    "preprocess_input",
    "get_llm_validation_and_explanation",
    "model",
    "encoders",
    "model_components",
    "PredictRequest",
    "VALID_GENDERS",
    "VALID_DOSHAS",
    "VALID_FOOD_HABITS",
    "VALID_MEDICATIONS",
    "VALID_ALLERGIES",
    "VALID_SEASONS",
    "VALID_WEATHER",
]
