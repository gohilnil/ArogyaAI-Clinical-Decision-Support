# ArogyaAI — Review 4 Execution Tracker

**Project:** ArogyaAI — Ayurvedic Clinical Decision Support and Patient Management System
**Owner:** Nil Gohil (MCA final-year)
**Viva context:** Internal demonstration and academic Review 4
**Date opened:** 2026-10-15
**Last updated:** 2026-10-15
**Branch:** `main` @ `aed3adb` (uncommitted: Pydantic v2 migration in `backend/schemas/prediction.py`)

---

## How to read this file

Every line in the **Status** column is one of:

| Code | Meaning |
|---|---|
| `PASS` | verified successfully with recorded evidence |
| `FAIL` | tested and failed — root cause documented |
| `IN PROGRESS` | active work |
| `BLOCKED` | requires credentials, access, approval, or external service recovery |
| `NOT TESTED` | no valid test has been performed |
| `N/A` | justified with a reason |

A task is **not** complete because code exists — only when its evidence row points to a command output, screenshot, or file inspection that supports the claim.

---

## Section A — P0: Production deployment health

| # | Task | Status | Evidence / blocker | Last verified |
|---|---|---|---|---|
| A1 | Live Vercel frontend returns 200 | PASS | `curl -I https://arogya-ai-clinical-decision-support-nine.vercel.app/` → 200 | 2026-10-15 |
| A2 | Vercel production bundle points to correct backend | **FAIL** | `VITE_API_URL` not set in Vercel dashboard. Frontend source `frontend/src/services/api.ts:25` returns `import.meta.env.VITE_API_URL \|\| "http://localhost:8000"`; in production that resolves to `http://localhost:8000`. Locally-built dist contains `http://127.0.0.1:8000` (from `.env.local`). The Vercel-hosted bundle is not inspectable without dashboard access. | 2026-10-15 |
| A3 | Live Render backend reachable | **FAIL** | `https://arogya-backend.onrender.com/api/health` → **503 Service Suspended** (live probe). `https://arogya-backend.onrender.com/` → 503. | 2026-10-15 |
| A4 | Backend smoke test (`/api/health`) locally | PASS | `TestClient` → `200 {"status":"healthy","model":"Logistic Regression","supported_diseases":399,"disclaimer":"..."}` | 2026-10-15 |
| A5 | `/api/predict` requires Firebase ID token | PASS | Without `Authorization` header → `401 {"detail":{"error":{"code":"MISSING_TOKEN","message":"A Firebase ID token is required in the Authorization header."}}}` | 2026-10-15 |
| A6 | Render env vars correct (PYTHON, CORS, FIREBASE_PROJECT_ID) | PASS (local config) | `render.yaml` reviewed: PYTHON_VERSION=3.12.7, FIREBASE_PROJECT_ID=arogyaai-cloud-ad667, AROGYA_CORS_ORIGINS=`https://arogya-ai-clinical-decision-support-nine.vercel.app`, GEMINI_API_KEY declared `sync:false` (Render prompts, not committed). | 2026-10-15 |
| A7 | Render service actually running | **BLOCKED** | 503 returned; user must resume in Render dashboard. Requires owner login. | 2026-10-15 |
| A8 | `VITE_API_URL` set to Render URL in Vercel | **BLOCKED** | Requires owner login to Vercel dashboard, then redeploy. | 2026-10-15 |
| A9 | `VITE_USE_FIREBASE_EMULATORS` not set in Vercel | PASS (likely) | `frontend/src/config/firebase.ts` only enables emulators when `import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true"`. Vite exposes only `VITE_*` env vars, and the only `VITE_USE_FIREBASE_EMULATORS=true` reference is in `frontend/.env.local` (gitignored, not sent to Vercel). Cannot 100% confirm Vercel-side without dashboard access. | 2026-10-15 |
| A10 | CORS allows the deployed frontend origin | PASS (config) | Backend default `config.py` and `render.yaml` both list `https://arogya-ai-clinical-decision-support-nine.vercel.app` exactly. No wildcard. | 2026-10-15 |

## Section B — P0: Core application health

| # | Task | Status | Evidence |
|---|---|---|---|
| B1 | Backend Python imports resolve | PASS | `83 passed, 10 warnings in 4.84s` from `pytest tests/` |
| B2 | ML model loads | PASS | `[OK] ML Model loaded successfully.` (model load hook in `backend/index.py`); `arogyaai_model.joblib` (2,680,914 bytes) at repo root; SHA-256 `e000590b7cd745a6c2b375568a62ed57ee4e3ee35376aaf68a368ffcf6ecadd0` matches `ml/artifacts/metrics.json` |
| B3 | Frontend TypeScript build | PASS | `tsc -b` exit 0 in `npm run build` |
| B4 | Frontend Vite production build | PASS | `npm run build` exit 0 in 47.6 s, 2204 modules, `dist/` populated |
| B5 | Pydantic v2 migration of input validators | PASS | `backend/schemas/prediction.py` migrated to `@field_validator(mode="before")` with `int()`/`str()` coercion. Verified: empty Symptoms → ValueError; whitespace stripped; "45"→45 int; age 200 → ValueError. 83/83 tests still pass. |
| B6 | Real end-to-end `/api/predict` returns proper shape | PASS | Live `TestClient` with real model + dependency override returned `200` with keys `prediction`, `confidence`, `explanation`, `ml_prediction`, `recommendation`. Confidence 11–23 % on broad symptoms correctly resolved to `"Inconclusive Data"` with the safety-threshold fallback message. |
| B7 | Real ML inference on specific symptoms | PASS | Live `TestClient` runs: "runny nose sneezing sore throat mild cough congestion" → **Common Cold, 99.63 %**; "high fever abdominal pain weakness constipation rose spots" → **Typhoid, 99.77 %**; "severe one-sided throbbing headache with nausea and light sensitivity" → Stargardt Disease 54.78 % (mis-classification at the boundary, but the pipeline ran end-to-end with the real model artifact). |

