# ArogyaAI — Deployment Runbook

**Status of everything below: UNVERIFIED as an execution.** No credentials for
Render, Vercel, or the `arogyaai-cloud-ad667` Firebase project were available in
the environment where this runbook was written. Nothing here has been run by it.
Every command has been checked against the repository's actual configuration
files, and the local verification steps have been executed and pass — but the
external steps are documented, not claimed as done.

Legend: **VERIFIED** (run here, passed) · **UNVERIFIED** (needs credentials or a
human).

---

## 0. Prerequisites

| Component | Purpose | Needed for |
|---|---|---|
| Python ≥ 3.11 | Backend and ML | local run, Render |
| Node ≥ 20 | Frontend build, rules tests | local build, Vercel |
| Firebase CLI | Rules deploy, emulator | Firestore rules |
| **Java (JRE 11+)** | Firestore emulator | rules tests only |

> **Java must be on `PATH`.** The Firestore emulator shells out to `java -version`
> and exits immediately if it cannot find it — the failure message is
> `Could not spawn 'java -version'`, which does not say where it looked.
>
> On Windows a JRE is often installed to `C:\Program Files\Eclipse Adoptium\...`
> without being added to `PATH`. Set it explicitly for the session:
>
> ```bash
> export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jre-21.0.12.101-hotspot"
> export PATH="$JAVA_HOME/bin:$PATH"
> ```
>
> The rules suite was verified green (61/61) with Temurin JRE 21.0.12.1. It is
> executed, not merely syntax-checked.

## 1. Local verification (do this before deploying anything)

```bash
python -m unittest discover -s tests
```
Expected: **78 tests pass**. Covers API contract, token verification, the
prediction pipeline, explainability arithmetic, and rate limiting.

```bash
cd frontend && npx tsc -b && npm run build
```
Expected: exit 0, `frontend/dist/` written.

```bash
python -c "import joblib; c=joblib.load('arogyaai_model.joblib'); print(type(c['model']).__name__)"
```
Expected: `LogisticRegression`. Confirms the committed artifact loads in the
local interpreter.

Start the backend and check it:

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```bash
curl -s http://127.0.0.1:8000/api/health
```
Expected: `{"status":"healthy","model":"Logistic Regression","supported_diseases":399,...}`.
The model name is read from the artifact, so it reflects what is actually loaded.

Firestore rules (needs Java):

```bash
firebase emulators:exec --only firestore --project arogyaai-cloud-ad667 "cd tests/rules && npm test"
```
Expected: **83 tests pass**, including the clinic-binding, admin-approval, and
assessment-query-scoping regressions.

### Authenticated end-to-end run (emulators, no production impact)

This exercises the whole application — registration, the prediction pipeline
with the real LLM, saving an assessment, and reading it back — without creating
any accounts or documents in the live project.

```bash
# 1. Emulators (auth on 9099, Firestore on 8080)
export JAVA_HOME="/c/Program Files/Eclipse Adoptium/jre-21.0.12.101-hotspot"
export PATH="$JAVA_HOME/bin:$PATH"
firebase emulators:start --only auth,firestore --project arogyaai-cloud-ad667
```

```bash
# 2. Backend. AROGYA_AUTH_REQUIRED=false is the documented local-debug switch;
#    it defaults to true and is set in no deployment file. It is needed here
#    because emulator-issued tokens are signed by the emulator, while the
#    backend verifies against Google's real certificates — an inherent
#    mismatch that no test-only bypass in the auth code should paper over.
AROGYA_AUTH_REQUIRED=false uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```bash
# 3. Frontend with the emulator flag (gitignored .env.local)
printf 'VITE_USE_FIREBASE_EMULATORS=true\nVITE_API_URL=http://127.0.0.1:8000\n' > frontend/.env.local
cd frontend && npm run dev
```

```bash
# 4. Register a practitioner in the browser, then approve it. A doctor
#    self-registers into `status: pending` and an admin approves; seeding the
#    approval directly with the emulator's owner token is the shortcut.
curl -s -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  "http://127.0.0.1:8080/v1/projects/arogyaai-cloud-ad667/databases/(default)/documents/users/<DOCTOR_UID>?updateMask.fieldPaths=status" \
  -d '{"fields":{"status":{"stringValue":"approved"}}}'
