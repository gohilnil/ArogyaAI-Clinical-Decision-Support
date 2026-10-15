# ArogyaAI — Production Deployment Audit Report

**Date:** 2026-10-15 (re-verified live today)
**Auditor:** Lead engineering review session
**Repository:** https://github.com/gohilnil/ArogyaAI-Clinical-Decision-Support.git
**Frontend URL:** https://arogya-ai-clinical-decision-support-nine.vercel.app
**Firebase project:** arogyaai-cloud-ad667

Legend: VERIFIED = live probe passed | FAIL = live probe failed | BLOCKED = requires your login | LOCAL = verified locally only

---

## Re-verification (2026-10-15, second pass) — what changed since the first audit

| Check | Result |
|---|---|
| `curl https://arogya-ai-clinical-decision-support-nine.vercel.app/` | **200 OK** (page loads) |
| `curl https://arogyaai-backend-roaq.onrender.com/api/health` (correct URL per Render dashboard) | **200 OK** with full model metadata |
| `curl https://arogyaai-backend-roaq.onrender.com/` | **200 OK** with welcome message |
| `curl https://arogyaai-backend-roaq.onrender.com/api/predict` with no auth | **401 MISSING_TOKEN** |
| `curl https://arogyaai-backend-roaq.onrender.com/api/predict` with bad token | **401 INVALID_TOKEN** |
| CORS preflight from production origin | **200 OK**, `access-control-allow-origin: https://arogya-ai-clinical-decision-support-nine.vercel.app` |
| CORS preflight from a different origin | **400 Bad Request** (CORS rejected) |
| `firebase deploy --only firestore:rules --project arogyaai-cloud-ad667` | **SUCCESS** — rules compiled and released |
| `firebase deploy --only firestore:indexes --project arogyaai-cloud-ad667` | **SUCCESS** — indexes deployed |
| `vercel env add VITE_API_URL production --value https://arogyaai-backend-roaq.onrender.com` | **SUCCESS** — value replaced (after `vercel env rm` of the previous wrong value) |
| `git push origin main` at commit `7af8b7d` | **SUCCESS** — Vercel auto-deployed a new production build |
| Inspected new bundle `assets/DiagnosePage-myj3tnL3.js` | **Contains `https://arogyaai-backend-roaq.onrender.com`** — the live frontend now points to the correct backend |
| `pytest tests/` | **83 passed, 10 warnings** |
| Backend `TestClient` predict with real model | Working: typhoid symptoms → Typhoid 99.77 %, common-cold symptoms → Common Cold 99.63 %, garbage input → "Inconclusive Data" with safety-threshold fallback message |
| Pydantic v2 migration | Verified: empty Symptoms rejected, whitespace stripped, string→int coercion, range validation all working |
| Auth gate (real `require_user` dependency) | 401 with `{code: MISSING_TOKEN}` envelope as expected |

**Net change:** Both production defects are RESOLVED. The live frontend now calls the correct backend URL, the live backend is reachable and healthy, Firebase rules and indexes are deployed, CORS is correctly configured, and the auth gate works.

**Remaining gap (not a defect, requires a manual dashboard step):** A real authenticated end-to-end predict against the live backend requires a Firebase user that exists in the live Firebase project with `role=doctor, status=approved, clinicId=RCCSO8`. Setting that up is a dashboard action for the project owner.

---

## AUDIT FINDINGS — SUMMARY TABLE

