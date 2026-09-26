# ArogyaAI — Third Review Preparation

> Every statement below is based on the final codebase, verified by running the
> backend and inspecting the source. Anything not verified is marked
> **NOT CONFIRMED**.

---

## 1. Project Objective

An AI-powered Ayurvedic clinical decision-support and patient-management
system. It (a) predicts a likely condition from symptoms + patient profile
using a trained Random Forest model, and (b) generates a personalised Ayurvedic
explanation and care plan using Google Gemini.

## 2. Architecture (only components that actually exist)

```
React (Vite, TypeScript)
   │  Firebase Authentication (email/password, Google)
   │  Firestore (users, patients, patient_logs)
   │
   └─ fetch POST /api/predict ─► FastAPI (backend/index.py)
                                     │
                                     ├─ preprocess (encode + TF-IDF + scale)
                                     ├─ Random Forest  → disease + confidence
                                     └─ if confidence ≥ 35% → Gemini → text
```

There is **no OCR** and **no file/PDF upload** component. The only PDF feature
is a browser `window.print()` button labelled "Export PDF".

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS 3, Framer Motion, lucide-react |
| Backend | Python, FastAPI, Uvicorn, Pydantic v2 |
| Database | Firebase Firestore (NoSQL document store) |
| Auth | Firebase Authentication |
| ML | scikit-learn Random Forest, joblib-persisted pipeline |
| GenAI | Google Gemini (via `google-generativeai` SDK on the backend) |
| ML dataset | `enhanced_ayurvedic_treatment_dataset.csv` — 4201 rows, 399 diseases |

## 4. Database

Provider: **Firebase Firestore** in project `arogyaai-cloud` (verified live via
the Identity Toolkit API — returns HTTP 200 with `localhost` and
`arogyaai-cloud.firebaseapp.com` as authorised domains).

## 5. Collections and Fields

| Collection | Written from | Fields |
|---|---|---|
| `users` | registration | `email`, `role` (`doctor`/`patient`), `clinicId` |
| `patients` | Diagnose → Save Record | `name`, `age`, `gender`, `dosha`, `symptoms`, `diagnosis`, `confidence`, `clinicId`, `createdAt` |
| `patient_logs` | Patient symptom logger | `userId`, `email`, `symptoms`, `clinicId`, `createdAt` |

The Gemini recommendation text is **displayed only and not stored**.

## 6. API Endpoints

| Method | Endpoint | Purpose | Input | Output |
|---|---|---|---|---|
| GET | `/` | Root info | — | welcome JSON |
| GET | `/api/health` | Health + metadata | — | status, model, `supported_diseases`: 399 |
| POST | `/api/predict` | ML + Gemini | symptom/profile JSON | `prediction`, `confidence`, `recommendation` |

## 7. Authentication Flow

Register → `createUserWithEmailAndPassword` → `setDoc(users/{uid})` with
`role` + `clinicId` → `onAuthStateChanged` loads profile → role-based routes.
Google sign-in uses `signInWithPopup`. Logout uses `signOut(auth)`.
Passwords are hashed by Firebase; the app never stores them.

## 8. ML Flow

Input JSON → `derive_age_group` → fallback normalisation of categoricals →
`preprocess_input` (label-encode 8 categoricals, TF-IDF the `Symptoms` string,
compute BMI, scale) → `model.predict` + `predict_proba` → decode via
`encoders['Disease']` → confidence = max probability × 100.

## 9. GenAI Flow

Backend builds a templated Ayurvedic prompt from the profile + ML prediction,
calls Gemini, returns the text as `recommendation`. Model fallback chain:
`gemini-flash-latest` → `gemini-flash-lite-latest` → `gemini-2.5-flash`.
On total failure it returns a safe "unavailable" message (no crash).

## 10. Data-Storage Flow

Save Record → `addDoc(collection(db,"patients"))` with `clinicId` from the
logged-in user's profile → records page queries `where("clinicId","==", ...)`.
A safety guardrail writes `"General Imbalance (Review Required)"` instead of a
disease name when confidence < 35.

## 11. 5-Minute Live Demo

1. **Auth screen** — "This is Firebase Auth; email/password and Google."
2. **Log in as doctor** — dashboard loads.
3. **Dashboard** — "Diagnostics Run, Average ML Confidence and Dominant Dosha
   are read live from Firestore for my clinic ID — not hardcoded."
4. **Diagnose** — enter patient + symptoms. Use `diarrhea, stomach cramps,
   loose motion` (≈68%) so the AI plan actually fires.
5. **Analyze** — shows disease, confidence %, and the Ayurvedic plan.
6. **Save Record** — "Written to Firestore scoped to my clinicId."
7. **Patient Records** — the record appears.
8. *(Optional)* log in as a patient and submit a symptom diary → appears in the
   Diaries tab.

**Demo tip:** free-text symptoms often score below the 35% gate and show
"Inconclusive Data". That is a real safety feature — present it as such, but
for the *positive* path use the symptom vocabulary above.

## 12–19. Viva Questions

*(Condensed — see the earlier audit report in this session for the full set.)*

Key answers:
- **Why Random Forest?** Handles mixed tabular + text features and gives
  calibrated probabilities for the confidence score.
- **What is TF-IDF?** Converts symptom text to weighted numeric vectors.
- **Why a 35% threshold?** Safety — below it the prediction is unreliable, so
  no treatment plan is generated.
- **Why Firestore?** Serverless, real-time, integrates with Firebase Auth.
- **Is the API authenticated?** No — `/api/predict` is public. Known limitation.
- **Does OCR exist?** No. Do not claim it.
- **How many diseases?** 399.

## 20. Testing Performed

| Test | Result |
|---|---|
| `GET /api/health` | ✅ 200, 399 diseases |
| `GET /` | ✅ 200 |
| `POST /api/predict` high confidence | ✅ 68%, real Gemini text, ~4 s |
| `POST /api/predict` low confidence | ✅ "Inconclusive Data", no AI plan |
| Invalid age (0) | ✅ 422 validation error |
| Gemini model fallback | ✅ works (`gemini-2.5-flash` retired → alias used) |
| Frontend `tsc -b` | ✅ exit 0 |
| Frontend `npm run build` | ✅ built successfully |
| Existing unit suite `tests/test_backend_api.py` | ⚠️ could not run — needs `httpx2`, not installed |

## 21. Known Limitations

1. `/api/predict` is unauthenticated.
2. Firestore security rules are not version-controlled in the repo; they live
   in the Firebase console and could not be inspected.
3. The AI recommendation text is not persisted.
4. Free-text symptoms frequently fall below the 35% gate.
5. No OCR / medical-report upload.
6. The backend test suite needs an extra dependency (`httpx2`) to run.

## 22. Future Improvements

Persist AI plans; authenticate the API with Firebase ID tokens; add report
upload + OCR; expand training data; add per-clinic Firestore rules in version
control.
