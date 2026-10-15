# ArogyaAI — Project Architecture

## 1. Overview

ArogyaAI is an Ayurvedic Clinical Decision Support System with a multi-clinic, role-based architecture. It separates the AI prediction backend from the clinical data layer and the patient-facing portal.

---

## 2. Architecture Diagram

`
+-------------------------------------------------------+
|                      BROWSER                          |
|  React 19 + TypeScript + Vite + Tailwind CSS          |
|  Firebase SDK (Auth, Firestore)                       |
+-------------------+-----------------------------------+
                    |                    |
              Firebase Auth         Firestore DB
              (ID Tokens)       (users, patients,
                    |            assessments, clinics)
                    |
         +----------+----------+
         |   FastAPI Backend   |
         |   (Python 3.14)     |
         +---+-------------+--+
             |             |
        ML Pipeline    Gemini API
        (Logistic      (google-genai)
        Regression,
        TF-IDF,
        LabelEncoder,
        StandardScaler)
`

---

## 3. Component Details

### 3.1 Frontend (React 19 + Vite)

Location: `frontend/src/`

| Component | Purpose |
|---|---|
| App.tsx | Auth state machine — routes to Login / AppShell / Unprovisioned / PendingApproval |
| pages/LoginPage.tsx | Firebase email+password login, Google sign-in |
| pages/DashboardPage.tsx | Live clinic statistics from Firestore |
| pages/DiagnosePage.tsx | Multi-step diagnosis form, ML prediction, XAI panel, save to Firestore |
| pages/PatientsPage.tsx | Paged list of clinic patients |
| pages/PatientDetailPage.tsx | Patient profile + assessment history |
| pages/PatientCheckupPage.tsx | Individual assessment detail |
| pages/PatientHomePage.tsx | Patient-scoped portal (own history) |
| pages/admin/*.tsx | Admin panel: accounts, clinics, approvals, audit log |
| pages/HelpPage.tsx | Help and guidance |
| components/layout/AppShell.tsx | Navigation shell |
| components/ErrorBoundary.tsx | React crash containment |
| hooks/useAuth.ts | Firebase Auth + Firestore profile listener |
| services/api.ts | POST /api/predict with ID token |
| services/firestore.ts | All Firestore CRUD operations |
| config/firebase.ts | Firebase initialisation + optional emulator connection |

### 3.2 Backend (FastAPI)

Location: `backend/`

| Module | Purpose |
|---|---|
| index.py | Legacy entry-point, re-exports app and public names |
| main.py | create_app() — registers routers, CORS |
| api/routes/health.py | GET / and GET /api/health |
| api/routes/prediction.py | POST /api/predict (auth + rate limit + ML) |
| core/config.py | All env-driven settings |
| core/security.py | Firebase ID-token verification (RS256, no service account key) |
| core/rate_limit.py | Per-caller request ceiling |
| core/logging.py | Structured logger |
| ml/model_loader.py | Loads arogyaai_model.joblib once at startup |
| ml/preprocessing.py | Age group, categorical encoding, TF-IDF, scaling |
| ml/predictor.py | predict() — label + confidence |
| ml/explainability.py | Logit-contribution XAI for linear models |
| ai/gemini_service.py | Gemini model chain with fallback |
| ai/prompts.py | Prompt construction |
| schemas/prediction.py | PredictRequest / PredictResponse Pydantic models |
| schemas/common.py | HealthResponse / RootResponse |
| services/prediction_service.py | Orchestrates normalise -> preprocess -> predict -> XAI -> Gemini |

### 3.3 ML Pipeline

`
User Input (symptoms, demographics, lifestyle)
     |
     v
normalize_categoricals()   <- fallback unseen values to valid encoder class
     |
     v
derive_age_group()         <- numeric age to string bucket
     |
     v
preprocess_input()
  |- Label-encode categoricals
  |- TF-IDF vectorize symptoms (807 features)
  |- Concatenate structured + TF-IDF (819 total)
  |- StandardScaler.transform()
     |
     v
LogisticRegression.predict()      -> disease label
LogisticRegression.predict_proba() -> probabilities
     |
     v
confidence = max(probabilities) * 100
     |
     +-- < 35% --> "Inconclusive Data" response (no XAI, no LLM)
     |
     +-- >= 35% --> explain_prediction() [XAI]
                 -> get_llm_validation_and_explanation() [Gemini]
                 -> PredictResponse
`

### 3.4 Database (Cloud Firestore)

Collections:

| Collection | Contents |
|---|---|
| users/{uid} | Profile: role, clinicId, status, displayName, email |
| clinics/{clinicId} | Clinic name, address, created timestamp |
| patients/{patientId} | Demographics, clinicId, patient code |
| patients/{patientId}/assessments/{id} | Diagnosis session: symptoms, prediction, recommendation, XAI |
| audit_log/{id} | Admin actions (account creation, approval, rejection) |

Security: rules enforce role-based read/write. A doctor may only read patients in their own clinic. A patient may only read their own record. An admin manages accounts but cannot read clinical records.

### 3.5 Authentication Flow

`
User enters credentials
        |
        v
Firebase Auth (email/password or Google)
        |
        v
Firebase returns ID token (JWT, RS256)
        |
        v
Frontend includes token in Authorization: Bearer <token>
        |
        v
Backend security.py fetches Google public certs
verifies: signature + aud + iss + exp + iat + sub
        |
        v
Claims (uid, email) passed to handler
        |
        v
Firestore rules re-verify role server-side
`

---

## 4. Data Flow — Diagnosis Workflow

1. Doctor opens DiagnosePage, selects/creates patient
2. Doctor fills multi-step form (symptoms, demographics, dosha, lifestyle)
3. On Submit: frontend calls POST /api/predict with Firebase ID token
4. Backend verifies token, runs ML pipeline, calls Gemini
5. Response: prediction, confidence, recommendation (Gemini text), XAI breakdown
6. Doctor reviews result, clicks Save
7. Frontend writes Assessment document to Firestore under patients/{id}/assessments/{id}
8. Patient can log in to PatientHomePage and see their assessment history

---

## 5. External Services

| Service | Purpose | Required? |
|---|---|---|
| Firebase Authentication | User identity | YES |
| Cloud Firestore | All clinical and user data | YES |
| Google Gemini (google-genai) | Ayurvedic narrative explanation | Optional (fallback shown) |
| Vercel | Frontend hosting | Optional (local dev works) |
| Render | Backend hosting | Optional (local dev works) |

---

## 6. Security Boundaries

- Backend never holds a Firebase service-account private key. ID tokens are verified against Google's public certificates only.
- Gemini API key is backend-only (no VITE_ prefix); it never reaches the browser bundle.
- Firebase API key in firebase.ts is a browser-safe configuration token (not a secret); it cannot be used to bypass Firestore rules.
- Firestore rules enforce tenant isolation: every clinical read/write requires the caller's role and clinicId to match the record's clinicId.
- Rate limiting caps prediction requests per caller per minute.
- CORS allowlist is explicit; wildcard is deliberately not used.
