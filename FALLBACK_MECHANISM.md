# ArogyaAI — Degradation Behaviour When the LLM Is Unavailable

**Status:** describes the current implementation. Verified against
`backend/ai/gemini_service.py` and `backend/services/prediction_service.py` at
commit `2ab0df9`.

> **This document replaces an earlier version that was inaccurate.** The previous
> text described an "offline mode" backed by an Ayurvedic recommendation
> database, with functions `load_ayurvedic_database()` and
> `get_fallback_recommendations()`, a test script `test_fallback.py`, and claims
> of "100% accuracy", "works in air-gapped environments" and "HIPAA-friendly".
> **None of that exists in this codebase.** Those functions and that script are
> absent (verified by search), the accuracy claims were withdrawn in Phase 5 as
> leakage-contaminated, and no HIPAA assessment has ever been performed. Any
> reader who relied on the old text should disregard it.

## What actually happens

ArogyaAI has two independent stages, and only the second one depends on an
external service:

| Stage | Runs | Depends on the network? |
|---|---|---|
| **Model prediction** | In-process scikit-learn model (`arogyaai_model.joblib`) | **No.** Loaded at startup, scored locally. |
| **Ayurvedic explanation** | Google Gemini API | **Yes.** Requires an API key and connectivity. |

The first stage always works as long as the backend process is running. It does
not call out to anything. If the Gemini call fails for any reason, the second
stage degrades and the first is unaffected.

## The LLM fallback chain

`backend/ai/gemini_service.py` iterates `GEMINI_MODELS` in order
(`AROGYA_GEMINI_MODELS`, default `gemini-flash-latest`,
`gemini-flash-lite-latest`). Each attempt is wrapped so a failure moves to the
next model rather than raising.

Both entries are provider-maintained `-latest` aliases, and that is deliberate:
every pinned model name was verified to be rejected by the provider with
`404 ... no longer available to new users` — including `gemini-2.5-flash`, which
was the third entry until 2026-09-27 and could never succeed. Do not add a
version-pinned name here expecting it to work.

If **every** model fails, the function returns a fixed message:

```
AI Ayurvedic explanation is temporarily unavailable.
The model prediction shown above is unaffected; please consult a
qualified healthcare professional.
```

The provider error is written to the server log, **not** returned to the client.
(An earlier version appended `(Details: ...)` to the client-visible message; that
was removed because it exposed internal provider state.)

The API response in this case still contains a valid `prediction`, `confidence`
and `explanation`. Only `recommendation` becomes the fixed message. The response
is HTTP 200, not an error — the analysis succeeded; only the narrative is
missing.

## What does not exist

Stated plainly, because the previous version of this file claimed otherwise:

- **No offline Ayurvedic recommendation database.** Recommendations come only
  from the LLM.
- **No `load_ayurvedic_database()` or `get_fallback_recommendations()`.**
- **No `test_fallback.py`.**
- **No offline/online mode indicator or badge** in the UI.
- **No air-gapped deployment path.** The backend is a networked HTTP API.

## What the dataset is (and is not)

`enhanced_ayurvedic_treatment_dataset.csv` is the **training** dataset: 4,201
rows across 399 disease labels, used by `ml/train.py`. It contains treatment
columns (herbs, therapies, dietary notes), but the running application never
reads them. In particular it is **not** a runtime lookup table, and the
application does not serve its treatment text to users. It is 4,201 *records*,
not 4,201 distinct diseases.

## Failure modes and how each is handled

| Failure | Behaviour |
|---|---|
| `GEMINI_API_KEY` unset or invalid | Every model attempt fails; fixed fallback message returned. Prediction still valid. |
| Network unreachable | Same as above. |
| Rate limited / quota exhausted | Same as above; the specific error is logged. |
| Model retired / 404 | Next model in the chain is tried; if all fail, fallback message. |
| Model artifact missing at startup | **Process refuses to start** (`backend/ml/model_loader.py` raises `SystemExit`). There is no degraded mode for a missing model. |

## Configuration

```bash
# Optional. Without it, only the Ayurvedic explanation degrades.
GEMINI_API_KEY=your_key_here

# Optional. Comma-separated fallback chain, tried in order.
AROGYA_GEMINI_MODELS=gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash
```

## Operational note

The fixed fallback message is deliberately generic. If it appears for every
request, the cause is in the server log — the client is never told why, by
design, since the reason can include provider credentials and quota state.

**Last reviewed:** 2026-09-26 (Phase 18 documentation truthfulness pass).