## Section C — P1: ML and AI

| # | Task | Status | Evidence |
|---|---|---|---|
| C1 | Model artifact present and loadable | PASS | `arogyaai_model.joblib` (2,680,914 bytes). `ml/artifacts/metrics.json` SHA-256 matches the artifact. `ml/artifacts/model_metadata.json` records training env (Python 3.14.5, scikit-learn 1.9.0, pandas 3.0.5, numpy 2.5.2). |
| C2 | Test-set metrics reproducible from artifact | PASS (file-grounded) | `ml/artifacts/metrics.json::test_metrics` records `accuracy=0.8858`, `macro_f1=0.8372`, `weighted_f1=0.8761`, `n_samples=841`, `n_classes=399`. These are stored, not re-derived here, but the source CSV (`enhanced_ayurvedic_treatment_dataset.csv`) and `ml/evaluate.py` are present for re-run. |
| C3 | Confidence gate at 35 % | PASS | `TestClient` predict on garbage input returned `confidence=11.88` and `"prediction":"Inconclusive Data"`. Threshold is `AROGYA_CONFIDENCE_THRESHOLD=35.0` in `.env.example`. |
| C4 | Gemini integration implemented with safe fallback | PASS (code) | `backend/ai/gemini_service.py` (implementation not directly re-exercised in this session). With no `GEMINI_API_KEY` set, the `recommendation` field returned a safety-threshold message rather than a fabricated result. |
| C5 | Live Gemini call with real key | NOT TESTED | No key was added. Fallback path verified. |
| C6 | Per-class metrics and confusion matrix present | PASS | `ml/artifacts/metrics.json::per_class` and `top_confusions` populated for 399 classes. |
| C7 | Class imbalance disclosed | PASS | `metrics.json::class_distribution`: min support 3, median 6, max 52, 57 classes with only 3 samples. This is a known limitation; documented in `MODEL_CARD.md` and the project report. |

## Section D — P1: Security and access control

| # | Task | Status | Evidence |
|---|---|---|---|
| D1 | Firebase ID-token verification (signature, expiry, audience, issuer, subject) | PASS | `tests/test_security.py` (18 unit tests) all pass: generated throwaway RSA key pair, signed self-issued tokens locally, asserted each rejection rule in isolation. |
| D2 | `/api/predict` requires valid token | PASS | `TestBackendAPIAuthorization` (6 tests) all pass: missing token → 401 MISSING_TOKEN, malformed token → 401 INVALID_TOKEN, wrong scheme → 401. |
| D3 | Production CORS does not use wildcards | PASS | `backend/core/config.py` default and `render.yaml` both list exact origins; no `*` for credentialed requests. |
| D4 | Firestore rules in repo (not yet deployed) | PARTIAL | `firestore.rules` (474 lines) inspected; not deployed to live Firebase this session (BLOCKED — needs owner login). |
| D5 | Firestore indexes declared | PASS (config) | `firestore.indexes.json` declares one COLLECTION and one COLLECTION_GROUP on `assessments.clinicId`. Deployment is BLOCKED on owner login. |
| D6 | `.env` and `service-account.json` excluded from git | PASS | `.gitignore` lists `.env`, `*.local`, `service-account*.json`. Verified `frontend/.env.local` is gitignored. |
| D7 | No real secrets committed | PASS | `git grep -E "(AIza[0-9A-Za-z_-]{20,}|-----BEGIN)"` returns no live secrets in tracked files. `.env.example` contains placeholder text only. |
| D8 | VITE_API_URL never carries a private key | PASS | Only `VITE_USE_FIREBASE_EMULATORS` and `VITE_API_URL` are read on the client; the Firebase config in `src/config/firebase.ts` is a browser-safe API key (not a server secret), and `GEMINI_API_KEY` is server-only. |

## Section E — P2: Testing evidence

| # | Task | Status | Evidence |
|---|---|---|---|
| E1 | Full backend test suite | PASS | `pytest tests/ --tb=short -q` → `83 passed, 10 warnings in 4.84s` |
| E2 | Frontend production build | PASS | `npm run build` → exit 0, 2204 modules, 47.6 s |
| E3 | Live Vercel smoke test | PARTIAL | `200 OK` on `/`. Cannot exercise predict without `VITE_API_URL` (see A2/A8). |
| E4 | Live Render smoke test | FAIL | Both `/` and `/api/health` → **503 Service Suspended** (A3). |

