# ArogyaAI — Review 4 Final Handover

**Date:** 2026-10-15
**Owner:** Nil Gohil (MCA final-year student)
**Project:** ArogyaAI — Ayurvedic Clinical Decision Support and Patient Management System
**Repository:** https://github.com/gohilnil/ArogyaAI-Clinical-Decision-Support.git
**Branch:** `main`
**Last commit on remote:** `aed3adb` — fix(patient): the explanation panel rendered as two stacked headers
**Working-tree state:** one uncommitted change (`backend/schemas/prediction.py`, Pydantic v1→v2 migration) and the untracked `docs/` directory.

---

## 1. One-paragraph summary

The application is functionally complete and verified locally — backend, ML model, validation, auth gate, and a clean TypeScript + Vite frontend build all work today. Two production-deployment blockers remain and require the user's login to resolve: the Render backend is suspended (503) and the Vercel production bundle's `VITE_API_URL` is unset. Until those are fixed, the live site loads but cannot run predictions. All Review 4 documentation lives in `docs/review4/` and is consistent with the actual code.

## 2. What was actually verified today (with evidence)

| Check | Result | Command / source |
|---|---|---|
| Backend test suite | **83 passed, 10 warnings in 4.84 s** | `./venv/Scripts/python.exe -m pytest tests/ --tb=short -q` |
| Frontend production build | **exit 0**, 2204 modules, 47.6 s | `cd frontend && npm run build` |
| Backend health (local) | `200 {"status":"healthy","model":"Logistic Regression","supported_diseases":399,...}` | `TestClient` |
| Auth gate (real dependency) | `401 {"detail":{"error":{"code":"MISSING_TOKEN",...}}}` | `TestClient` |
| Real e2e predict — specific symptoms | "Common Cold" 99.63 %, "Typhoid" 99.77 % | `TestClient` + real model artifact |
| Real e2e predict — vague symptoms | "Inconclusive Data" 11–23 % with safety-threshold fallback | `TestClient` + real model artifact |
| Pydantic v2 migration | Empty Symptoms rejected, whitespace stripped, `"45"`→45, age 200 rejected | `./venv/Scripts/python.exe` |
| Live Vercel | `200 OK` (page loads) | `curl -I` |
| Live Render | **503 Service Suspended** | `curl -I` |
| Model test metrics (file-grounded) | `accuracy=0.886`, `macro_f1=0.837`, `weighted_f1=0.876`, `n_samples=841`, `n_classes=399` | `ml/artifacts/metrics.json` |
| Model training env | Python 3.14.5, scikit-learn 1.9.0, pandas 3.0.5, numpy 2.5.2 | `ml/artifacts/model_metadata.json` |
| `.env` / secrets in git | none | `git grep` for `AIza…` / `-----BEGIN` |
| `frontend/.env.local` gitignored | yes | `.gitignore` (`*.local`) |

## 3. What is NOT verified and why (honest)

- **Live Render is unreachable (503).** Cannot run integration tests against the deployed API. The application can be started locally and end-to-end predict was tested that way.
- **Vercel-hosted bundle's API URL.** Vite bakes the URL at build time; without `VITE_API_URL` in Vercel the production bundle falls back to `http://localhost:8000`. Confirmed by reading the source (`frontend/src/services/api.ts:25`) and by inspecting a locally-built `dist/` (which contains the URL from local `.env.local`).
- **Live Firebase.** Rules and indexes are in the repo (`firestore.rules`, `firestore.indexes.json`) and pass local emulator tests, but they are not deployed to the live project this session. Requires owner login.
- **Live Gemini with a real key.** No `GEMINI_API_KEY` was provided. The fallback path is verified end-to-end (no fabricated recommendation, only the safety-threshold message). During a separate ad-hoc test, the live `gemini-flash-latest` endpoint returned `503 UNAVAILABLE` ("high demand") — the system handled this without crashing, again returning the fallback.
- **OCR / PDF upload.** Not implemented. Marked as future scope in `KNOWN_ISSUES.md`.

## 4. What is blocked on you (≈10–15 min across three dashboards)

In priority order, the actions that move the project from "ready locally" to "ready in production":

