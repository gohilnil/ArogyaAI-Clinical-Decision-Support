# ArogyaAI — Final Completion Audit

**Date:** 2026-09-26
**Branch:** `feature/final-year-rebuild`
**Final commit:** `3d94102` (`3d941020957ed164c453db0f497f957f9d03f5df`)
**Working tree:** clean · **Commits ahead of `main`:** 37
**Tracked files:** 133

> **Runtime pass appended.** After this audit, a run was made with a real
> `GEMINI_API_KEY` and the Firebase emulators to drive the application itself.
> That closed the "browser E2E not possible" gap and found two defects that no
> amount of unit testing had exposed — see §20. This document's earlier sections
> are preserved as the record of that point in time; §20 supersedes them where
> they differ.

Status vocabulary used throughout, and nothing is labeled `VERIFIED` without a
command that was actually run:

- **VERIFIED** — executed here, result observed.
- **PARTIALLY VERIFIED** — some legs executed, a named leg was not.
- **UNVERIFIED** — not executed; no claim made.
- **BLOCKED** — needs credentials or human action that was unavailable.

---

## 1. Executive summary

This pass re-audited the repository rather than trusting the prior report, and
closed the largest remaining gap: **the Firestore rules suite now executes.**
It had been reported unrunnable because the emulator needs Java. A Temurin JRE 21
was in fact installed at `C:\Program Files\Eclipse Adoptium\` but never added to
`PATH`, so the emulator's `java -version` probe failed. With `JAVA_HOME` set,
**59/59 rules tests pass** — including two authorization regressions and three
query-level tests added in this pass.

Verifying that exposed a second defect: `tests/rules/package.json` declared **no
dependencies**, though the test imports `@firebase/rules-unit-testing` and
`firebase`. It had passed only because `node_modules` already existed in this
checkout; on a fresh clone it would have failed with `MODULE_NOT_FOUND` — while
`DEPLOYMENT.md` told the reader to run exactly that. Both are now declared, and a
lockfile was generated so `npm ci` works.

The most substantive product fixes were a **real registration race** (`useAuth`
read the profile once with `getDoc`, but registration fires `onAuthStateChanged`
before the profile document commits, so a new account landed with no role until a
manual reload), a **dashboard honesty bug** (gated rows were counted as a
predicted condition, so "General Imbalance (Review Required)" could rank as a
clinic's top diagnosis), and **missing clinical qualifiers** on the two screens
that show model output without a clinician present.

**No deployment was performed, and none is claimed.** No Render, Vercel, or
Firebase credentials were available. Deployment is `UNVERIFIED`.

---

## 2. Starting state

At `65e985a`, per the prior report and re-checked here:

- 78 Python tests passing; 59 rules tests authored but **not executed**.
- `tsc -b` and `npm run build` passing.
- Artifact matching its metadata.
- Reported unverified: rules execution, rules deployment, Render, Vercel, live
  auth, browser E2E.

Two claims in that report turned out to be wrong and are corrected here: the
rules suite *was* runnable, and `tests/rules` *was* not reproducible from a
clean clone.

## 3. Final state

Everything in the "unverified" list was re-attempted. What moved:

| Item | Was | Now |
|---|---|---|
| Firestore rules execution | unverified | **VERIFIED — 59/59 pass** |
| Rules harness reproducibility | no deps, no lockfile | **VERIFIED — deps declared, lockfile committed** |
| Browser render | not performed | **VERIFIED — login + registration rendered, no console errors** |
| Rules deployment | unverified | **UNVERIFIED** (no credentials) |
| Render / Vercel deploy | unverified | **UNVERIFIED** (no credentials) |
| Live Firebase auth | unverified | **BLOCKED** (no project access) |
| Full authenticated browser E2E | unverified | **BLOCKED** (no account in the live project) |
| CI | none existed | **VERIFIED locally** — workflow committed; remote run not observed |

## 4. Architecture

```
frontend/  React 19 · TypeScript 6 · Vite 8 · Tailwind 3
   9 pages behind role gates · services/api.ts (HTTP) · services/firestore.ts (data)

