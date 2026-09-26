"""Gemini integration for the Ayurvedic contextual explanation.

The model fallback chain is tried in order; when every model fails the caller
gets a safe message and the full provider error is logged server-side only.

The provider error used to be appended to the client-facing message
(`Details: ...`), which exposed internal provider state to users. It is now
logged instead, so operators keep the diagnostic detail and clients do not.

KNOWN MAINTENANCE ITEM — the SDK is end-of-life
-----------------------------------------------
This module uses `google-generativeai`, which Google has retired in favour of
`google-genai`. The installed package prints a deprecation notice on import:

    All support for the `google.generativeai` package has ended.

The code below still works. It was NOT migrated because the change cannot be
verified in this environment: it needs a live GEMINI_API_KEY and network access,
and every test stubs `get_llm_validation_and_explanation` wholesale, so a
subtly-wrong migration would leave the suite green while every real request
silently fell back to UNAVAILABLE_MESSAGE. Trading known-working code for an
unverifiable rewrite is the wrong direction.

To migrate (do this where a key is available, and confirm a real generation
returns text rather than the fallback):

    from google import genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    ...
    response = client.models.generate_content(model=model_name, contents=prompt)
    return response.text

Both packages install side by side, so the migration can be done and tested
before `google-generativeai` is dropped from requirements.txt.
"""
import google.generativeai as genai

from backend.ai.prompts import build_prompt
from backend.core.config import GEMINI_API_KEY, GEMINI_MODELS
from backend.core.logging import logger

# Configure the Gemini API client (unchanged from the original module scope).
genai.configure(api_key=GEMINI_API_KEY)

UNAVAILABLE_MESSAGE = (
    "AI Ayurvedic explanation is temporarily unavailable. "
    "The model prediction shown above is unaffected; please consult a "
    "qualified healthcare professional."
)


def get_llm_validation_and_explanation(user_data, ml_prediction, confidence):
    """
    Uses the Gemini LLM to provide a personalised Ayurvedic explanation of the
    model's prediction.

    Returns the generated text, or a safe fallback message when every model in
    the chain fails. The provider error is never returned to the caller.
    """
    prompt = build_prompt(user_data, ml_prediction, confidence)

    last_error = None
    for model_name in GEMINI_MODELS:
        try:
            gemini_model = genai.GenerativeModel(model_name)
            response = gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:  # noqa: BLE001 - any provider failure falls through
            last_error = e
            logger.warning(
                "Gemini model '%s' failed: %s", model_name, str(e)
            )
            continue

    logger.error(
        "All Gemini models failed; returning the static fallback. Last error: %s",
        str(last_error),
    )
    return UNAVAILABLE_MESSAGE
