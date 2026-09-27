"""Gemini integration for the Ayurvedic contextual explanation.

Uses the supported `google-genai` SDK. The previous `google-generativeai`
package was retired by Google and printed a deprecation notice on every import:

    All support for the `google.generativeai` package has ended.

The migration was previously deferred because it could not be verified without a
live API key. It has now been performed and verified against the real provider:
both aliases in the fallback chain return text through the new SDK.

A second, separate defect was found while verifying: every *pinned* model name
is now rejected by the provider. `gemini-2.5-flash` (and `gemini-2.0-flash`,
and their lite variants) answer

    404 NOT_FOUND ... is no longer available to new users

so the third entry of the old chain could never succeed. The chain is now the
two `-latest` aliases, which resolve against whichever current flash model the
provider offers, and the dead entry is gone rather than left to fail on every
request.

The model fallback chain is tried in order; when every model fails the caller
gets a safe message and the full provider error is logged server-side only. The
provider error is never appended to the client-facing message, because it can
disclose quota and credential state.
"""
from google import genai

from backend.ai.prompts import build_prompt
from backend.core.config import GEMINI_API_KEY, GEMINI_MODELS
from backend.core.logging import logger

UNAVAILABLE_MESSAGE = (
    "AI Ayurvedic explanation is temporarily unavailable. "
    "The model prediction shown above is unaffected; please consult a "
    "qualified healthcare professional."
)

_client = None


def _get_client():
    """Lazily build the Gemini client.

    Lazy rather than module-scope because the client construction raises when no
    API key is configured, and this module is imported by the API and the test
    suite alike. Import-time failure would take down the whole backend (and the
    prediction path, which does not need the LLM at all) over a missing optional
    key. Building it on first use confines the failure to the one call that
    actually needs it.
    """
    global _client
    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def get_llm_validation_and_explanation(user_data, ml_prediction, confidence):
    """
    Uses the Gemini LLM to provide a personalised Ayurvedic explanation of the
    model's prediction.

    Returns the generated text, or a safe fallback message when the key is
    missing or every model in the chain fails.
    """
    if not GEMINI_API_KEY:
        logger.error(
            "GEMINI_API_KEY is not set; returning the static fallback. "
            "The ML prediction is unaffected."
        )
        return UNAVAILABLE_MESSAGE

    prompt = build_prompt(user_data, ml_prediction, confidence)

    try:
        client = _get_client()
    except Exception as e:  # noqa: BLE001 - client construction is provider-defined
        logger.error("Could not initialise the Gemini client: %s", str(e))
        return UNAVAILABLE_MESSAGE

    last_error = None
    for model_name in GEMINI_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name, contents=prompt
            )
            text = getattr(response, "text", None)
            if not text:
                # A candidate can come back without text (safety block, empty
                # response). Treat it as a failure of this model so the chain
                # continues, rather than returning None to the caller.
                raise ValueError("provider returned no text")
            return text
        except Exception as e:  # noqa: BLE001 - any provider failure falls through
            last_error = e
            logger.warning("Gemini model '%s' failed: %s", model_name, str(e))
            continue

    logger.error(
        "All Gemini models failed; returning the static fallback. Last error: %s",
        str(last_error),
    )
    return UNAVAILABLE_MESSAGE
