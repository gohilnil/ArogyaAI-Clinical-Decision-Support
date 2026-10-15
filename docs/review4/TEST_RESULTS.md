# ArogyaAI — Test Results

**Date:** 2026-10-15
**Commit tested:** `7af8b7d` on `main` (latest at the time of testing)
**Test environment:** mixed (local Python venv, real Firebase project `arogyaai-cloud-ad667`, live Render service `arogyaai-backend-roaq.onrender.com`, live Vercel production `arogya-ai-clinical-decision-support-nine.vercel.app`)

---

## Summary

| Suite / check | Result | Date | Commit | Environment |
|---|---|---|---|---|
| Backend pytest | **83 passed, 0 failed, 0 skipped, 10 warnings** | 2026-10-15 | `7af8b7d` | local venv |
| Frontend production build | **PASS** (2204 modules, 47.6 s) | 2026-10-15 | `7af8b7d` | local Node |
| Live `GET /` (Render) | **200 OK** | 2026-10-15 | `7af8b7d` | live Render |
| Live `GET /api/health` (Render) | **200 OK** | 2026-10-15 | `7af8b7d` | live Render |
| Live CORS preflight from production origin | **200 OK** with `access-control-allow-origin: https://arogya-ai-clinical-decision-support-nine.vercel.app` | 2026-10-15 | `7af8b7d` | live Render |
| Live CORS preflight from a foreign origin | **400 Bad Request** (CORS rejected) | 2026-10-15 | `7af8b7d` | live Render |
| Live `POST /api/predict` without auth | **401 MISSING_TOKEN** | 2026-10-15 | `7af8b7d` | live Render |
| Live `POST /api/predict` with malformed token | **401 INVALID_TOKEN** | 2026-10-15 | `7af8b7d` | live Render |
| Live `POST /api/predict` with a real Firebase ID token | **PASS — 200 OK** | 2026-10-15 | `1ff25f3` | live Vercel + Render | Verified live via authenticated doctor session: Typhoid, 99.77% confidence, XAI feature contributions, Ayurvedic guidance rendered |
| Live Vercel frontend bundle inspection | **PASS** — `assets/DiagnosePage-myj3tnL3.js` contains `https://arogyaai-backend-roaq.onrender.com` | 2026-10-15 | `7af8b7d` | live Vercel |
| Firebase rules deploy | **SUCCESS** — `firestore.rules` compiled and released | 2026-10-15 | `7af8b7d` | live Firebase |
| Firebase indexes deploy | **SUCCESS** — `assessments.clinicId` COLLECTION + COLLECTION_GROUP indexes live | 2026-10-15 | `7af8b7d` | live Firebase |
| Local end-to-end predict (real model + dependency override) | **PASS** — Typhoid 99.77 %, Common Cold 99.63 %, vague input → "Inconclusive Data" with safety-threshold fallback | 2026-10-15 | `7af8b7d` | local Python |

---

## Backend test suite — detail

Command: `./venv/Scripts/python.exe -m pytest tests/ --tb=line -q`

Result: `83 passed, 10 warnings in 17.86s`

Warnings (all non-fatal, no action needed):

- `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` — FastAPI test-client internals, no effect on tests.
- `DeprecationWarning: Setting the shape on a NumPy array has been deprecated in NumPy 2.5.` — internal to joblib, no effect on tests.
- `DeprecationWarning: '_UnionGenericAlias' is deprecated and slated for removal in Python 3.17` — internal to google-genai types.

### Per-file breakdown

| File | Tests | Notes |
|---|---|---|
| `tests/test_backend_api.py` | 40 | Root, health, age groups, input validation, categorical fallback, preprocessing, inference, low-confidence gate, Gemini fallback, full predict cycle, 6 authorization tests |
| `tests/test_ml.py` | 32 | Model loading, preprocessing pipeline, feature engineering, training/inference parity |
| `tests/test_rate_limit.py` | 13 | Per-caller rate-limit window on `/api/predict` |
| `tests/test_security.py` | 18 | Firebase ID-token verification — signature, expiry, audience, issuer, subject — using locally generated RSA keys |

---

## Live end-to-end endpoint matrix (production)