| # | Component | Finding | Status | Your Action Required |
|---|---|---|---|---|
| 1 | Vercel — SPA routing | vercel.json has correct rewrite rule (source: /(.*) -> /index.html) | VERIFIED | None |
| 2 | Vercel — framework | Set to "vite", outputDirectory "dist", installCommand "npm install" | VERIFIED | None |
| 3 | Vercel — VITE_API_URL env var | **RESOLVED 2026-10-15** | Set to `https://arogyaai-backend-roaq.onrender.com`. Live bundle `DiagnosePage-myj3tnL3.js` at commit `7af8b7d` confirmed to contain the correct URL. | VERIFIED (LIVE) | None |
| 4 | Vercel — VITE_USE_FIREBASE_EMULATORS | frontend/.env.local sets this TRUE, but .env.local is gitignored and NOT sent to Vercel. Emulator is NOT active in production. | VERIFIED | None |
| 5 | Vercel — Firebase config | Hardcoded in firebase.ts (apiKey, projectId etc). Browser-safe config token. Not a secret. | VERIFIED | None |
| 6 | Vercel — page HTTP response | https://arogya-ai-clinical-decision-support-nine.vercel.app returns HTTP 200 | VERIFIED (LIVE) | None |
| 7 | Render — render.yaml start command | uvicorn backend.index:app --host 0.0.0.0 --port $PORT — correct | VERIFIED (local) | None |
| 8 | Render — Python version | PYTHON_VERSION=3.12.7 in render.yaml — scikit-learn 1.9 requires >=3.11, 3.12 satisfies it | VERIFIED (local) | None |
| 9 | Render — GEMINI_API_KEY | Declared sync:false so Render prompts for value instead of reading a committed secret. Value NOT in code. | VERIFIED (local) | Optional: set in Render dashboard for LLM explanations (ML works without it) |
| 10 | Render — CORS origin | AROGYA_CORS_ORIGINS=https://arogya-ai-clinical-decision-support-nine.vercel.app. Exact Vercel URL is present and live CORS preflight verified. | VERIFIED (LIVE) | None |
| 11 | Render — FIREBASE_PROJECT_ID | arogyaai-cloud-ad667 hardcoded in render.yaml | VERIFIED | None |
| 12 | Render — service HTTP status | `https://arogyaai-backend-roaq.onrender.com/api/health` returns **200** with full model metadata | **PASS — LIVE** | Verified 2026-10-15: `{"status":"healthy","model":"Logistic Regression","supported_diseases":399,"disclaimer":"..."}`. Cold-start ~30–60 s, warm responses <1 s. |
| 13 | Render — model artifact | arogyaai_model.joblib is tracked in git (2.56 MB). Render clones the repo, so the artifact is present. | VERIFIED (LIVE) | None |
| 14 | Render — AROGYA_AUTH_REQUIRED | Defaults to "true" in config.py. Live endpoints reject unauthenticated calls with 401. | VERIFIED (LIVE) | None |
| 15 | Backend — CORS default list | config.py default includes localhost ports + the exact Vercel URL. No wildcard. Foreign origins rejected with 400. | VERIFIED (LIVE) | None |
| 16 | Backend — /api/health | Returns HTTP 200, status healthy, model Logistic Regression, 399 diseases | VERIFIED (LIVE) | None |
| 17 | Backend — 401 on missing token | Missing token -> 401 MISSING_TOKEN, invalid token -> 401 INVALID_TOKEN. Auth enforcement confirmed. | VERIFIED (LIVE) | None |
| 18 | Backend — ML model loads | Logistic Regression, 399 classes, loads from repo root. | VERIFIED | None |
| 19 | Firebase — emulator flag | VITE_USE_FIREBASE_EMULATORS only active when that env var is "true". gitignored .env.local. | VERIFIED | None |
| 20 | Firebase — authDomain | arogyaai-cloud-ad667.firebaseapp.com hardcoded in firebase.ts. Correct for this project. | VERIFIED | None |
| 21 | Firebase — Vercel domain in Auth allowlist | Cannot verify without login — must be checked in Firebase Console | BLOCKED | **Verify Vercel domain in Firebase Auth Authorized Domains (see Phase 3)** |
| 22 | Firebase — Firestore rules deployed | Rules compiled and deployed to live project on 2026-10-15 via Firebase CLI | VERIFIED (LIVE) | None |
| 23 | Firebase — doctor account | Requires creating user in Firebase Auth + `users/{uid}` with doctor role | BLOCKED | **Create test doctor account in Firebase Console** |
| 24 | Firestore — indexes | Both COLLECTION and COLLECTION_GROUP declared for assessments.clinicId; deployed to live project | VERIFIED (LIVE) | None |
| 25 | Firestore — rules correctness | Rules are comprehensive (474 lines). Deployed to live project 2026-10-15. | VERIFIED (LIVE) | None |
| 26 | Frontend build | tsc + Vite — 2204 modules, 0 TypeScript errors | VERIFIED | None |
| 27 | Backend tests | 83 tests, 83 PASS, 0 FAIL | VERIFIED | None |

---

## ROOT CAUSE OF PRODUCTION FAILURE — RESOLVED

The original two-deployment-defect report has been fully addressed:

1. **VITE_API_URL** — was set to an incorrect value (empty/blank). Fixed via `vercel env rm` + `vercel env add VITE_API_URL production --value "https://arogyaai-backend-roaq.onrender.com"`. Live bundle `DiagnosePage-myj3tnL3.js` confirmed to contain the correct URL.
2. **Render backend** — was previously reported as `503 Service Suspended` because the audit was using the wrong service URL. The actual live service is `https://arogyaai-backend-roaq.onrender.com`, which now returns `200 OK` on `/api/health`.

The live site is end-to-end reachable as of 2026-10-15. CORS allows the production origin exactly and rejects other origins. The remaining gap is a live authenticated end-to-end predict, which needs a real Firebase test user — a manual dashboard step that the user owns.

---

## Phase 2 — Fixes

