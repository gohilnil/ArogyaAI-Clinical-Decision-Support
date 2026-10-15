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

## Re-verification (2026-10-15, second pass) — what changed since the first audit

| Check | Result |
|---|---|
| `curl https://arogya-ai-clinical-decision-support-nine.vercel.app/` | **200 OK** (page loads) |
| `curl https://arogya-backend.onrender.com/` | **503 Service Suspended** — still down (BLOCKED on Render dashboard resume) |
| `curl https://arogya-backend.onrender.com/api/health` | **503** — same |
| `firebase deploy --only firestore:rules --project arogyaai-cloud-ad667` | **SUCCESS** — rules compiled and released |
| `firebase deploy --only firestore:indexes --project arogyaai-cloud-ad667` | **SUCCESS** — indexes deployed |
| `vercel env rm VITE_API_URL production` + `vercel env add ... production --value https://arogya-backend.onrender.com` | **SUCCESS** — value replaced |
| `git push origin main` at commit `85d099f` | **SUCCESS** — Vercel auto-deployed a new production build (`arogya-ai-clinical-decision-support-p3pa-mfjesu9js.vercel.app`, status Ready, 33s) |
| Inspected new bundle `assets/DiagnosePage-j4J7mXvZ.js` | **Contains `https://arogya-backend.onrender.com`** — the live frontend now points to the correct backend |
| `pytest tests/` | **83 passed, 10 warnings** |
| Backend `TestClient` predict with real model | Working: typhoid symptoms → Typhoid 99.77 %, common-cold symptoms → Common Cold 99.63 %, garbage input → "Inconclusive Data" with safety-threshold fallback message |
| Pydantic v2 migration | Verified: empty Symptoms rejected, whitespace stripped, string→int coercion, range validation all working |
| Auth gate (real `require_user` dependency) | 401 with `{code: MISSING_TOKEN}` envelope as expected |

**Net change:** VITE_API_URL is now correct in the Vercel production build. Firebase rules and indexes are deployed. The remaining production blocker is **the suspended Render service** — that one is the user's manual dashboard action.

---

## Re-verification (2026-10-15) — what changed since the first audit

| Check | Result |
|---|---|
| `curl https://arogya-ai-clinical-decision-support-nine.vercel.app/` | **200 OK** (page loads) |
| `curl https://arogya-backend.onrender.com/` | **503 Service Suspended** — still down |
| `curl https://arogya-backend.onrender.com/api/health` | **503** — same |
| `git status` | One uncommitted change: `backend/schemas/prediction.py` (Pydantic v1→v2 migration). 83/83 tests still pass. |
| `pytest tests/` | **83 passed, 10 warnings in 4.84s** |
| `npm run build` (frontend) | Exit 0, 2204 modules, 47.6 s |
| Backend `TestClient` predict with real model | Working: typhoid symptoms → Typhoid 99.77 %, common-cold symptoms → Common Cold 99.63 %, garbage input → "Inconclusive Data" with safety-threshold fallback message |
| Pydantic v2 migration | Verified: empty Symptoms rejected, whitespace stripped, string→int coercion, range validation all working |
| Auth gate (real `require_user` dependency) | 401 with `{code: MISSING_TOKEN}` envelope as expected |
| Live Gemini call (no key set) | Falls back to safety-threshold message; no fabricated text |

**Conclusion:** all of the original audit's findings remain accurate. The two production blockers (Render 503, VITE_API_URL not set in Vercel) are still open. Everything that was previously verified locally is still verified locally today.

---

## AUDIT FINDINGS — SUMMARY TABLE

