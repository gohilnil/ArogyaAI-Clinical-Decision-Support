"""Schemas shared across routes."""
from pydantic import BaseModel


class RootResponse(BaseModel):
    message: str
    docs: str
    health: str


class HealthResponse(BaseModel):
    status: str
    model: str
    supported_diseases: int
    disclaimer: str
