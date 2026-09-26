# ArogyaAI — Architecture Plan

> Planning artefact for the final-year rebuild. Describes the **current** state
> (verified in Phase 0), the **target** state, the migration sequence, and the
> rollback strategy. **No application behaviour changes in this document.**
>
> Authoritative Firebase project: `arogyaai-cloud-ad667` (pinned in `frontend/src/firebase.ts`,
> committed in `phase-0-baseline`).

---

## 1. Current architecture (verified)

```
frontend/src/
  App.tsx        2120 lines — auth screen + 7 page components + router, ONE file
  firebase.ts    20 lines — Firebase init, hardcoded web config
  main.tsx       10 lines — React root
  index.css      animated gradient body + Tailwind layers

backend/
  index.py       212 lines — FastAPI app, 3 routes, validation, model wiring

(root)
  arogya_predict.py            302 lines — model load, preprocess, Gemini call, CLI
  train_model.py               248 lines — training (has data leakage)
  disease_prediction_system.py 510 lines — DEAD
  demo.py                      127 lines — BROKEN (imports non-existent class)
  random_forest_model.pkl      1105 MB — tracked in Git
  tests/test_backend_api.py    10 tests — cannot run (missing httpx)
```

### Dependency graph (current)

```
main.tsx ──► App.tsx ──┬──► firebase.ts (auth, db)
                       ├──► firebase/auth  (signIn, onAuthStateChanged, …)
                       ├──► firebase/firestore (collection, addDoc, getDocs, …)
                       ├──► react-router-dom
                       ├──► framer-motion, lucide-react
                       └──► fetch() ──► backend/index.py ──► arogya_predict.py
                                                              ├──► model pkl
                                                              └──► Gemini API
```

**All application logic for every page lives inside `App.tsx`.** There is no
service layer, no shared types module, no route guard component, and Firestore
calls are written inline inside each page component.

---

## 2. Target architecture (this rebuild)

### 2.1 Frontend

```
frontend/src/
  config/
    firebase.ts                # moved from src/firebase.ts (verbatim init)
  types/
    index.ts                   # FormData, AnalysisResult, UserData, PatientRecord, LogRecord
  services/
    api.ts                     # the ONLY place that calls fetch() for prediction
  hooks/
    useAuth.ts                 # onAuthStateChanged + users/{uid} profile load
  components/
    layout/
      Sidebar.tsx              # nav rail (role-aware)
      AppShell.tsx             # sidebar + main + <Routes>
  pages/
    LoginPage.tsx              # auth screen (login/register/Google)
    DashboardPage.tsx          # doctor dashboard (GlobalDashboard)
    DiagnosePage.tsx           # 3-step diagnostic + result (DiagnosticTool)
    PatientsPage.tsx           # clinic records + diaries (PatientRecords)
    ProfilePage.tsx            # account settings (ProfileSettings)
    HelpPage.tsx               # help centre (HelpCenter)
    PatientHomePage.tsx        # patient dashboard (PatientDashboard)
    PatientCheckupPage.tsx     # patient symptom logger (PatientCheckup)
  App.tsx                      # slim: auth gate + <AppShell/>
```

**Guiding constraint:** every component body is moved **verbatim**. The split is
mechanical, not a rewrite — so runtime behaviour is bit-for-bit identical.
Import lists are the only thing recomputed per file (required because
`noUnusedLocals: true` fails the build on unused imports).

**Deliberately NOT done in Phase 1** (to avoid over-engineering / behaviour change):
- No state-management library (React state + hooks are sufficient).
- No `contexts/` layer — `userData` is threaded as props today; introducing
  context would change the component contract and risks behaviour drift.
- No `utils/` split until there is a second caller for a helper.

### 2.2 Backend (Phase 2 — planned, not built yet)

```
backend/
  main.py                      # app factory, CORS, router registration
  api/routes/{health,prediction}.py
  services/{prediction_service,gemini_service}.py
  ml/{model_loader,preprocessing,predictor}.py
  schemas/{prediction,ai_report}.py
  core/{config,security,logging}.py
```

`backend/index.py` is retained as a compatibility shim until every consumer
(`render.yaml`, docs, tests) points at `backend.main:app`.

---

## 3. Database model

### 3.1 Current (flat, unversioned)

```
users/{uid}                 email, role, clinicId
patients/{autoId}           name, age, gender, dosha, symptoms, diagnosis,
                            confidence, clinicId, createdAt     ← one row PER DIAGNOSIS
patient_logs/{autoId}       userId, email, symptoms, clinicId, createdAt
firestore.rules             ← DOES NOT EXIST IN REPO (security unverifiable)
```

### 3.2 Implemented in Phase 4 (stable identity + assessment history)