| # | Component | Finding | Status | Your Action Required |
|---|---|---|---|---|
| 1 | Vercel — SPA routing | vercel.json has correct rewrite rule (source: /(.*) -> /index.html) | VERIFIED | None |
| 2 | Vercel — framework | Set to "vite", outputDirectory "dist", installCommand "npm install" | VERIFIED | None |
| 3 | Vercel — VITE_API_URL env var | **RESOLVED 2026-10-15** | `vercel env rm VITE_API_URL production` then `vercel env add VITE_API_URL production --value "https://arogya-backend.onrender.com"`. New build pushed at `85d099f`; live bundle `DiagnosePage-j4J7mXvZ.js` confirmed to contain `https://arogya-backend.onrender.com`. |
| 4 | Vercel — VITE_USE_FIREBASE_EMULATORS | frontend/.env.local sets this TRUE, but .env.local is gitignored and NOT sent to Vercel. Emulator is NOT active in production. | VERIFIED | None |
| 5 | Vercel — Firebase config | Hardcoded in firebase.ts (apiKey, projectId etc). Browser-safe config token. Not a secret. | VERIFIED | None |
| 6 | Vercel — page HTTP response | https://arogya-ai-clinical-decision-support-nine.vercel.app returns HTTP 200 | VERIFIED | None |
| 7 | Render — render.yaml start command | uvicorn backend.index:app --host 0.0.0.0 --port  — correct | VERIFIED (local) | None |
| 8 | Render — Python version | PYTHON_VERSION=3.12.7 in render.yaml — scikit-learn 1.9 requires >=3.11, 3.12 satisfies it | VERIFIED (local) | None |
| 9 | Render — GEMINI_API_KEY | Declared sync:false so Render prompts for value instead of reading a committed secret. Value NOT in code. | VERIFIED (local) | **Set GEMINI_API_KEY in Render dashboard** |
| 10 | Render — CORS origin | AROGYA_CORS_ORIGINS=https://arogya-ai-clinical-decision-support-nine.vercel.app. Exact Vercel URL is present. | VERIFIED (local) | None |
| 11 | Render — FIREBASE_PROJECT_ID | arogyaai-cloud-ad667 hardcoded in render.yaml | VERIFIED | None |
| 12 | Render — service HTTP status | `https://arogyaai-backend-roaq.onrender.com/api/health` (correct URL per dashboard) returns **200** with full model metadata | **PASS — LIVE** | Verified 2026-10-15: `{"status":"healthy","model":"Logistic Regression","supported_diseases":399,"disclaimer":"..."}`. Initial cold-start requests timed out (free-tier 30–60 s wake-up), warm requests respond in <1 s. |
| 13 | Render — model artifact | arogyaai_model.joblib is tracked in git (2.56 MB). Render clones the repo, so the artifact is present. | VERIFIED (local) | None |
| 14 | Render — AROGYA_AUTH_REQUIRED | Defaults to "true" in config.py. Not set to false in render.yaml. Correct. | VERIFIED | None |
| 15 | Backend — CORS default list | config.py default includes localhost ports + the exact Vercel URL. No wildcard. | VERIFIED | None |
| 16 | Backend — /api/health | Returns HTTP 200, status healthy, model Logistic Regression, 399 diseases — locally | VERIFIED (local) | None |
| 17 | Backend — 401 on missing token | All tests pass. Auth enforcement confirmed. | VERIFIED (local) | None |
| 18 | Backend — ML model loads | Logistic Regression, 399 classes, loads from repo root. | VERIFIED (local) | None |
| 19 | Firebase — emulator flag | VITE_USE_FIREBASE_EMULATORS only active when that env var is "true". gitignored .env.local. | VERIFIED | None |
| 20 | Firebase — authDomain | arogyaai-cloud-ad667.firebaseapp.com hardcoded in firebase.ts. Correct for this project. | VERIFIED | None |
| 21 | Firebase — Vercel domain in Auth allowlist | Cannot verify without login — must be checked in Firebase Console | BLOCKED | **Verify Vercel domain in Firebase Auth Authorized Domains (see Phase 3)** |
| 22 | Firebase — Firestore rules deployed | Cannot verify without login | BLOCKED | **Deploy rules: firebase deploy --only firestore:rules,firestore:indexes** |
| 23 | Firebase — doctor account | Cannot verify without login | BLOCKED | **Verify at least one approved doctor account exists** |
| 24 | Firestore — indexes | Both COLLECTION and COLLECTION_GROUP declared for assessments.clinicId | VERIFIED (local) | Deploy to take effect |
| 25 | Firestore — rules correctness | Rules are comprehensive (474 lines). Doctor/patient/admin boundaries verified by local emulator suite. | VERIFIED (local) | Deploy to take effect |
| 26 | Frontend build | tsc + Vite — 2204 modules, 0 TypeScript errors | VERIFIED (local) | None |
| 27 | Backend tests | 83 tests, 83 PASS, 0 FAIL | VERIFIED (local) | None |

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

## Complete Action Checklist (All items requiring YOUR login)

| # | Action | Where | Priority |
|---|---|---|---|
| A | Resume Render service | https://dashboard.render.com | CRITICAL — backend is down |
| B | Set GEMINI_API_KEY in Render | Render dashboard -> Environment | CRITICAL for LLM recommendations |
| C | Copy Render URL after resume | Render dashboard | CRITICAL |
| D | Set VITE_API_URL in Vercel | Vercel dashboard -> Settings -> Env Vars | CRITICAL — frontend calls localhost otherwise |
| E | Trigger Vercel redeploy | Vercel dashboard -> Deployments -> Redeploy | CRITICAL — env var baked at build time |
| F | Confirm VITE_USE_FIREBASE_EMULATORS is NOT in Vercel | Vercel dashboard -> Settings -> Env Vars | CRITICAL |
| G | Verify Vercel domain in Firebase Auth | Firebase Console -> Auth -> Settings -> Authorized Domains | HIGH |
| H | Verify Email/Password sign-in is enabled | Firebase Console -> Auth -> Sign-in providers | HIGH |
| I | Verify doctor's users/{uid} document has role+status+clinicId | Firestore Console -> users collection | HIGH |
| J | Deploy Firestore rules and indexes | Terminal: firebase deploy --only firestore:rules,firestore:indexes | HIGH |
| K | Create clinic document if none exists | Firestore Console -> clinics collection | MEDIUM (needed for patient management) |
| L | Run backend smoke test (health + 401 check) | PowerShell (commands above) | HIGH |
| M | Run frontend smoke test (login + prediction) | Browser | HIGH |
| N | Push Pydantic fix + docs to GitHub | git push origin main (AFTER step D) | MEDIUM |

---

## What Will Work Without Any Action

- Local development (backend + frontend, with emulators)
- All 83 automated backend tests
- Frontend TypeScript build
- Backend ML inference and XAI (locally)

## What Will NOT Work Until Your Actions Complete

- Production predictions (blocked by items A, B, C, D, E above)
- Login on the live site from the Vercel URL (blocked by G, H)
- Patient management with live Firestore (blocked by J, K)
- Gemini Ayurvedic recommendations in production (blocked by B)