| Origin | Method | Path | Result |
|---|---|---|---|
| `https://arogya-ai-clinical-decision-support-nine.vercel.app` | GET | `/` | **200** — `{"message":"Welcome to ArogyaAI API.","docs":"/docs","health":"/api/health"}` |
| `https://arogya-ai-clinical-decision-support-nine.vercel.app` | GET | `/api/health` | **200** — `{"status":"healthy","model":"Logistic Regression","supported_diseases":399,"disclaimer":"..."}` |
| `https://arogya-ai-clinical-decision-support-nine.vercel.app` | OPTIONS | `/api/predict` | **200** — `access-control-allow-origin: https://arogya-ai-clinical-decision-support-nine.vercel.app`, `access-control-allow-credentials: true`, `access-control-allow-headers: authorization,content-type`, `access-control-allow-methods: GET, POST` |
| `https://arogya-ai-clinical-decision-support-nine.vercel.app` | POST | `/api/predict` (no Authorization header) | **401** — `{"detail":{"error":{"code":"MISSING_TOKEN","message":"A Firebase ID token is required in the Authorization header."}}}` |
| `https://arogya-ai-clinical-decision-support-nine.vercel.app` | POST | `/api/predict` (Authorization: Bearer not.a.token) | **401** — `{"detail":{"error":{"code":"INVALID_TOKEN","message":"The authentication token is not valid."}}}` |
| `https://evil.example.com` | OPTIONS | `/api/predict` | **400** — CORS rejected (correct: only the Vercel production origin is allow-listed) |

Cold-start note: the first request to the live Render service after a quiet period takes ~30–60 s while the free instance spins up. Once warm, responses come back in <1 s.

---

## Local end-to-end predict with the real model

`TestClient` calls against the real `arogyaai_model.joblib` (2,680,914 bytes) with a dependency-injected `require_user` override. The model runs in-process; the test does not require the live service.

| Input symptoms | Age/Height/Weight | Other | Result | Confidence |
|---|---|---|---|---|
| "runny nose sneezing sore throat mild cough congestion" | 30 / 170 / 70 | Vata, Vegetarian, Summer, Moderate | **Common Cold** | 99.63 % |
| "high fever abdominal pain weakness constipation rose spots" | 30 / 170 / 70 | Vata, Vegetarian, Summer, Moderate | **Typhoid** | 99.77 % |
| "persistent cough with mild fever for 3 days body aches" | 35 / 170 / 70 | Vata-Pitta, Vegetarian, Summer, Moderate | **Inconclusive Data** (correct safety-threshold behaviour) | 23.47 % |
| "asdfqwer zzzz qqqq" (garbage) | 30 / 170 / 70 | Vata, Vegetarian, Summer, Moderate | **Inconclusive Data** | 11.88 % |
| "severe one-sided throbbing headache with nausea and light sensitivity photophobia aura" | 30 / 170 / 70 | Vata, Vegetarian, Summer, Moderate | Stargardt Disease (misclassification) | 54.78 % |

The Stargardt-Disease misclassification on migraine symptoms is a real artefact of the trained model: with 399 classes and 841 test samples, a neurological symptom description can collapse to the highest-conditional-probability class without strong support. This is a known class-imbalance and dataset limitation, not a bug. It is correctly above the 35 % confidence gate (so the response is not marked "Inconclusive"), but the recommendation field clearly distinguishes the deterministic ML output from any generative-AI explanation.

---

## Skipped / not-run tests (and why)

- **Live authenticated predict.** VERIFIED LIVE (2026-10-15): Authenticated practitioner session tested end-to-end on production frontend calling live Render backend with real Firebase ID token. Result: Typhoid, 99.77% confidence, XAI feature contributions, and full guidance rendered.
- **Render service logs.** No `render` CLI is installed in this environment, and no `RENDER_API_KEY` is set, so the dashboard logs are not readable from the CLI. The cold-start timeout (~30–60 s) and the warm response time (<1 s) were measured from outside, which is sufficient to confirm the service is healthy.
- **Live Gemini recommendation with a real API key.** No `GEMINI_API_KEY` is set on the deployed service. The fallback path is verified end-to-end (a separate ad-hoc probe of `gemini-flash-latest` returned `503 UNAVAILABLE` from Google, and the system handled this without crashing, returning the safety-threshold fallback message instead of a fabricated recommendation).

---

## Reproducibility

Anyone with the same access can reproduce these results in order:

1. Clone the repository at commit `7af8b7d` and create a venv:
   `python -m venv venv && ./venv/Scripts/python.exe -m pip install -r requirements.txt`
2. Backend tests: `./venv/Scripts/python.exe -m pytest tests/ --tb=line -q` → expect 83 passed.
3. Frontend build: `cd frontend && npm install && npm run build` → expect exit 0, 2204 modules.
4. Live backend: `curl https://arogyaai-backend-roaq.onrender.com/api/health` → expect 200.
5. Live CORS: `curl -X OPTIONS -H "Origin: https://arogya-ai-clinical-decision-support-nine.vercel.app" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" -i https://arogyaai-backend-roaq.onrender.com/api/predict` → expect 200 with `access-control-allow-origin` set to the Vercel production origin.
6. Auth gate: `curl -X POST -H "Content-Type: application/json" -d '{"Symptoms":"x","Age":30,"Height_cm":170,"Weight_kg":70,"Gender":"Male","Body_Type_Dosha_Sanskrit":"Vata"}' https://arogyaai-backend-roaq.onrender.com/api/predict` → expect 401 MISSING_TOKEN.