### Fix 1 — Resume and verify the Render backend (YOUR LOGIN REQUIRED)

1. Go to https://dashboard.render.com
2. Find the "arogya-backend" service
3. If suspended: click "Resume" or "Deploy"
4. Confirm it deploys successfully (green "Live" status)
5. Copy the service URL — it will look like: https://arogya-backend.onrender.com or a custom name
6. Test: open https://<your-render-url>/api/health in a browser
   Expected: {"status":"healthy","model":"Logistic Regression","supported_diseases":399,...}

### Fix 2 — Set VITE_API_URL in Vercel (YOUR LOGIN REQUIRED)

1. Go to https://vercel.com/dashboard
2. Open the "arogya-ai-clinical-decision-support-nine" project
3. Go to Settings -> Environment Variables
4. Add a new variable:
   - Name: VITE_API_URL
   - Value: https://<your-render-url>  (the exact URL from Fix 1, NO trailing slash)
   - Environment: Production (tick Production and optionally Preview)
5. Click Save
6. Go to Deployments -> click "Redeploy" on the latest deployment (or push any commit to trigger a new build)
   IMPORTANT: changing env vars does NOT rebuild automatically — you must trigger a new build

### Fix 3 — Verify VITE_USE_FIREBASE_EMULATORS is NOT set in Vercel

1. In Vercel Settings -> Environment Variables
2. Confirm there is NO variable named VITE_USE_FIREBASE_EMULATORS
3. If it exists and is set to "true", DELETE it immediately — it would route production auth to a non-existent local emulator

---

## Phase 3 — Firebase Verification Checklist

### 3.1 — Firebase Auth Authorized Domains (YOUR LOGIN REQUIRED)

1. Go to https://console.firebase.google.com/project/arogyaai-cloud-ad667/authentication/settings
2. Scroll to "Authorized Domains"
3. Verify these domains are listed:
   - localhost (should be there by default)
   - arogya-ai-clinical-decision-support-nine.vercel.app
4. If the Vercel domain is missing: click "Add Domain" and add it
5. Without this, Firebase Auth will refuse the login from the production URL

### 3.2 — Sign-in Methods (YOUR LOGIN REQUIRED)

1. Go to https://console.firebase.google.com/project/arogyaai-cloud-ad667/authentication/providers
2. Verify "Email/Password" is ENABLED
3. If your app uses Google Sign-In, verify "Google" is also ENABLED

### 3.3 — Verify users/{uid} structure (YOUR LOGIN REQUIRED)

1. Go to https://console.firebase.google.com/project/arogyaai-cloud-ad667/firestore
2. Click on the "users" collection
3. Find your doctor account's document (uid = the string shown in Firebase Auth under Users)
4. Verify the document has ALL of these fields:
   - role: "doctor"
   - status: "approved"
   - clinicId: "XXXXXX" (any 6-character string)
   - email: your email
   - displayName: your name (optional but recommended)
5. If status is "pending": manually set it to "approved" in the Firestore console
6. If the document is missing: create it manually with these fields

### 3.4 — Firestore Rules (YOUR LOGIN REQUIRED)

1. Install Firebase CLI if not present: npm install -g firebase-tools
2. In terminal at project root: firebase login
3. Deploy: firebase deploy --only firestore:rules,firestore:indexes --project arogyaai-cloud-ad667
4. Verify in https://console.firebase.google.com/project/arogyaai-cloud-ad667/firestore/rules
   that the live rules match what is in firestore.rules (check the version date)

### 3.5 — Create a clinic document (if none exists)

1. In Firestore console, check the "clinics" collection
2. If empty: click "Add Document"
   - Document ID: use a 6-character ID (e.g. "CLIN01")
   - Add field: name (string) = "Demo Clinic"
3. This clinicId must match what is in the doctor's users/{uid}.clinicId field

---

## Phase 4 — Smoke Tests After Deployment

Run these in order after completing Phases 2 and 3:

### Backend smoke tests (no login needed)

Replace RENDER_URL with your actual Render service URL:

`powershell
# 1. Root endpoint
Invoke-WebRequest "https://RENDER_URL/" -UseBasicParsing | Select StatusCode, Content

# 2. Health check
Invoke-WebRequest "https://RENDER_URL/api/health" -UseBasicParsing | Select StatusCode, Content

# 3. Auth enforcement (must return 401)
try { Invoke-WebRequest "https://RENDER_URL/api/predict" -Method POST -UseBasicParsing }
catch { .Exception.Response.StatusCode }
`

Expected results:
- Root: 200, {"message":"Welcome to ArogyaAI API.",...}
- Health: 200, {"status":"healthy","model":"Logistic Regression","supported_diseases":399}
- Predict without token: 401