```
users/{uid}                                     email, role, clinicId, patientId?
                                                ↑ patientId links a patient account to its record
patients/{patientId}                            clinicId, name, age, gender, dosha, email?,
                                                createdBy, createdAt, updatedAt
                                                ← IDENTITY ONLY (no symptoms, no diagnosis)
patients/{patientId}/assessments/{assessmentId} patientId, clinicId, symptoms, age, gender,
                                                dosha, season, weather, foodHabits,
                                                heightCm, weightKg, prediction, mlPrediction,
                                                confidence, aiReport, createdBy, createdAt
                                                ← ONE CLINICAL EVENT, append-only
patient_logs/{logId}                            userId, email, patientId?, clinicId,
                                                symptoms, createdAt   (append-only)
invites/{code}                                  used, clinicId
```

**Not created:** `clinics`, `ai_reports`, `appointments`, `notifications`. A
`clinics` collection would add an entity with no behaviour attached yet — clinic
identity is currently carried on the user profile and enforced by rules. Adding
it later is additive and non-breaking. Empty collections are the "feature for
appearance" trap the brief forbids.

**Patient identity is NOT duplicated into assessments.** An assessment stores the
clinical *inputs* it was run against (age/gender/dosha at that moment) as
prediction provenance — not as a second copy of who the person is.

### 3.3 Migration strategy (non-destructive, documented)

`PHASE_4_DATA_AUDIT.md` and `PHASE_4_MIGRATION_PLAN.md` establish:

- Legacy per-diagnosis documents are **left untouched** — never rewritten or
  deleted. Auto-merging them into patients is unsafe: deciding whether two rows
  are the same person is a clinical-safety judgement that cannot be automated.
- Legacy documents are therefore **not displayed** in the new UI rather than
  guessed at. Stated as a limitation in `SECURITY.md` §6.2.
- New writes use the new model from ship date. Rollback is `git revert`; no data
  is lost because nothing was modified.

### 3.4 Query ↔ rules compatibility

Firestore authorizes a list query only if the rule's conditions are satisfiable
from the query's own filters. Verified against the running emulator:

| Query | Filter | Authorized by |
|---|---|---|
| doctor: patients | `clinicId == myClinic` | `resource.data.clinicId == myClinic()` |
| doctor: assessments (collection group) | `clinicId == myClinic` | same |
| patient: own assessments | path-scoped, no filter | `ownsPatient(patientId)` |

Both collection-group and path-scoped patterns are exercised in the rules suite.

---

## 4. API model

### Current (3 routes, `backend/index.py`)
```
GET  /              welcome
GET  /api/health    status, model, supported_diseases
POST /api/predict   ML prediction + confidence + Gemini text
```

### Target (additive only — no breaking change)
```
GET  /api/health          → add real model type from pkl (not hardcoded)
POST /api/predict         → add xai, model_version; structured ai_report
GET  /api/model/info       (new — model card metadata)
```

Auth on `/api/predict` (Firebase ID token) is Phase 3; Phase 1 leaves the
contract unchanged so the running app is unaffected.

---

## 5. Authentication & authorization model

| Concern | Today | Target |
|---|---|---|
| Identity | Firebase Auth ✅ | unchanged |
| Role source | **client-chosen at signup** ❌ | server-controlled; default `patient` |
| Doctor creation | self-service ❌ | controlled bootstrap |
| Route protection | conditional render, no guard | `ProtectedRoute` by role |
| DB enforcement | unknown (no rules in repo) ❌ | versioned `firestore.rules` |
| API auth | none ❌ | Firebase ID token verified server-side |

**Phase 1 scope:** introduce a `ProtectedRoute` component and route structure
**without changing who can currently do what** — the privilege-escalation fix is
Phase 3, so that each change is independently reviewable and revertible.

---

## 6. ML pipeline

### Current (leakage — see PROJECT_AUDIT §5)
Fit TF-IDF + scaler on **full** dataset → SMOTE on **full** dataset → split → train
→ select winner **on the test set**.

### Target (Phase 10)
Split → fit preprocessing on train only → SMOTE on train only → CV on train →
select → evaluate **once** on untouched test.

### Deliverables
`ml/{train,evaluate,inference,preprocessing}.py`, `MODEL_CARD.md`,
`model_metadata.json` (version, training date, dataset hash, metrics, sklearn/python
version), and `model_version` recorded on every prediction and assessment.

**Phase 1 does not retrain.** The existing pkl stays in place so the app keeps working.

---

## 7. GenAI pipeline

| Concern | Today | Target (Phase 7) |
|---|---|---|
| Output | free text | Pydantic-validated JSON |
| Confidence | **invented by the model (69% vs 88% observed)** ❌ | never emitted by the LLM |
| Fallback | apology string leaking `last_error` | structured, logged, no leak |
| Persistence | not stored | stored on the assessment |

