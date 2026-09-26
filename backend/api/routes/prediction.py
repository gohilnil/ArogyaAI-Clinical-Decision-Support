"""Prediction route: ML inference plus Ayurvedic contextual analysis."""
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from backend.core.logging import logger
from backend.core.rate_limit import enforce_rate_limit
from backend.core.security import require_user
from backend.schemas.prediction import PredictRequest, PredictResponse
from backend.services.prediction_service import run_prediction

router = APIRouter()


@router.post(
    "/api/predict",
    response_model=PredictResponse,
    dependencies=[Depends(enforce_rate_limit)],
)
def predict_disease(
    data: PredictRequest,
    user: Dict[str, Any] = Depends(require_user),
):
    """
    Run ML-based disease prediction followed by Gemini LLM Ayurvedic analysis.
    Returns prediction, confidence score, and personalised Ayurvedic recommendation.
    """
    try:
        return run_prediction(data)
    except ValueError as ve:
        # Validation errors (safe to surface to client)
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        # Log full error server-side; return a generic safe message to client
        logger.error("Prediction error: %s", str(e), exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An internal error occurred during analysis. Please try again.",
        )