## Section F — P2: Repository hygiene

| # | Task | Status | Evidence |
|---|---|---|---|
| F1 | Uncommitted change is reviewable | PASS | `git diff backend/schemas/prediction.py` — only Pydantic v1→v2 migration; behaviour preserved; 83/83 tests pass. |
| F2 | Untracked `docs/review4/` present | PASS | 10 markdown files: ARCHITECTURE, DEMO_GUIDE, DEPLOYMENT_AUDIT, KNOWN_ISSUES, PRESENTATION, PROJECT_REPORT, REVIEW4_STATUS, TEST_CASES, VIVA_PREPARATION, plus this tracker. |
| F3 | `docs/review4/EXECUTION_TRACKER.md` exists | PASS | This file (created 2026-10-15). |
| F4 | No large unintended changes in working tree | PASS | `git status` shows only the schema migration and untracked docs. |

## Section G — P3: Academic deliverables

| # | Task | Status | Evidence / file |
|---|---|---|---|
| G1 | Project report (formal academic) | PASS | `docs/review4/PROJECT_REPORT.md` (24,487 bytes). |
| G2 | Presentation outline | PASS | `docs/review4/PRESENTATION.md` (7,875 bytes). |
| G3 | Architecture document | PASS | `docs/review4/ARCHITECTURE.md` (7,112 bytes). |
| G4 | Test cases | PASS | `docs/review4/TEST_CASES.md` (11,306 bytes). |
| G5 | Demo guide | PASS | `docs/review4/DEMO_GUIDE.md` (5,235 bytes). |
| G6 | Known issues | PASS | `docs/review4/KNOWN_ISSUES.md` (4,644 bytes). |
| G7 | Deployment audit | PASS | `docs/review4/DEPLOYMENT_AUDIT.md` (13,393 bytes) — re-verified live today. |
| G8 | Viva preparation | PASS | `docs/review4/VIVA_PREPARATION.md` (21,131 bytes). |
| G9 | Review 4 status | PASS | `docs/review4/REVIEW4_STATUS.md` (6,640 bytes). |
| G10 | Execution tracker | PASS | This file. |
| G11 | Final handover | TODO | To be produced at the end of this session — see "Next actions" below. |

## Section H — P3: Viva readiness checks (self-audit)

| # | Task | Status | Evidence |
|---|---|---|---|
| H1 | "Approximately 88.6 % accuracy" claim supported | PASS | `ml/artifacts/metrics.json::test_metrics.accuracy = 0.8858501783590963` |
| H2 | "Approximately 83.7 % macro-F1" claim supported | PASS | `ml/artifacts/metrics.json::test_metrics.macro_f1 = 0.837246133197732` |
| H3 | "399 classes" claim supported | PASS | `ml/artifacts/metrics.json::test_metrics.n_classes = 399`; backend `/api/health` returns `supported_diseases: 399` |
| H4 | "n_samples = 841" claim supported | PASS | `ml/artifacts/metrics.json::test_metrics.n_samples = 841` |
| H5 | "Dataset described as 4,201 rows" claim | NEEDS RE-CHECK | The training script `ml/train.py` and source `enhanced_ayurvedic_treatment_dataset.csv` are present; the test-set size is 841 of those. Total dataset row count to be confirmed by `wc -l` when the user is ready. |

---

## Open blockers (require your action)

These cannot be unblocked without your login. Each is small — total time: ~10–15 minutes across three dashboards.

1. **Render dashboard** — https://dashboard.render.com
   - Resume the `arogya-backend` service (currently returning 503).
   - Set `GEMINI_API_KEY` in the service's Environment tab.
2. **Vercel dashboard** — https://vercel.com/dashboard
   - Project `arogya-ai-clinical-decision-support-nine` → Settings → Environment Variables
   - Add `VITE_API_URL` = `https://<your-resumed-render-url>` (no trailing slash), Production environment.
   - **Redeploy** the latest deployment (env vars are baked at build time).
3. **Firebase console** — https://console.firebase.google.com/project/arogyaai-cloud-ad667
   - Auth → Authorized Domains: confirm `arogya-ai-clinical-decision-support-nine.vercel.app` is listed.
   - Auth → Sign-in methods: confirm Email/Password is enabled.
   - Firestore → Data: in the `users` collection, ensure at least one doctor document has `role=doctor`, `status=approved`, `clinicId=RCCSO8` (or any 6-char ID).
   - Deploy rules and indexes locally: `firebase deploy --only firestore:rules,firestore:indexes --project arogyaai-cloud-ad667`.

## Next actions (this session)

1. Update `docs/review4/DEPLOYMENT_AUDIT.md` to record today's live probe.
2. Produce `docs/review4/FINAL_HANDOVER.md` (the master prompt requires it).
3. Optionally push the Pydantic v2 commit once deployment prerequisites are met (so Vercel rebuilds from the new tree).
