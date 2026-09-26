"""Clean FastAPI application entry point.

Run with:
    uvicorn backend.main:app --host 127.0.0.1 --port 8000

The legacy entry point `backend.index:app` continues to work (it re-exports this
app) so the existing Render configuration and test suite are unaffected.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import health, prediction
from backend.core.config import (
    API_DESCRIPTION,
    API_TITLE,
    API_VERSION,
    CORS_ORIGINS,
)


def create_app() -> FastAPI:
    application = FastAPI(
        title=API_TITLE,
        description=API_DESCRIPTION,
        version=API_VERSION,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    application.include_router(health.router)
    application.include_router(prediction.router)
    return application


app = create_app()
