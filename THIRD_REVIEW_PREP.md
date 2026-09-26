# ArogyaAI — Review Preparation

> Every statement below is checked against the final codebase. Anything not
> verified is marked **NOT VERIFIED**. For the demo script and mentor Q&A, see
> [`DEMO_GUIDE.md`](DEMO_GUIDE.md).

---

## 1. Project objective

An Ayurvedic **clinical decision-support** and patient-management system. It
(a) predicts a likely condition from a patient's symptoms and profile using a
trained **Logistic Regression** model, and (b) generates a personalised
Ayurvedic explanation for that prediction using Google Gemini. It is not a
diagnostic device and has not been clinically evaluated.

## 2. Architecture (only components that actually exist)

```
React (Vite, TypeScript)
   │  Firebase Authentication (email/password, Google)
   │  Firestore (users, patients, patients/{id}/assessments, patient_logs, invites)
   │
   └─ POST /api/predict (Firebase ID token) ─► FastAPI (backend.main)
                                                   │
                                                   ├─ preprocess (encode + TF-IDF + scale)
                                                   ├─ Logistic Regression → label + confidence
                                                   └─ if confidence ≥ 35% → Gemini → narrative
```

There is **no OCR** and **no file/PDF upload** component. The only PDF feature is
a browser `window.print()` button labelled "Export PDF". There is **no**
rule-based knowledge base or offline recommendation database.

## 3. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS 3, Framer Motion, lucide-react |
| Backend | Python ≥ 3.11, FastAPI, Uvicorn, Pydantic v2 |
| Database | Firebase Firestore (NoSQL document store) |
| Auth | Firebase Authentication |
| ML | scikit-learn **Logistic Regression**, joblib-persisted artifact |
| GenAI | Google Gemini (via `google-generativeai` on the backend) |
| ML dataset | `enhanced_ayurvedic_treatment_dataset.csv` — 4,201 rows, 399 labels |

## 4. Database

Provider: **Firebase Firestore**, project **`arogyaai-cloud-ad667`** (pinned in
`.firebaserc`, `firebase.json`, `render.yaml` and `backend/core/config.py`).

## 5. Collections and fields

| Collection | Written from | Fields |
|---|---|---|
| `users` | registration | `email`, `role` (`doctor`/`patient`), `clinicId` |
| `patients` | Diagnose → Save Record | `name`, `age`, `gender`, `dosha`, `symptoms`, `diagnosis`, `confidence`, `clinicId`, `createdAt` |
| `patients/{id}/assessments` | Save Record | one document per visit (append-only) |
| `patient_logs` | Patient symptom logger | `userId`, `email`, `symptoms`, `clinicId`, `createdAt` |
| `invites` | created out-of-band only | `used`, `clinicId` |

The Gemini narrative is **displayed only and not stored**.

## 6. API endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/` | public | Service banner |
| `GET` | `/api/health` | public | Status, loaded model name, class count (399) |
| `POST` | `/api/predict` | **Firebase ID token** | Prediction + explanation + Ayurvedic narrative |

`POST /api/predict` is **authenticated** (returns 401 without a valid token) and
**rate-limited per caller** (default 30/min, 429 with `Retry-After`).

## 7. Authentication flow

Register → `createUserWithEmailAndPassword` → `setDoc(users/{uid})` with a role
and clinic ID → `onAuthStateChanged` loads the profile → role-based routes.
Practitioner registration additionally consumes an `invites/{code}` document.
Google sign-in uses `signInWithPopup`. Logout uses `signOut(auth)`. Passwords are
hashed by Firebase; the application never stores them.

## 8. ML flow

Input JSON → `derive_age_group` → normalise unseen categoricals onto a known
class → `preprocess_input` (label-encode categoricals, TF-IDF the symptom string,
compute BMI, scale) → `model.predict` + `predict_proba` → decode through
`encoders['Disease']` → confidence = `max(probability) × 100`.

**Measured performance** (untouched 841-row test split, leak-free pipeline):
accuracy 0.8859, macro-F1 0.8372. The older 99–100% figures are withdrawn as
leakage-affected. See `MODEL_CARD.md`.

## 9. GenAI flow

The backend builds a templated Ayurvedic prompt from the profile and the ML
prediction, calls Gemini, and returns the text as the narrative. Model fallback
chain: `gemini-flash-latest` → `gemini-flash-lite-latest` → `gemini-2.5-flash`.
On total failure it returns a safe "unavailable" message and does not crash.

## 10. Data-storage flow

Save Record → `addDoc(collection(db, "patients"))` with the `clinicId` from the
logged-in user's profile; the records page queries
`where("clinicId", "==", …)`. A guardrail writes
`"General Imbalance (Review Required)"` instead of a disease name when
confidence < 35.

## 11. Security model (verified)

Enforced in `firestore.rules`, exercised by the 61-test emulator suite:

- A patient can read and write **only their own** record and logs.
- A practitioner can reach **only their own clinic's** data.
- Assessments and log entries are **append-only** — no client update or delete.
- Invites are `get`-only by code and **cannot be enumerated** or created from a client.
- A collection with no rule is **denied by default**.
- The API requires a valid Firebase ID token and is rate-limited.

## 12. Known limitations (state these honestly)

1. The dataset has no clinical provenance; label synonyms cap achievable accuracy.
2. Confidence is uncalibrated (`max(predict_proba)`, no Platt/isotonic step).
3. The 35% gate is a safety heuristic, not a statistical cut-off.
4. The rate limiter is per-process — horizontal scaling multiplies the limit.
5. The Ayurvedic narrative is LLM-generated and is not persisted.
6. No OCR, no report upload.
7. No live deployment has been verified from this environment (no Render/Vercel/
   Firebase credentials were available). See `DEPLOYMENT.md`.

## 13. Live demo

See [`DEMO_GUIDE.md`](DEMO_GUIDE.md) §4 for the step-by-step script, the sample
case that clears the confidence gate, and the mentor Q&A.