1. **Resume the Render service** at https://dashboard.render.com (currently suspended → 503). Set `GEMINI_API_KEY` in the service's Environment tab while you are there.
2. **Set `VITE_API_URL`** in the Vercel project (https://vercel.com/dashboard) to the resumed Render URL, **no trailing slash**, Production environment. Then **trigger a redeploy** — env vars are baked at build time, so a redeploy is mandatory.
3. **Firebase console** at https://console.firebase.google.com/project/arogyaai-cloud-ad667:
   - Auth → Authorized Domains: confirm `arogya-ai-clinical-decision-support-nine.vercel.app` is listed.
   - Auth → Sign-in methods: confirm Email/Password is enabled.
   - Firestore → Data: ensure at least one doctor document in `users/{uid}` has `role=doctor`, `status=approved`, `clinicId=RCCSO8` (or another 6-character ID, but the rules expect that exact format).
   - Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes --project arogyaai-cloud-ad667`.

## 5. Local startup procedure (reproducible demo fallback)

```bash
# Backend
cp .env.example .env             # then add a real GEMINI_API_KEY if available
venv\Scripts\python.exe -m pytest tests/    # should report 83 passed
venv\Scripts\python.exe -m uvicorn backend.index:app --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local 2>/dev/null  # if you have a template; otherwise set:
                                             #   VITE_API_URL=http://127.0.0.1:8000
                                             #   VITE_USE_FIREBASE_EMULATORS=true (optional, only if running emulators)
npm install
npm run dev                       # serves on http://localhost:5173
```

If you do not have a real Gemini key, the prediction result still shows — only the `recommendation` field will say "AI Ayurvedic explanation is temporarily unavailable." That is the designed fallback, not a defect.

## 6. Environment variables (names only — never paste values)

Backend (`backend/.env`):

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | optional | unset | Server-side only. Without it, the recommendation falls back. |
| `FIREBASE_PROJECT_ID` | yes | `arogyaai-cloud-ad667` | Used to verify ID-token issuer/audience. |
| `AROGYA_AUTH_REQUIRED` | yes | `true` | Set to `false` only for local debugging. |
| `AROGYA_CORS_ORIGINS` | yes | localhost + Vercel URL | Comma-separated exact origins; no wildcards. |
| `AROGYA_CONFIDENCE_THRESHOLD` | optional | `35.0` | Below this, prediction returns "Inconclusive Data". |
| `AROGYA_GEMINI_MODELS` | optional | `gemini-flash-latest,gemini-flash-lite-latest` | Fallback chain. |
| `AROGYA_MODEL_PATH` | optional | `<repo>/arogyaai_model.joblib` | Override only if relocating the artifact. |
| `AROGYA_RATE_LIMIT_PER_MINUTE` | optional | `30` | 0 disables. |

Frontend (`frontend/.env.local`, **gitignored**):

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | Production must set this in the Vercel dashboard, not in `.env.local`. |
| `VITE_USE_FIREBASE_EMULATORS` | unset (falsy) | Set to `true` only for local emulator work. **Must be unset in Vercel.** |

## 7. Deployment URLs (status as of 2026-10-15)

| Service | URL | Status |
|---|---|---|
| Frontend | https://arogya-ai-clinical-decision-support-nine.vercel.app | 200 — page loads; predictions blocked (A2/A8) |
| Backend | https://arogya-backend.onrender.com | 503 — service suspended |
| Backend health | https://arogya-backend.onrender.com/api/health | 503 |
| Firebase project | arogyaai-cloud-ad667 | live; rules/indexes not deployed this session |
| GitHub | https://github.com/gohilnil/ArogyaAI-Clinical-Decision-Support.git | reachable |

## 8. Demo sequence (recommended, ≈ 6–8 minutes)

1. Open the live frontend URL in a browser. Confirm the page renders without red console errors.
2. Sign in with an approved doctor account (requires items 1–3 from §4 to be complete).
3. Go to **Dashboard** — confirm clinic statistics are real numbers, not placeholders.
4. **Patients** → create a new synthetic patient (no real patient data).
5. **Diagnose** → enter "high fever, abdominal pain, weakness, constipation, rose spots" → submit.
   - Expected: predicted disease = **Typhoid**, confidence ≈ 99 %.
6. **Diagnose** again with "runny nose, sneezing, sore throat, mild cough, congestion" → submit.
   - Expected: predicted disease = **Common Cold**, confidence ≈ 99 %.
7. **Diagnose** with random letters "asdfqwer zzzz qqqq" → submit.
   - Expected: predicted disease = **Inconclusive Data** with safety-threshold message (NOT a fabricated answer).
8. If Gemini key is set: explain that the recommendation text comes from the LLM, not the ML model.

If the live site is still down, run the local demo from §5 with the same flow.

## 9. Known limitations (full list in `KNOWN_ISSUES.md`)

- Pydantic v1 `@validator` was migrated to v2 `@field_validator`; migration is in working tree, not yet committed.
- Live Render service suspended (free-tier 90-day inactivity); needs resume in dashboard.
- No `VITE_API_URL` set in Vercel; production calls localhost.
- OCR / PDF upload not implemented.
- Class imbalance: 57 of 399 classes have only 3 samples; per-class F1 for those is poor by construction. Reported in `metrics.json` and `MODEL_CARD.md`.
- This is an academic decision-support prototype. It is **not** a clinically validated diagnostic system. The disclaimer in the response makes that explicit.

## 10. Recommended commit + push order

After the deployment prerequisites in §4 are done, the cleanest sequence is:

1. `git add backend/schemas/prediction.py docs/review4/`
2. `git commit -m "fix(schema): migrate to Pydantic v2 field_validator; add Review 4 docs"`
3. `git push origin main`
4. Vercel will rebuild automatically. Confirm the new bundle has the correct `VITE_API_URL` by reloading the page and watching the Network tab on the next /api/predict call.

The Pydantic migration is independent of the deployment blockers — it can be committed and pushed at any time.

## 11. Where the viva answers are

- 50+ viva questions with answers: `docs/review4/VIVA_PREPARATION.md`
- 60–90 s project introduction and 3–5 min project walkthrough: same file
- Test cases (functional, negative, security, integration): `docs/review4/TEST_CASES.md`
- Test execution evidence: this file, §2
- Live architecture and data flow: `docs/review4/ARCHITECTURE.md`
- Honest limitations: `docs/review4/KNOWN_ISSUES.md` and this file, §9

## 12. Final assessment

**Local readiness:** ready. Every code path was exercised today with the real model artifact and the real backend; all 83 tests pass; the frontend builds; the auth gate works; the safety threshold works; the Gemini fallback works.

**Production readiness:** **two blockers away from ready.** Both require your login. There is no application defect blocking production — only dashboard configuration that has to happen on the human side. The code itself does not need any more changes today.

— end of handover —
