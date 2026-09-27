"""Environment-driven application configuration.

Values here reproduce the pre-refactor defaults exactly, so moving them out of
module scope changes no runtime behaviour. Anything that was a hardcoded literal
in backend/index.py or arogya_predict.py now lives here and can be overridden by
an environment variable.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Repository root: <root>/backend/core/config.py -> parents[2]
PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = Path(
    os.getenv("AROGYA_MODEL_PATH", str(PROJECT_ROOT / "arogyaai_model.joblib"))
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Model fallback chain. Both entries are provider-maintained aliases that
# resolve to the current flash models, which is deliberate: every PINNED model
# name was verified to be rejected with 404 "no longer available to new users"
# (gemini-2.5-flash, gemini-2.0-flash, and the lite variants). Pinning a version
# here therefore stops working whenever the provider retires it, and the retired
# entry fails on every request while looking like configuration rather than a
# bug. The aliases are the durable choice on the free tier.
GEMINI_MODELS = [
    m.strip()
    for m in os.getenv(
        "AROGYA_GEMINI_MODELS",
        "gemini-flash-latest,gemini-flash-lite-latest",
    ).split(",")
    if m.strip()
]

# Below this ML confidence the API returns "Inconclusive Data" and does not ask
# the LLM for a plan. This is an inherited SAFETY HEURISTIC, not a validated
# cut-off: it was not derived from this model's probability distribution and no
# calibration exists to justify it. Documented as a limitation rather than
# presented as measured.
CONFIDENCE_THRESHOLD = float(os.getenv("AROGYA_CONFIDENCE_THRESHOLD", "35.0"))

ENVIRONMENT = os.getenv("AROGYA_ENVIRONMENT", "development")

# Per-caller ceiling on the authenticated prediction route, in requests per
# minute. That endpoint costs a Gemini call, so it is the one worth bounding.
# Set to 0 to disable (intended only for tests and local debugging).
RATE_LIMIT_PER_MINUTE = int(os.getenv("AROGYA_RATE_LIMIT_PER_MINUTE", "30"))

# --- Authentication ---------------------------------------------------------
# Firebase project whose ID tokens this API accepts. The issuer and audience
# checks are both derived from it.
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "arogyaai-cloud-ad667")

# When true, protected routes require a valid Firebase ID token. Setting it to
# false is intended only for local debugging; it is never disabled in
# production and the default is secure.
AUTH_REQUIRED = os.getenv("AROGYA_AUTH_REQUIRED", "true").strip().lower() in (
    "1",
    "true",
    "yes",
)

# Google's public certificates used to verify Firebase ID token signatures.
# These are public documents: verifying with them means the backend needs no
# service-account private key.
FIREBASE_CERT_URL = os.getenv(
    "AROGYA_FIREBASE_CERT_URL",
    "https://www.googleapis.com/robot/v1/metadata/x509/"
    "securetoken@system.gserviceaccount.com",
)

# Origins allowed to call the API. This is an explicit allowlist: a wildcard is
# deliberately NOT used, because combined with credentialed requests it would
# let any site on the internet call this API with the user's session. Additional
# deployment origins can be supplied via AROGYA_CORS_ORIGINS (comma-separated).
# The deployed frontend origin is listed explicitly. It previously held only
# `https://arogyaai.vercel.app`, which is NOT the address this build serves from
# — so every preflight from the real origin was rejected (400, no allow-origin
# header) and the browser blocked every prediction request, with nothing in the
# server log. A CORS origin has to match the served origin exactly.
#
# `https://arogyaai.vercel.app` is deliberately NOT allowlisted. It serves an
# older generation of this app whose bundle calls a *different* backend
# (`ai-health-n4i4.onrender.com`), so it never calls this API and allowing it
# would only widen the surface. An origin belongs here when it actually
# consumes this service.
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "AROGYA_CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,"
        "http://127.0.0.1:5173,"
        "https://arogya-ai-clinical-decision-support-nine.vercel.app",
    ).split(",")
    if o.strip()
]

API_TITLE = "ArogyaAI API"
API_DESCRIPTION = "AI-powered Ayurvedic Clinical Decision Support System"
API_VERSION = "1.0.0"

DISCLAIMER = (
    "For informational/educational purposes only. "
    "Not a substitute for professional medical advice."
)