### Frontend smoke tests (browser)

1. Open https://arogya-ai-clinical-decision-support-nine.vercel.app
2. Open DevTools (F12) -> Console: no red errors should appear
3. Open DevTools -> Network, type "predict" in the filter
4. Log in with your doctor account
5. Run a diagnosis (enter symptoms, submit)
6. In Network tab, verify the predict call goes to your Render URL (not localhost)
   and returns HTTP 200

### CORS verification

`powershell
Invoke-WebRequest "https://RENDER_URL/api/health" 
  -Method OPTIONS 
  -Headers @{"Origin"="https://arogya-ai-clinical-decision-support-nine.vercel.app"; "Access-Control-Request-Method"="POST"} 
  -UseBasicParsing | Select StatusCode, Headers
`
Expected: 200 with "access-control-allow-origin" header matching the origin.

---

## Phase 5 — Production Deployment State

### Code changes made in this session

1. backend/schemas/prediction.py — Migrated @validator to @field_validator (Pydantic V2). No behaviour change. 83/83 tests still pass.
2. docs/review4/*.md — 8 review documents created. No production impact.

### git status before push

`powershell
# Review what will be pushed
git diff --stat HEAD
git log --oneline -3
`

### Push to GitHub (to trigger Vercel rebuild)

`powershell
git add -A
git commit -m "fix(schema): migrate to Pydantic V2 field_validator; add Review 4 docs"
git push origin main
`

WARNING: Vercel auto-deploys on push to main. Ensure VITE_API_URL is set in Vercel BEFORE pushing, otherwise the new build will also have localhost:8000.

Correct order:
1. Set VITE_API_URL in Vercel dashboard (Fix 2 above)
2. Push to GitHub
3. Wait for Vercel build to complete
4. Run smoke tests

---

## Complete Action Checklist & Status

| # | Action | Status | Notes |
|---|---|---|---|
| A | Render service running & healthy | **RESOLVED** | `https://arogyaai-backend-roaq.onrender.com` returns 200 on `/` and `/api/health`. |
| B | Set GEMINI_API_KEY in Render | OPTIONAL | Render dashboard -> Environment. System safely falls back if unset. |
| C | Verify Render service URL | **RESOLVED** | Identified as `https://arogyaai-backend-roaq.onrender.com`. |
| D | Set VITE_API_URL in Vercel | **RESOLVED** | Set via `vercel env add VITE_API_URL production`. |
| E | Trigger Vercel redeploy | **RESOLVED** | Rebuilt; bundle `DiagnosePage-myj3tnL3.js` contains the Render backend URL. |
| F | Confirm VITE_USE_FIREBASE_EMULATORS not in Vercel | **RESOLVED** | Only in local gitignored `.env.local`. |
| G | Verify Vercel domain in Firebase Auth | ACTION REQUIRED | Firebase Console -> Auth -> Settings -> Authorized Domains. |
| H | Verify Email/Password sign-in enabled | ACTION REQUIRED | Firebase Console -> Auth -> Sign-in providers. |
| I | Create test doctor account in Firebase Auth + Firestore | ACTION REQUIRED | Create user in Auth + `users/{uid}` in Firestore (`role: "doctor"`, `status: "approved"`, `clinicId: "RCCSO8"`). |
| J | Deploy Firestore rules and indexes | **RESOLVED** | Deployed 2026-10-15 via Firebase CLI. |
| K | Create clinic document (CLIN01 / RCCSO8) | ACTION REQUIRED | Firestore Console -> `clinics` collection. |
| L | Run backend smoke test (health + 401 check) | **RESOLVED** | Health 200, CORS 200, Missing token 401, Invalid token 401. |
| M | Run frontend smoke test (live browser) | PENDING USER LOGIN | Test once doctor user is created in Firebase (item I). |
| N | Push Pydantic fix + docs to GitHub | **RESOLVED** | Pushed to `main` at commit `7af8b7d` / `9fe1b4d`. |

---

## What Is Working Today (Verified Live)

- Live Render backend: 200 OK (`/`, `/api/health`) with ML model loaded (399 classes)
- Live Vercel frontend: 200 OK, points to live Render backend
- Live CORS: Vercel origin allowed with credentials, foreign origins rejected
- Live Auth gate: unauthenticated calls rejected with 401 MISSING_TOKEN / INVALID_TOKEN
- Live Firestore rules & indexes: deployed to `arogyaai-cloud-ad667`
- Local ML inference & XAI: 83/83 pytest passed, clean Vite build

## Remaining Action For Live Demo

- Create the test doctor account in Firebase Console (item I) to sign in on the live frontend and perform an authenticated diagnosis.
- Gemini Ayurvedic recommendations in production (blocked by B)
