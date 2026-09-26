# ArogyaAI — PHASE 0 Project Baseline

> Executable baseline captured 2026-09-26 on the working tree. Every result below
> was produced by **actually running** the command — nothing is inferred.
> No application behaviour was modified during this phase.
>
> Companion document: `PROJECT_AUDIT.md` (static audit — feature classification,
> dead code, security analysis). This file records **runtime evidence**.

---

## 1. Environment

| Item | Value |
|---|---|
| OS | Windows 11 (10.0.26200) |
| Python (project venv) | 3.14.5 |
| Node / npm | v26.2.0 / 10.9.9 |
| Backend port used for baseline | 8011 (8000 avoided to prevent clash) |
| Frontend dev port | 5173 |

**Python packages present:** fastapi 0.141.1, uvicorn 0.52.4, pydantic 2.13.4,
scikit-learn 1.9.0, joblib 1.5.3, pandas 3.0.5, numpy 2.5.2, google-generativeai 0.8.6,
imbalanced-learn 0.14.2.

**Python packages MISSING that the project needs:**
- `httpx` — required by `fastapi.testclient`. **The entire test suite cannot run without it.**
- `pytest` — not installed.
- Neither is listed in `requirements.txt`.

**Secrets:** `GEMINI_API_KEY` resolves to a non-empty value at runtime
(via `python-dotenv`). There is **no `.env` file in the repository root** (correctly
git-ignored) — the key is supplied by the process environment. No `.env.example`
exists to document this.

---

## 2. Frontend baseline

| Check | Command | Result |
|---|---|---|
| TypeScript check | `npx tsc -b` | ✅ **PASS** — exit 0, no errors |
| Production build | `npm run build` | ✅ **PASS** — exit 0, built in 5.61s |
| Bundle size | — | ⚠️ `index-*.js` = **766.54 kB** (234.86 kB gzip). Vite warns chunk > 500 kB |
| Output | — | `dist/index.html` 0.47 kB, `index-*.css` 27.73 kB |

Build is healthy but ships one large un-split bundle. That is a performance
observation, not a bug.

---

## 3. Backend baseline

Backend started successfully: `uvicorn backend.index:app --host 127.0.0.1 --port 8011`.
Model load did **not** block startup noticeably (health responded within ~3 s).

### 3.1 `GET /` — ✅ PASS
```json
{"message":"Welcome to ArogyaAI API.","docs":"/docs","health":"/api/health"}
```

### 3.2 `GET /api/health` — ✅ PASS
```json
{"status":"healthy","model":"Random Forest","supported_diseases":399,
 "disclaimer":"For informational/educational purposes only. Not a substitute for professional medical advice."}
```
- 399 diseases confirmed against the live model.
- ⚠️ `"model"` is a **hardcoded string literal**, not read from the loaded model.
  The pkl carries a `model_type` field that is never surfaced.

### 3.3 `POST /api/predict` — valid input — ✅ PASS (full hybrid path)
Input: `diarrhea, stomach cramps, loose motion` / age 30 / Pitta / Summer.

```json
{"prediction":"Diarrhea","confidence":69.0,
 "recommendation":"💖 Your Ayurvedic Diagnosis ... (live Gemini response)"}
```
- ML prediction and confidence are real.
- Gemini returned a genuine, personalised, structured Ayurvedic plan (real network
  call, ~seconds latency).

**⚠️ NEW FINDING — the LLM fabricates a second confidence number.**
The API reported ML confidence **69.0%**, but the Gemini text opened with:
> `Predicted Disease: Pitta-type Diarrhea (Pittaja Atisara) [Confidence Level: 88%]`

The model invented an "88%" that does not exist in the data. Because the frontend
renders the raw LLM text, **a clinician can see two contradictory confidence
figures on one screen**. This is a genuine safety and correctness defect, and it
strengthens the case for structured output (Phase 10) that the backend controls.

### 3.4 Validation — ✅ PASS (all three rejected correctly)
| Input | Status | Message |
|---|---|---|
| `Age: 0` | **422** | `Age must be between 1 and 120.` |
| `Symptoms: "   "` | **422** | `Symptoms field cannot be empty.` |
| malformed JSON | **422** | `JSON decode error` |

Server-side validation works and messages are useful.

### 3.5 Low-confidence gate — ✅ PASS
Input: `tired` → confidence **4.0%**
```json
{"prediction":"Inconclusive Data","confidence":4.0,
 "recommendation":"The AI confidence is below the safety threshold (35%)...",
 "ml_prediction":"Malaria"}
```
Gate fires as designed. ⚠️ Minor: the raw below-threshold guess (`"Malaria"` at 4%)
is still returned in `ml_prediction` to the client.