backend/   FastAPI, layered
   api/routes/    health.py, prediction.py
   services/      prediction_service.py
   ml/            model_loader · preprocessing · predictor · explainability
   ai/            gemini_service · prompts
   core/          config · security · rate_limit · logging
   schemas/       prediction · common

ml/        train.py (leak-free) · evaluate.py · artifacts/
tests/     test_ml · test_backend_api · test_security · test_rate_limit · rules/
```

The backend holds no Firestore credentials and never touches the database; all
data authorization is in Firestore rules. Identity comes from the verified token,
never the request body.

## 5. Data model

```
users/{uid}                                  role, clinicId, email, [patientId]
invites/{code}                               used, clinicId
patients/{patientId}                         name, age, gender, dosha, email, clinicId, createdBy, timestamps
patients/{patientId}/assessments/{id}        symptoms, profile, prediction, mlPrediction,
                                             confidence, aiReport, [explanation], clinicId, createdBy
patient_logs/{id}                            userId, email, symptoms, clinicId, [patientId]
```

No composite indexes required. Legacy pre-Phase-4 per-diagnosis documents are
**not** migrated — merging rows into people is a clinical-safety judgement no
script should make (`PHASE_4_MIGRATION_PLAN.md` §4). This remains open by design.

## 6. Security model

Verified controls: strict ID-token verification (RS256, `aud`, `iss`, `exp`,
`iat`, `sub`; `alg:none` rejected), role from document with invite gating,
immutable `role`/`clinicId`/`email`, clinic-scoped reads, append-only clinical
records, catch-all deny, CORS allowlist, no secret material in the repository.

Fixes in this pass and the immediately preceding one:

| # | Issue | Severity |
|---|---|---|
| 1 | `patient_logs` create did not bind `clinicId` to the caller → cross-tenant write | High |
| 2 | Any signed-in user could enumerate every invite and its `clinicId` | High |
| 3 | Practitioner registration could not complete (invite read while signed out) | High (functional) |
| 4 | Provider error text reached the client | Low-Medium |
| 5 | No ceiling on the LLM-cost endpoint | Medium |

**Adversarial probe (VERIFIED, live server):** no token → 401; malformed token →
401; forged `alg:none` → 401; `Basic` scheme → 401; `/` and `/api/health` → 200;
401 body leaked no internals.

## 7. ML methodology

```
raw CSV → clean → stratified 80/20 split (seed 42)      ← split FIRST
        → fit encoders + TF-IDF + scaler on TRAIN only
        → 3-fold CV macro-F1 on TRAIN only → select
        → SMOTE scored as a non-deployed variant
        → final fit on TRAIN → ONE evaluation on untouched TEST
