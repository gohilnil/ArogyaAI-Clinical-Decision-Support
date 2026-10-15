# ArogyaAI — Test Cases Document

## Test Strategy

### Approach
- Backend: automated pytest suite (83 tests, all pass)
- Frontend: manual verification and TypeScript build
- Integration: real HTTP through FastAPI TestClient; real ML model loaded
- Authentication: real dependency, mocked only for ML-focused tests; genuine enforcement in separate suite

### Test Environments
- Backend: Python 3.14, venv, pytest, FastAPI TestClient
- Frontend: Node.js, TypeScript, Vite build (2204 modules, 0 errors)
- External dependencies (Firebase live, Gemini): BLOCKED by external service — mocked in unit tests

### Test Data
- Synthetic patient: age 28, Male, Pitta, Vegetarian, 175cm/70kg
- Symptoms: "fever, headache, chills, joint pain" (standard) and "continuous sneezing, cough, fever, headache, joint pain" (integration tests)
- Invalid inputs: empty symptoms, age 0, age 150, height 30, weight 5
- Unknown categoricals: Gender "NonBinary", Dosha "UnknownDosha", Season "Nonexistent"

---

## Section 1: API Endpoint Tests

### TC-API-001: Root Endpoint
- **ID:** TC-API-001
- **Scenario:** GET / returns welcome message and links
- **Expected:** HTTP 200, body contains "message" and "health" keys
- **Actual:** PASS (Test 1)
- **Status:** PASS

### TC-API-002: Health Check
- **ID:** TC-API-002
- **Scenario:** GET /api/health returns model metadata
- **Expected:** HTTP 200, status="healthy", model="Logistic Regression", supported_diseases=399
- **Actual:** PASS (Test 2)
- **Status:** PASS

### TC-API-003: Predict — No Token
- **ID:** TC-API-003
- **Scenario:** POST /api/predict without Authorization header
- **Expected:** HTTP 401, detail.error.code="MISSING_TOKEN"
- **Actual:** PASS (Auth suite)
- **Status:** PASS

### TC-API-004: Predict — Malformed Token
- **ID:** TC-API-004
- **Scenario:** POST /api/predict with "Bearer not.a.token"
- **Expected:** HTTP 401, detail.error.code="INVALID_TOKEN"
- **Actual:** PASS (Auth suite)
- **Status:** PASS

### TC-API-005: Predict — Wrong Auth Scheme
- **ID:** TC-API-005
- **Scenario:** POST /api/predict with "Basic dXNlcjpwYXNz"
- **Expected:** HTTP 401, detail.error.code="MISSING_TOKEN"
- **Actual:** PASS (Auth suite)
- **Status:** PASS

### TC-API-006: No Internal Leak in 401
- **ID:** TC-API-006
- **Scenario:** 401 response body must not contain traceback, private key material
- **Expected:** Body does not contain "traceback", "private", "-----begin", "file \""
- **Actual:** PASS (Auth suite)
- **Status:** PASS

### TC-API-007: Valid Token Reaches ML Pipeline
- **ID:** TC-API-007
- **Scenario:** POST /api/predict with mocked valid token
- **Expected:** HTTP 200, prediction present, verify_id_token called once
- **Actual:** PASS (Auth suite)
- **Status:** PASS

---

## Section 2: Input Validation Tests

### TC-VAL-001: Empty Symptoms
- **ID:** TC-VAL-001
- **Scenario:** POST /api/predict with Symptoms="   "
- **Expected:** HTTP 422 Unprocessable Entity
- **Actual:** PASS (Test 4a)
- **Status:** PASS

### TC-VAL-002: Age Too Low
- **ID:** TC-VAL-002
- **Scenario:** Age=0
- **Expected:** HTTP 422
- **Actual:** PASS (Test 4b)
- **Status:** PASS

### TC-VAL-003: Age Too High
- **ID:** TC-VAL-003
- **Scenario:** Age=150
- **Expected:** HTTP 422
- **Actual:** PASS (Test 4b)
- **Status:** PASS

### TC-VAL-004: Height Too Low
- **ID:** TC-VAL-004
- **Scenario:** Height_cm=30 (below 50 cm minimum)
- **Expected:** HTTP 422
- **Actual:** PASS (Test 4c)
- **Status:** PASS

### TC-VAL-005: Weight Too Low
- **ID:** TC-VAL-005
- **Scenario:** Weight_kg=5 (below 10 kg minimum)
- **Expected:** HTTP 422
- **Actual:** PASS (Test 4c)
- **Status:** PASS

---

## Section 3: ML Pipeline Tests

