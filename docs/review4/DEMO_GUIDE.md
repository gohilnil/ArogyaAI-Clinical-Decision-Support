# ArogyaAI — Demo Guide

## Prerequisites

- Windows 10 or 11
- Python 3.11+ (3.14 recommended, as used for training)
- Node.js 18+ and npm
- Git
- A Firebase account with project `arogyaai-cloud-ad667` accessible
- A Gemini API key (from Google AI Studio: https://aistudio.google.com/apikey)
- An approved doctor account in the Firebase project (email + password)

---

## Setup Instructions (First Time)

### 1. Activate Python virtual environment

`powershell
cd "d:\arogyaai final"
venv\Scripts\activate
`

### 2. Verify Python dependencies

`powershell
pip install -r requirements.txt --quiet
`

### 3. Create .env file

`powershell
Copy-Item .env.example .env
`

Open .env and set your real values:

`
GEMINI_API_KEY=your_actual_gemini_api_key
FIREBASE_PROJECT_ID=arogyaai-cloud-ad667
AROGYA_AUTH_REQUIRED=true
`

Do NOT commit .env to Git.

### 4. Deploy Firestore rules and indexes (if not already deployed)

`powershell
firebase deploy --only firestore:rules,firestore:indexes
`

### 5. Install frontend dependencies (already done if node_modules exists)

`powershell
cd frontend
npm install
cd ..
`

---

## Starting the Application

### Terminal 1 — Backend

`powershell
cd "d:\arogyaai final"
venv\Scripts\activate
uvicorn backend.index:app --host 127.0.0.1 --port 8000 --reload
`

Expected output:
`
[OK] ML Model loaded successfully.
INFO: Uvicorn running on http://127.0.0.1:8000
`

### Terminal 2 — Frontend

`powershell
cd "d:\arogyaai final\frontend"
npm run dev
`

Expected output:
`
VITE v8.x  ready in xxx ms
Local:   http://localhost:5173/
`

---

## URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000 |
| API docs (Swagger) | http://127.0.0.1:8000/docs |
| Health check | http://127.0.0.1:8000/api/health |

---

## Recommended 5–7 Minute Demo Sequence

### Step 1 — Health check (30 seconds)
1. Open browser to http://127.0.0.1:8000/api/health
2. Show JSON response: status "healthy", model "Logistic Regression", supported_diseases 399
3. Explain: backend is live, ML model loaded

### Step 2 — Login (30 seconds)
1. Navigate to http://localhost:5173
2. Log in with the pre-prepared approved doctor account
3. Show the loading screen resolves to the dashboard

### Step 3 — Dashboard (45 seconds)
1. Point out patient count, assessment count, recent activity
2. Explain: all figures are live from Firestore, no hardcoding

### Step 4 — Create a diagnosis (2 minutes)
1. Click "Diagnose" in the navigation
2. Step 1 — Patient info: enter name (e.g. "Demo Patient"), age 28, gender Male, height 175, weight 70
3. Select "Create new patient" or pick an existing patient from the dropdown
4. Step 2 — Symptoms: enter "continuous sneezing, cough, fever, headache, joint pain"
5. Step 3 — Dosha: choose Pitta (or use the quiz)
6. Step 4 — Lifestyle: leave defaults (Summer, Vegetarian, Moderate)
7. Click "Analyse"
8. Show the prediction result: disease name, confidence %, Ayurvedic recommendation from Gemini
9. Expand the Explanation panel: show XAI feature contributions
10. Click "Save to Patient Record"

### Step 5 — Patient history (45 seconds)
1. Navigate to Patients page
2. Open the patient just created
3. Show their assessment history with the saved diagnosis

### Step 6 — Authentication security (30 seconds)
1. Open terminal or browser dev tools
2. Show: curl http://127.0.0.1:8000/api/predict -X POST -H "Content-Type: application/json" -d "{}" → 401 MISSING_TOKEN
3. Explain: the API never accepts unauthenticated prediction requests

### Step 7 — API documentation (15 seconds)
1. Open http://127.0.0.1:8000/docs
2. Show the Swagger UI with the three endpoints
3. Point out the request schema and disclaimer

---

## Expected Results

| Step | Expected Outcome |
|---|---|
| Health check | {"status":"healthy","model":"Logistic Regression","supported_diseases":399,...} |
| Login | Redirected to dashboard |
| Dashboard | Real clinic statistics displayed |
| Prediction | Disease name, confidence, Gemini text, XAI features |
| Save | Success notification, patient record updated |
| Patient history | Assessment listed under patient |
| Unauthenticated API call | HTTP 401 {"error":{"code":"MISSING_TOKEN",...}} |

---

## Common Failure Scenarios and Fallbacks

### Gemini is unavailable or API key missing
- Prediction still works; recommendation field shows: "AI Ayurvedic explanation is temporarily unavailable. The model prediction shown above is unaffected."
- Do not present this as a failure — narrate it as the designed safe fallback.

### Firebase emulator not running (if using emulators)
- Switch to live Firebase: remove VITE_USE_FIREBASE_EMULATORS=true from frontend/.env.local and restart frontend.

### Low confidence prediction (<35%)
- The response shows "Inconclusive Data" with an explanation: "symptoms may be too broad."
- Demo this as a safety feature: "The system refuses to name a condition when it is not confident enough."

### Backend not starting (model file missing)
- Run `python train_model.py` from project root to regenerate arogyaai_model.joblib.

---

## Stopping the Application

- Backend: Ctrl+C in the backend terminal
- Frontend: Ctrl+C in the frontend terminal
