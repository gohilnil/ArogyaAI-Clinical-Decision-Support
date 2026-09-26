"""Liveness/health routes."""
from fastapi import APIRouter

from backend.core.config import API_TITLE, DISCLAIMER
from backend.ml.model_loader import encoders, model_components
from backend.schemas.common import HealthResponse, RootResponse

router = APIRouter()


@router.get("/", response_model=RootResponse)
def read_root():
    return {
        "message": "Welcome to ArogyaAI API.",
        "docs": "/docs",
        "health": "/api/health",
    }


@router.get("/api/health", response_model=HealthResponse)
def health_check():
    disease_count = len(encoders["Disease"].classes_) if "Disease" in encoders else 0
    # Sourced from the artifact rather than hardcoded, so it can never disagree
    # with the estimator actually loaded. The fallback is deliberately neutral:
    # naming a specific model here once reported a model that was not deployed.
    model_name = model_components.get("model_type", "unknown")
    return {
        "status": "healthy",
        "model": model_name,
        "supported_diseases": disease_count,
        "disclaimer": DISCLAIMER,
    }