### TC-ML-001: Age Group Derivation — Child
- **ID:** TC-ML-001
- **Scenario:** derive_age_group(8) and derive_age_group(12)
- **Expected:** "Child"
- **Actual:** PASS (Test 3)
- **Status:** PASS

### TC-ML-002: Age Group — Adolescent
- **ID:** TC-ML-002
- **Scenario:** derive_age_group(13), derive_age_group(19)
- **Expected:** "Adolescent"
- **Actual:** PASS
- **Status:** PASS

### TC-ML-003: Age Group — Young Adult
- **ID:** TC-ML-003
- **Scenario:** derive_age_group(20), derive_age_group(35)
- **Expected:** "Young Adult"
- **Actual:** PASS
- **Status:** PASS

### TC-ML-004: Age Group — Middle Age
- **ID:** TC-ML-004
- **Scenario:** derive_age_group(36), derive_age_group(55)
- **Expected:** "Middle Age"
- **Actual:** PASS
- **Status:** PASS

### TC-ML-005: Age Group — Senior and Elderly
- **ID:** TC-ML-005
- **Scenario:** derive_age_group(56) = "Senior", derive_age_group(75) = "Elderly"
- **Expected:** As stated
- **Actual:** PASS
- **Status:** PASS

### TC-ML-006: Preprocessing Shape
- **ID:** TC-ML-006
- **Scenario:** preprocess_input() returns a 2D numpy array with shape (1, N)
- **Expected:** ndarray, ndim=2, shape[0]=1
- **Actual:** PASS (Test 6)
- **Status:** PASS

### TC-ML-007: Model Inference
- **ID:** TC-ML-007
- **Scenario:** model.predict() returns a known disease class; confidence in [0, 100]
- **Expected:** Non-empty string disease name, confidence between 0 and 100
- **Actual:** PASS (Test 7)
- **Status:** PASS

### TC-ML-008: Low Confidence Gate
- **ID:** TC-ML-008
- **Scenario:** Mock probabilities < 35% → response prediction = "Inconclusive Data"
- **Expected:** prediction="Inconclusive Data", recommendation contains "safety threshold"
- **Actual:** PASS (Test 8)
- **Status:** PASS

### TC-ML-009: Categorical Fallback
- **ID:** TC-ML-009
- **Scenario:** Gender="NonBinary", Dosha="UnknownDosha", Food_Habits="JunkFoodObsessed"
- **Expected:** HTTP 200, valid prediction (normalised to nearest valid class)
- **Actual:** PASS (Test 5)
- **Status:** PASS

---

## Section 4: Real Pipeline Integration Tests

### TC-INT-001: Real Model Returns Known Class with Explanation
- **ID:** TC-INT-001
- **Scenario:** Real model, no mocks except LLM; confidence >= 35%
- **Expected:** prediction in Disease encoder classes, explanation not null
- **Actual:** PASS
- **Status:** PASS

### TC-INT-002: XAI Class Matches Prediction
- **ID:** TC-INT-002
- **Scenario:** explanation.predicted_class == prediction
- **Expected:** Strings match
- **Actual:** PASS
- **Status:** PASS

### TC-INT-003: XAI Logit Identity
- **ID:** TC-INT-003
- **Scenario:** intercept + total_contribution == model's computed logit (to 6 decimal places)
- **Expected:** Floating-point equality within tolerance
- **Actual:** PASS
- **Status:** PASS

### TC-INT-004: XAI Features Ranked by Magnitude
- **ID:** TC-INT-004
- **Scenario:** |contributions| are in descending order
- **Expected:** Each contribution >= next
- **Actual:** PASS
- **Status:** PASS

### TC-INT-005: Deterministic Output
- **ID:** TC-INT-005
- **Scenario:** Identical requests → identical prediction, confidence, explanation
- **Expected:** All fields equal
- **Actual:** PASS
- **Status:** PASS

### TC-INT-006: Low Confidence Withholds Explanation
- **ID:** TC-INT-006
- **Scenario:** Mocked low probabilities → Inconclusive Data; explanation must be absent
- **Expected:** explanation field null/absent in response
- **Actual:** PASS
- **Status:** PASS

---

## Section 5: AI Integration Tests

### TC-AI-001: Gemini Fallback on Failure
- **ID:** TC-AI-001
- **Scenario:** get_llm_validation_and_explanation returns a fallback string when mocked to raise
- **Expected:** HTTP 200, recommendation contains safe fallback text (or Clinical Assessment)
- **Actual:** PASS (Test 9)
- **Status:** PASS