```

Imbalance is handled with `class_weight='balanced'`; SMOTE inside CV is
mathematically unsafe at this class sparsity. `requirements.txt` now floors
scikit-learn at 1.9.0 — the version the committed pickle was fitted under —
because loading a pickle under an older version risks failure or silent drift.

## 8. Model metrics and artifact

Untouched 841-row test split: accuracy **0.8859**, macro-F1 **0.8372**,
weighted-F1 0.8761; 94 of 841 misclassified. The RF comparison candidate scores
0.8502 / 0.7946. The previously published 99–100% figures are withdrawn as
leakage-contaminated and appear only inside retraction sentences.

Artifact (**VERIFIED**, re-derived this pass):

| Property | Value |
|---|---|
| File | `arogyaai_model.joblib` |
| Estimator | `LogisticRegression` (multinomial) |
| Version | `v3-cv-selected` |
| Size | 2,680,914 bytes — matches `metrics.json` |
| SHA-256 | `e000590b…` — matches `metrics.json` |
| Classes / features | 399 / 819 (12 structured + 807 TF-IDF) |
| Fitted under | Python 3.14.5, scikit-learn 1.9.0 |

## 9. Explainability

Genuine, not cosmetic: for class *k* the score is
`intercept_k + Σ(coef[k,i] × x[i])` exactly, so each returned term is that
feature's real contribution. `intercept + total_contribution` is asserted to
equal the logit recomputed from the loaded model — in `tests/test_ml.py` and,
new in this pass, through the HTTP route in `tests/test_backend_api.py`. No
explanation is returned on the low-confidence path. Explanations are persisted
with the assessment and rendered in history.

## 10. Verification results

| Leg | Command | Result |
|---|---|---|
| ML tests | `python -m unittest tests.test_ml` | **29 pass** |
| Backend API | `python -m unittest tests.test_backend_api` | **27 pass** |
| Token verification | `python -m unittest tests.test_security` | **14 pass** |
| Rate limiting | `python -m unittest tests.test_rate_limit` | **8 pass** |
| **All Python** | `python -m unittest discover -s tests` | **78 pass** |
| Firestore rules | `firebase emulators:exec … "npm test"` | **59 pass** |
| TypeScript | `npx tsc -b` | exit 0 |
| Production build | `npm run build` | exit 0, 792 kB / 242 kB gzip |
| Browser render | preview server + DOM inspection | login and registration render; **zero console errors** |
| Artifact | SHA-256 + byte count vs `metrics.json` | match |
| Secrets scan | 133 tracked files | **none** |
| Stale name scan | code + config | **none** |

## 11. Performance

Measured on this machine (Python 3.14.5, scikit-learn 1.9.0, Windows 11,
Intel64 Family 6 Model 186), recorded in `MODEL_CARD.md` with its environment:

- Inference (1 row, `predict` + `predict_proba`, 300 samples): mean **0.372 ms**,
  median 0.258 ms, p95 0.586 ms.
- Frontend bundle: single 792 kB chunk (242 kB gzip); Vite warns. Not code-split
  — a real, low-priority issue, documented rather than hidden.

## 12. Changes in this pass

```
f464257 docs(llm): record the SDK end-of-life and the exact migration path
c8ca676 a11y: label the icon-only navigation controls
0823032 ci: enforce the verification suite on every push
64a4a33 fix(auth): watch the user profile instead of reading it once
ff39906 chore: remove the dead exceptions module and stale forward references
1156260 fix(dashboard): stop counting gated rows as a predicted condition
5c59c58 docs: sync the rules-test count to 59 after the query-level additions
1bb5668 test(rules): cover the list queries the UI actually issues
2d77ba4 test(integration): exercise the real model through the HTTP route
c9078c1 docs: correct the completion report after actually running the rules suite
22988c3 safety(clinical): qualify model output on the patient-facing screens
876922b test(rules): execute the emulator suite, fix its undeclared deps
4c4e3e6 chore(gitignore): ignore local tooling config
```

## 13. Remaining limitations

1. **Not clinically validated.** Dataset provenance is undocumented.
2. **Confidence is uncalibrated** — labeled "Model Score" in the UI, not
   "Confidence", after this work. The 35% gate is an inherited heuristic.
3. **Severe class imbalance** — macro-F1 (0.837) well below accuracy (0.886).
4. **Label-synonym confusion** caps achievable accuracy for near-identical classes.
5. **Rate limiting is per-process** — N instances multiply the effective limit.
6. **The LLM SDK is end-of-life.** Documented with its exact migration path in
   `backend/ai/gemini_service.py`; deliberately not migrated blind (see §14).
7. **Legacy records unmigrated** (by design).
8. **Frontend bundle not code-split.**
9. **CV is mildly optimistic** — preprocessing fitted once on train, not per fold.

## 14. What was deliberately not done

- **The `google-genai` migration.** It needs a live key and network to verify,
  and every test stubs the LLM call wholesale — a subtly-wrong migration would
  leave all 78 tests green while every real request silently fell back to the
  static message. Swapping working, exercised code for an unverifiable rewrite is
  the wrong trade. The deprecation and the exact replacement call are recorded in
  the module docstring.
- **Legacy data migration.** Requires clinical judgement about identity.
- **Deployment.** Requires credentials.

## 15. Manual actions still required

1. **Deploy Firestore rules** —
   `firebase deploy --only firestore:rules,firestore:indexes --project arogyaai-cloud-ad667`.
   Run the emulator suite first (it passes locally, 59/59).
2. **Deploy the backend to Render.** Set `GEMINI_API_KEY`; confirm the other vars
   from `DEPLOYMENT.md` §2.
3. **Deploy the frontend to Vercel** with `VITE_API_URL` set to the backend origin.
4. **Create an invite** in the Firebase console with a **long random** code
   before any practitioner registers.
5. **Walk the post-deploy checklist** (`DEPLOYMENT.md` §8), which includes
   authenticating with a real account — the one leg that cannot be done here.
6. **Migrate the LLM SDK** where a key is available (path documented).
7. **Confirm the CI workflow runs** on the remote once pushed.

## 16. Exact commands

```bash
pip install -r requirements.txt
```

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

```bash
python -m unittest discover -s tests
```

```bash
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jre-21.0.12.101-hotspot" && export PATH="$JAVA_HOME/bin:$PATH" && firebase emulators:exec --only firestore --project arogyaai-cloud-ad667 "cd tests/rules && npm test"
```

## 17. Rollback

Nothing in this pass adds a destructive migration, so no rollback loses data.

```bash
git revert <commit>
```

- **Frontend / backend** — redeploy the previous Vercel / Render build.
- **Artifact** — `git checkout <prev> -- arogyaai_model.joblib`, then verify it
  loads and `/api/health` reports the expected `model_type`.
- **Rules** — `git checkout <prev> -- firestore.rules`, re-run the emulator
  suite, then redeploy.

## 18. Definition-of-done checklist

| Area | Status | Evidence |
|---|---|---|
| Code — no known critical bugs | VERIFIED | 78 Python tests; specific defects found and fixed this pass |
| Code — no secrets, no debug code | VERIFIED | scan of 133 tracked files; no TODO/FIXME in first-party code |
| Frontend — builds | VERIFIED | `tsc -b` exit 0; `npm run build` exit 0 |
| Frontend — renders | VERIFIED | login + registration rendered in a browser; zero console errors |
| Frontend — flows | PARTIALLY VERIFIED | role toggle and invite field verified; authenticated flows need a live account |
| Backend — endpoints | VERIFIED | 27 API tests incl. 9 unmocked integration tests; live `/` + `/api/health` + `/api/predict` |
| Backend — errors safe | VERIFIED | 401 body inspection; provider error no longer returned |
| Database — rules executed | VERIFIED | **59/59 pass against the emulator** |
| Database — rules deployed | UNVERIFIED | no credentials |
| ML — no leakage | VERIFIED | split-first pipeline; test set untouched |
| ML — artifact matches | VERIFIED | SHA-256 and byte count re-derived |
| ML — explainability genuine | VERIFIED | identity asserted in tests and through the HTTP route |
| Security — auth | VERIFIED | 14 token tests + live adversarial probe |
| Security — authorization | VERIFIED (rules executed) | 59/59 emulator tests |
| Security — rate limiting | VERIFIED | 8 tests, incl. through the route |
| Security — CORS | VERIFIED | allowlist, no wildcard |
| Deployment — configuration | PARTIALLY VERIFIED | Python pin defect fixed; artifact-load check added to CI; **nothing deployed** |
| Documentation | VERIFIED | living docs rewritten against code; historical records preserved |
| Git — tree clean | VERIFIED | `git status` empty |

---

## 19. Honest statement of completeness

The repository is **complete as software in the working tree**: it builds, its
tests pass, its rules execute, its model loads and explains itself, its
documentation describes what the code does, and no dead UI or false claim
survives in living material.

It is **not deployed, and it is not clinically validated.** Those are different
claims, and the second is not a matter of engineering. The three external steps
that remain — deploying rules, backend and frontend, and one authenticated
end-to-end walkthrough — require credentials this environment did not have. They
are documented with exact commands in `DEPLOYMENT.md` and listed in §15, not
implied to be done.

---

## 20. Runtime pass (appended)

A `GEMINI_API_KEY` became available and Java 21 was located, so the application
was actually run rather than only statically verified. This section supersedes
the earlier "browser E2E not possible" claim.

### What was executed

| Leg | Result |
|---|---|
| Real Gemini call, direct | **VERIFIED** — 2741-char Ayurvedic narrative, names the predicted condition, invents no confidence figure, advises professional consultation |
| Backend, production config | **VERIFIED** — loads artifact, `/api/health` reports `Logistic Regression` / 399 diseases |
| Auth gate | **VERIFIED** — no token → 401; malformed → 401; forged `alg:none` → 401; `Basic` → 401; 401 body leaks nothing |
| CORS preflight from the Vite origin | **VERIFIED** — allowlist matches, credentials allowed, `authorization,content-type` permitted |
| Full prediction path over HTTP | **VERIFIED** — `Common Cold`, confidence 92.56, 8 explanation features, 2709-char real narrative, ~14 s end to end |
| Patient registration (browser) | **VERIFIED** — portal rendered, profile doc written with `role=patient, clinicId=CLIN01` |
| Practitioner registration (browser) | **VERIFIED** — invite-gated, "PRACTITIONER PORTAL", `role=doctor` |
| Assessment save (browser) | **VERIFIED** — patient + assessment persisted, `explanation` stored, patient code issued |
| History read (browser) | **VERIFIED** — after the fix in §20.2, the practitioner opens the record and sees the prediction |
| Console errors | **VERIFIED clean** after both fixes |
| Rules suite | **61/61 pass** (was 59; +2 regressions, below) |
| Python suite | **78 pass**, unchanged |

The live project was deliberately **not** written to. Testing authenticated flows
against `arogyaai-cloud-ad667` would have exercised whatever rules happen to be
deployed there rather than the rules in this repository, and would have left real
accounts and documents behind. The emulators were used instead, with this
repository's rules. The only live check was a read: unauthenticated document
access returns `403 PERMISSION_DENIED`, confirming the deployed rules are not
open.

### Two defects found by running it, both invisible to the test suite

**20.1 — Registration race (fixed, `47126c0`).**
A freshly registered practitioner saw "Could not load clinic statistics" and an
empty dashboard until they reloaded; a returning user never saw it. Every
clinic-scoped query is authorised by a rule that reads the caller's own profile
(`isDoctor()` → `get(users/{uid}).data.role`). Registration applies the profile
write locally first, so the profile listener published a document the server did
not yet have; the dashboard then queried inside that window and the rule
evaluated against a nonexistent profile — `get()` returned null, `.data` raised a
null-value evaluation error, and the query was denied.

The first fix attempt gated on `metadata.fromCache` and **failed**. Measurement
against the emulator showed why: for an unacknowledged local write the listener
reports `fromCache: false` with `hasPendingWrites: true`, so that check passes
straight through. The gate now uses `hasPendingWrites`.

**20.2 — Assessment history denied to practitioners (fixed, `9a0b7da`).**
A practitioner could create a patient and an assessment, then not open the
record: "Could not load this patient record." The assessments read rule
authorises a practitioner via `resource.data.clinicId`, and Firestore evaluates a
*list* query against that same rule, denying the whole result set unless the
query's own constraints satisfy it. The page issued an **unfiltered** read, so it
was denied. The patient's own view of the same page worked, because its branch
(`ownsPatient`) is path-scoped and needs no field — which is exactly why this
survived: two callers, one rule, different branches, only one broken.

Reproduced directly: unfiltered read → denied; same read with a `clinicId` filter
→ allowed. `listPatientAssessments` now requires `clinicId` and filters on it.

### Why the suite missed both

The rules suite tested documents and clinic-filtered *queries*, but never an
**unfiltered** subcollection query — the shape a practitioner's history page
actually issues. Two regression tests now pin both sides, so the filter cannot be
silently dropped again.

### Deployment status after this pass

Unchanged and still honest: **nothing is deployed.** No Render, Vercel, or
Firebase credentials were available, and `git push` to the remote is denied
(`403` for `gohilnil`), so the CI workflow has not run remotely either. The
`arogyaai.vercel.app` URL returned 200, but inspection showed it serves a legacy
Create-React-App bundle pointing at `ai-health-n4i4.onrender.com` — a different
application, not this one. It is not this project's deployment and must not be
presented as such.