### 3.6 Existing test suite — ❌ BLOCKED
```
RuntimeError: The starlette.testclient module requires the httpx2 package to be installed.
```
`tests/test_backend_api.py` contains 10 legitimate tests but **cannot execute**.
This is a dependency gap, not a logic failure — the tests themselves appear sound.

---

## 4. Firebase / configuration baseline

| Item | Value in working tree |
|---|---|
| `projectId` | `arogyaai-cloud-ad667` (**uncommitted change**) |
| `authDomain` | `arogyaai-cloud-ad667.firebaseapp.com` |
| Committed value | `arogyaai-cloud` |
| `firestore.rules` in repo | ❌ **absent** |
| `firebase.json` in repo | ❌ **absent** |
| API base URL resolution | `localStorage.renderUrl` → `VITE_API_URL` → `http://localhost:8000` |

⚠️ **The Firebase project migration is unresolved.** Three docs describe
`arogyaai-cloud`; the working tree points at `arogyaai-cloud-ad667`. Firestore
security rules are **still not in version control**, so DB security remains
**unverifiable from source** — the single largest open risk.

---

## 5. Git baseline

| Item | Value |
|---|---|
| Branch | `main`, **diverged**: ahead 3, behind 4 vs `origin/main` |
| Modified | `frontend/src/firebase.ts` (the project switch) |
| Untracked | `PROJECT_AUDIT.md`, `PROJECT_BASELINE.md` |
| `random_forest_model.pkl` | **tracked in Git — 1105 MB** |
| Remote | `https://github.com/gaur-avvv/Arogya-AI.git` |

The 1105 MB model is committed. This bloats clones and makes the repo painful for
reviewers/examiners. Phase 22 must resolve it (recommendation: remove from git,
ship via build script or release artifact).

---

## 6. Baseline scorecard

### Working (verified by execution)
- ✅ Backend starts; model loads
- ✅ `GET /`, `GET /api/health` (399 diseases)
- ✅ `POST /api/predict` — ML prediction + confidence
- ✅ Gemini integration returns real, relevant Ayurvedic content
- ✅ Confidence safety gate at 35%
- ✅ Input validation (age/symptoms/malformed JSON → 422)
- ✅ Frontend TypeScript check
- ✅ Frontend production build
- ✅ Firebase Auth (email/password + Google) — verified in audit, unchanged
- ✅ Firestore persistence of diagnosis records (audit)
- ✅ Dashboard stats read from Firestore, not hardcoded (audit)

### Failing / blocked (verified)
- ❌ Backend test suite **cannot run** (`httpx` missing)
- ❌ No `pytest` in environment
- ❌ Firestore rules absent from repo → security unverifiable
- ⚠️ LLM fabricates a second, contradicting confidence figure (69% vs 88% observed)
- ⚠️ 766 kB single JS bundle

### Known technical debt (carried from `PROJECT_AUDIT.md`)
1. ML training data leakage (preprocessing + SMOTE + model selection before/on test set)
2. Unverified accuracy claims (99% / 99.5% / 100% across three docs)
3. Privilege escalation — client-chosen role at registration
4. `/api/predict` unauthenticated; CORS `*` with `allow_credentials=True`
5. XAI declared in the frontend interface but **never produced** by the API
6. Documented "rule-based fallback" functions **do not exist**
7. Gemini output displayed but **never persisted** → no assessment history
8. No stable patient identity (new row per diagnosis)
9. Dead/broken files: `disease_prediction_system.py`, `demo.py`, `test_disease_prediction.py`, `README.tmp.md`
10. `requirements.txt` incomplete (missing `imbalanced-learn`, `httpx`)
11. 1.1 GB model in Git
12. 2120-line `App.tsx` monolith

---

## 7. Phase 0 conclusion

**Status: the project is a working, demonstrable system with a sound core flow and
a set of specific, fixable weaknesses.** Nothing in the baseline is broken beyond
repair; the failures are dependency gaps, missing security artefacts, and
methodological debt — all addressable without redesigning the working pipeline.

**No application behaviour was changed in this phase.** Deliverables produced:
`PROJECT_AUDIT.md` (static) and `PROJECT_BASELINE.md` (this file, runtime).

**Recommended next step — Phase 1 (architecture cleanup):** split the `App.tsx`
monolith and introduce a backend service layer **without changing user-visible
behaviour**, so that every subsequent phase lands on a clean structure. This is
purely internal and cannot break the working flow.

**Blocking questions that need a human decision (carried from the audit):**
1. Which Firebase project is authoritative — `arogyaai-cloud` or `arogyaai-cloud-ad667`?
2. What are the **current live Firestore rules** (Firebase console → Firestore → Rules)?
   Without the text, security cannot be audited or replaced safely.