### TC-AI-002: End-to-End with Mocked Gemini
- **ID:** TC-AI-002
- **Scenario:** Full predict cycle; LLM mocked to return specific text
- **Expected:** HTTP 200, prediction/confidence/recommendation all present
- **Actual:** PASS (Test 10)
- **Status:** PASS

### TC-AI-003: Live Gemini Integration
- **ID:** TC-AI-003
- **Scenario:** Real Gemini call with valid API key
- **Expected:** Non-empty recommendation text
- **Actual:** BLOCKED (API key required; not provided in CI)
- **Status:** BLOCKED

---

## Section 6: CORS Tests

### TC-CORS-001: Deployed Origin Allowed
- **ID:** TC-CORS-001
- **Scenario:** OPTIONS preflight from https://arogya-ai-clinical-decision-support-nine.vercel.app
- **Expected:** HTTP 200, access-control-allow-origin matches origin
- **Actual:** PASS
- **Status:** PASS

### TC-CORS-002: Unknown Origin Refused
- **ID:** TC-CORS-002
- **Scenario:** OPTIONS from https://attacker.example.com
- **Expected:** No access-control-allow-origin header
- **Actual:** PASS
- **Status:** PASS

### TC-CORS-003: Legacy Domain Not Allowed
- **ID:** TC-CORS-003
- **Scenario:** https://arogyaai.vercel.app must not be in CORS_ORIGINS
- **Expected:** Not in list
- **Actual:** PASS
- **Status:** PASS

---

## Section 7: Security Tests

### TC-SEC-001: No Secrets in 401 Response
- **ID:** TC-SEC-001
- **Scenario:** Unauthenticated request; body must not leak internal details
- **Expected:** No traceback, no private key material
- **Actual:** PASS
- **Status:** PASS

### TC-SEC-002: Firebase ID-Token Verification
- **ID:** TC-SEC-002
- **Scenario:** Valid RS256 token (verified against mocked public certs) → claims returned
- **Expected:** Claims dict with uid and email
- **Actual:** PASS (test_security.py)
- **Status:** PASS

### TC-SEC-003: Expired Token Rejected
- **ID:** TC-SEC-003
- **Scenario:** Token with past exp → ValueError raised
- **Expected:** ValueError("Token has expired")
- **Actual:** PASS (test_security.py)
- **Status:** PASS

### TC-SEC-004: Wrong Audience Rejected
- **ID:** TC-SEC-004
- **Scenario:** Token with aud = "wrong-project" → ValueError
- **Expected:** ValueError
- **Actual:** PASS (test_security.py)
- **Status:** PASS

---

## Section 8: Firestore Configuration Test

### TC-DB-001: Both Index Scopes Declared
- **ID:** TC-DB-001
- **Scenario:** firestore.indexes.json must declare COLLECTION and COLLECTION_GROUP for assessments.clinicId
- **Expected:** Both scopes present
- **Actual:** PASS
- **Status:** PASS

---

## Section 9: Authentication Flow Tests (Proposed — Manual Verification Required)

| TC-ID | Scenario | Expected | Status |
|---|---|---|---|
| TC-AUTH-001 | Email/password login with valid credentials | Redirect to dashboard | NOT TESTED (requires live Firebase) |
| TC-AUTH-002 | Email/password login with wrong password | Error message displayed | NOT TESTED |
| TC-AUTH-003 | Doctor with pending status sees PendingApprovalPage | Correct page rendered | NOT TESTED |
| TC-AUTH-004 | Admin user accesses admin panel | Admin layout shown | NOT TESTED |
| TC-AUTH-005 | Patient user sees PatientHomePage | Patient portal shown | NOT TESTED |
| TC-AUTH-006 | Logout clears session | Redirected to LoginPage | NOT TESTED |

---

## Test Summary

| Category | Total | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---|---|---|---|---|
| API Endpoints | 7 | 7 | 0 | 0 | 0 |
| Input Validation | 5 | 5 | 0 | 0 | 0 |
| ML Pipeline | 9 | 9 | 0 | 0 | 0 |
| Real Pipeline Integration | 6 | 6 | 0 | 0 | 0 |
| AI Integration | 3 | 2 | 0 | 1 | 0 |
| CORS | 3 | 3 | 0 | 0 | 0 |
| Security | 4 | 4 | 0 | 0 | 0 |
| Firestore Config | 1 | 1 | 0 | 0 | 0 |
| Auth Flow (manual) | 6 | 0 | 0 | 0 | 6 |
| **TOTAL** | **44** | **37** | **0** | **1** | **6** |

Automated backend suite: 83 tests PASS in 15.60s
Frontend build: PASS (2204 modules, 0 TypeScript errors)