**Non-negotiable:** exactly one authoritative confidence value, always from the ML
model. The LLM may not state a percentage, probability, or diagnosis certainty.

---

## 8. Migration sequence

| Phase | Change | Risk | Reversible |
|---|---|---|---|
| **1 (this)** | Split `App.tsx`; add `types/`, `services/api.ts`, `hooks/useAuth.ts`, `config/firebase.ts`, `ProtectedRoute` | Low | ✅ new branch, verbatim bodies |
| 2 | Backend service layer behind `backend/main.py`; keep `index.py` shim | Low | ✅ shim retained |
| 3 | Role model + versioned `firestore.rules` + API auth | **High** | ✅ rules deploy is revertible |
| 4 | Patient identity + assessments subcollection | **High** | ⚠️ needs dual-read |
| 5 | ML retrain, leak-free, honest metrics | Medium | ✅ new artifact; old pkl kept |
| 6 | Structured Gemini + XAI + persist AI report | Medium | ✅ feature-flagged |
| 7+ | Tests, UX, docs, cleanup | Low | ✅ |

Rule for every phase: **if it is not reversible, it is not started without a
checkpoint commit.**

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Verbatim split introduces a typo → silent UI regression | Mechanical line-slice + `tsc` + build + manual diff review |
| R2 | `noUnusedLocals` fails build on stale imports | tsc-driven import correction loop |
| R3 | Firebase project confusion (`arogyaai-cloud` vs `-ad667`) | `-ad667` pinned + committed; docs corrected in Phase 19 |
| R4 | Live Firestore rules unknown | **Blocker for Phase 3** — need rules text from console |
| R5 | 1.1 GB model in Git | Documented; resolved in Phase 17/22 |
| R6 | DB restructure breaks patient feed | Phase 4 only, dual-read, checkpoint |
| R7 | Retrain produces worse (honest) metrics | Expected and acceptable — Phase 11 documents it |

---

## 10. Rollback strategy

- Work confined to `feature/final-year-rebuild`; `main` untouched.
- Checkpoint commit `66e30e0` = known-good working tree before any refactor.
- Each phase = one commit; `git revert <sha>` restores the prior phase.
- Phase 1 is additive: `App.tsx` is rewritten but every component body is byte-identical,
  so `git diff main -- frontend/src` shows only moves + import lines.
- **No database, model, or Gemini changes in Phase 1** → nothing to roll back server-side.

---

## 11. Files that will move (exact)

| From | To |
|---|---|
| `src/firebase.ts` | `src/config/firebase.ts` |
| `src/App.tsx` lines 70–98 | `src/types/index.ts` |
| `src/App.tsx` lines 100–226 (Sidebar) | `src/components/layout/Sidebar.tsx` |
| `src/App.tsx` lines 228–323 (PatientCheckup) | `src/pages/PatientCheckupPage.tsx` |
| `src/App.tsx` lines 325–466 (PatientDashboard) | `src/pages/PatientHomePage.tsx` |
| `src/App.tsx` lines 468–586 (GlobalDashboard) | `src/pages/DashboardPage.tsx` |
| `src/App.tsx` lines 588–793 (PatientRecords) | `src/pages/PatientsPage.tsx` |
| `src/App.tsx` lines 795–894 (ProfileSettings) | `src/pages/ProfilePage.tsx` |
| `src/App.tsx` lines 896–926 (HelpCenter) | `src/pages/HelpPage.tsx` |
| `src/App.tsx` lines 928–1743 (DiagnosticTool) | `src/pages/DiagnosePage.tsx` |
| `src/App.tsx` lines 1745–2120 (App) | `src/App.tsx` (rewritten slim) |
| inline `fetch('/api/predict')` | `src/services/api.ts` |
| inline `onAuthStateChanged` block | `src/hooks/useAuth.ts` |
| inline auth screen JSX | `src/pages/LoginPage.tsx` |
| inline `<Routes>` block | `src/components/layout/AppShell.tsx` |

## 12. Import / dependency risks (exact)

1. **`noUnusedLocals` / `noUnusedParameters` both `true`** → every file must import
   exactly what it uses; unused icon imports fail the build.
2. **`verbatimModuleSyntax: true`** → type-only imports must use `import type { … }`
   (`FirebaseUser`, `FormData`, `UserData`).
3. **`allowImportingTsExtensions: true`** but existing code imports without extension
   (`"./firebase"`) — relative paths resolve the same, so this is safe.
4. `AnalysisResult` declares `xai_breakdown`/`indicators`/`herbs`/`lifestyle` that the
   API never returns — **kept as-is in Phase 1** (removing them is a Phase 6 change).
5. `main.tsx` imports `./App.tsx` — unchanged.
6. Case-sensitivity: Windows dev is case-insensitive but Vercel/Linux is not → new
   paths must match imports exactly.