```

Then in the browser: register a patient with Clinic ID `CLIN01`, sign out,
register a practitioner with the same Clinic ID, approve it as above, run an
analysis, and open the patient record. Two defects were only ever visible by
doing this — a registration race and a wrongly-scoped history query — so it is
worth running before any deployment.

## 2. Environment variables

Copy `.env.example` to `.env` for local work. **Never commit `.env`** (it is
gitignored). For a deployment, set these in the host's dashboard.

| Variable | Required? | Value / default | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | **required** | — | Server-side only. Without it the Ayurvedic narrative degrades but prediction still works. |
| `FIREBASE_PROJECT_ID` | defaulted | `arogyaai-cloud-ad667` | Token `aud`/`iss` are derived from it. Wrong value ⇒ every token rejected. |
| `AROGYA_AUTH_REQUIRED` | defaulted | `true` | **Never set false in a deployment.** |
| `AROGYA_CORS_ORIGINS` | defaulted | localhost ports + both Vercel origins (see note) | Must include the exact served origin, or preflight fails with 400 and the browser blocks every call — with no server-side error. |
| `AROGYA_CONFIDENCE_THRESHOLD` | defaulted | `35.0` | Safety gate; not a validated threshold. |
| `AROGYA_GEMINI_MODELS` | defaulted | 3-model fallback chain | Tried in order. |
| `AROGYA_RATE_LIMIT_PER_MINUTE` | defaulted | `30` | `0` disables. Per-process — see §5. |
| `AROGYA_MODEL_PATH` | defaulted | `arogyaai_model.joblib` | Repo root. |
| `VITE_API_URL` | frontend | — | Build-time. Points the bundle at the backend. |

## 3. Backend — Render

`render.yaml` is a Render Blueprint and is the source of truth. It pins
`PYTHON_VERSION` to a version **≥ 3.11**, because scikit-learn 1.9 declares
`Requires-Python >=3.11`; the earlier 3.10.12 pin could not install the declared
dependency. The committed artifact was fitted under scikit-learn 1.9.0 / Python
3.14.5 (`ml/artifacts/model_metadata.json`). If you change the Python version,
confirm afterwards that the artifact still loads — it is a pickle, and loading a
pickle across incompatible library versions is the real risk here.

Steps (UNVERIFIED):

1. Create a Render Web Service from this repository, environment `python`.
2. Point it at `render.yaml` (Render reads the Blueprint automatically).
3. Set the secret env vars above — at minimum `GEMINI_API_KEY`. It is marked
   `sync: false`, so Render will prompt rather than take a committed value.
4. Deploy, then check `GET https://<service>/api/health` returns `status:
   healthy` and the expected model name.

The start command is `uvicorn backend.index:app --host 0.0.0.0 --port $PORT`.
`backend.index` is a compatibility shim re-exporting `backend.main`. Both work;
`backend.main` is the direct entry point for new use.

## 4. Frontend — Vercel

`vercel.json` holds the build configuration (builds `frontend/`, output
`frontend/dist`). Steps (UNVERIFIED):

1. Import the repository into Vercel.
2. Set `VITE_API_URL` to the Render backend origin. This is baked in at build
   time — changing it requires a redeploy, not just an env edit.
3. Deploy, then load the site and sign in.

Note: a signed-in **doctor** can override the API base URL from Profile →
AI Engine Configuration. That override is stored in the browser's
`localStorage` and takes precedence over `VITE_API_URL`. It is validated as an
`http(s)` URL and only applied on an explicit save. If a clinician reports
requests going to the wrong place, that field is the first thing to check.

## 5. Firestore rules and indexes

Rules live in `firestore.rules`, indexes in `firestore.indexes.json` (currently
empty — no composite index is required).

```bash
firebase deploy --only firestore:rules,firestore:indexes --project arogyaai-cloud-ad667
```

**Do not run this until the emulator suite passes locally (§1).**

Rules and indexes do **not** auto-deploy from a `git push`, unlike Vercel and
Render. After changing `firestore.rules` or `firestore.indexes.json`, deploy
them explicitly, then verify by fetching the live ruleset and diffing it against
the repository file — do not assume the deploy landed.

### Approving a practitioner

Doctor onboarding is an approval, not a secret. A doctor self-registers into
`status: 'pending'` with their clinic's ID; the account has no access until an
administrator approves it from the admin panel (Admin → Awaiting approval).

The first administrator must be provisioned **out of band**, because the rules
deliberately provide no client path to create one:

```
Auth account: admin@example.com (Firebase console / Admin SDK)
users/{uid}  ->  { email, role: "admin", clinicId: "<6-char clinic id>" }
```

An invite-code system preceded this and was removed on 2026-09-27. There is no
`invites` collection in the rules; it falls through to default-deny.

## 6. What is deliberately NOT automated

- **Admin provisioning** — out of band by design; no client can mint an admin.
- **Legacy record migration** — deliberately not automated. Pre-Phase-4
  per-diagnosis documents are left in place because deciding whether two rows
  describe the same person is a clinical-safety judgement no script should make.
  See `PHASE_4_MIGRATION_PLAN.md` §4.
- **Horizontal scaling** — the rate limiter is per-process. Running N instances
  multiplies the effective limit by N. That is a real limitation; a shared store
  is the correct fix *if* the service is ever scaled out. See `SECURITY.md` §6.4.

## 7. Rollback

The backend and frontend are independently revertable:

1. **Frontend:** redeploy the previous Vercel build, or revert the commit and let
   Vercel rebuild.
2. **Backend:** in Render, redeploy the previous image/commit.
3. **Model artifact:** `arogyaai_model.joblib` is tracked in git, so
   `git checkout <previous-commit> -- arogyaai_model.joblib` restores the prior
   artifact. Re-verify it loads and that `/api/health` reports the expected
   `model_type` afterwards. The prior version's SHA-256 is recorded in
   `ml/artifacts/metrics.json`.
4. **Firestore rules:** `git checkout <previous-commit> -- firestore.rules`,
   re-run the emulator suite, then redeploy. Rules roll back like any other file;
   **data does not** — this deployment adds no destructive migration, so a rules
   rollback loses nothing.

## 8. Post-deploy checklist

- [ ] `GET /api/health` → 200, correct model name, 399 diseases.
- [ ] `POST /api/predict` without a token → **401**.
- [ ] `POST /api/predict` with a real token → 200, prediction + explanation.
- [ ] Prediction calls from the deployed frontend origin are not CORS-blocked.
- [ ] Exceeding the rate limit → 429 with `Retry-After`.
- [ ] Doctor registration lands `pending` and cannot read clinic data until approved.
- [ ] A patient can read only their own record.
- [ ] A practitioner cannot read another clinic's records.
- [ ] Firestore rules deployed (confirm in the console that the live rules match
      the repository copy).
