# ArogyaAI — Presentation Outline (Review 4)

## Slide 1: Title

**ArogyaAI**
Ayurvedic Clinical Decision Support System

Student: [Your Name] | Enrollment: [Number]
Department: MCA | University: [University Name]
Academic Year: 2025–2026 | Guide: [Guide Name]

---

## Slide 2: Problem Statement

### The Gap in Ayurvedic Practice

- Over 500 million people use traditional/Ayurvedic medicine globally
- Practitioners lack structured, data-driven tools for decision support
- Manual diagnosis is experience-dependent with no standardised aid
- No personalised AI-assisted recommendations aligned with dosha constitution
- Academic gap: no open ML system for Ayurvedic clinical support

**Key Question:** Can machine learning and generative AI provide meaningful decision support to Ayurvedic practitioners?

---

## Slide 3: Objectives

1. Build an ML model to classify diseases from symptoms and patient profile
2. Integrate Generative AI (Gemini) for personalised Ayurvedic recommendations
3. Provide transparent, explainable AI output (XAI) so practitioners understand predictions
4. Implement a multi-clinic, role-based web application for real-world usability
5. Enforce security through Firebase authentication and server-side authorisation

---

## Slide 4: Proposed Solution

### ArogyaAI Architecture

`
Doctor → React Web App → Firebase Auth → FastAPI Backend
                    ↘                          ↓
               Firestore (clinical data)   ML Model (Logistic Regression)
                                           Gemini LLM (Ayurvedic narrative)
                                           XAI (logit-contribution breakdown)
`

Key design principles:
- No hardcoded results — every metric is from real data
- Safe fallbacks — prediction works even if Gemini is unavailable
- Honest AI — low-confidence predictions return "Inconclusive Data"

---

## Slide 5: System Architecture

### Three-Layer Architecture

**Frontend (React 19 + Vite + TypeScript)**
- Role-based routing: Doctor / Patient / Admin
- Firebase Auth + Firestore SDK
- Framer Motion animations, Tailwind CSS

**Backend (FastAPI + Python 3.14)**
- Stateless REST API
- Firebase ID-token verification (RS256, no service-account key)
- Rate limiting, structured logging, CORS allowlist

**Data + AI**
- Cloud Firestore: multi-clinic, tenant-isolated
- Logistic Regression model (819 features, 399 disease classes)
- Google Gemini (google-genai SDK) with safe fallback

---

## Slide 6: Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | 19 |
| Build Tool | Vite | 8 |
| Language | TypeScript | 6 |
| Styling | Tailwind CSS | 3.4 |
| Backend Framework | FastAPI | >=0.100 |
| Backend Language | Python | 3.14 |
| ML Library | scikit-learn | 1.9 |
| Database | Cloud Firestore | Firebase |
| Auth | Firebase Authentication | Firebase |
| LLM | Google Gemini | google-genai 1.0+ |
| Deployment | Vercel (frontend) + Render (backend) | |

---

## Slide 7: Main Modules

1. **Authentication Module** — Firebase email/password, Google Sign-in, role-based routing
2. **Diagnosis Module** — Multi-step form, ML prediction, XAI breakdown, Gemini recommendation
3. **Patient Management** — Create, list, update patients; clinic-scoped data
4. **Assessment History** — Longitudinal record of all diagnoses per patient
5. **Admin Panel** — Account management, doctor approval, clinic management, audit log
6. **Patient Portal** — Patients view their own history via a unique patient code
7. **Dashboard** — Live clinic statistics: patient count, assessment count, trend chart

---

## Slide 8: ML and AI Workflow

### ML Pipeline

`
Input: Symptoms (text) + Demographics + Lifestyle
    ↓
Age Group derivation + Categorical normalisation
    ↓
Label encoding (8 categories) + TF-IDF vectorization (807 dims)
    ↓
StandardScaler transform (819 total features)
    ↓
Logistic Regression.predict() → disease label
    predict_proba() → confidence %
    ↓
Confidence < 35%? → "Inconclusive Data" (no XAI, no LLM)
    ↓
explain_prediction(): coef × feature = per-feature contributions
    ↓
Gemini: personalised Ayurvedic recommendation
`

### Model Selection
- Cross-validated: Logistic Regression (F1 macro 83.6%) > Random Forest (76.8%)
- Test set performance: 88.6% accuracy, 83.7% macro F1 on 841 samples / 399 classes

---

## Slide 9: Database, Authentication, and Security

### Firestore Data Model
| Collection | Contents |
|---|---|
| users | Role, clinicId, status |
| clinics | Name, address |
| patients | Demographics, clinicId, patient code |
| patients/.../assessments | Diagnosis records |
| audit_log | Admin actions |

### Security Measures
- RS256 JWT verification — no private key on server
- Firestore server-side rules: role + clinicId required for every clinical read/write
- CORS explicit allowlist (no wildcard)
- Rate limiting: 30 requests/minute per user
- Secrets never committed (.env, .gitignore enforced)

---

## Slide 10: Testing and Verified Results

### Test Suite: 83 tests — ALL PASS

| Category | Tests | Result |
|---|---|---|
| API endpoints | 7 | PASS |
| Input validation | 5 | PASS |
| ML pipeline | 9 | PASS |
| Real pipeline integration | 8 | PASS |
| Authentication | 6 | PASS |
| CORS | 4 | PASS |
| Security | 4 | PASS |
| Firestore config | 1 | PASS |

Frontend build: TypeScript + Vite → 2204 modules compiled, 0 errors

Key verified property: XAI logit identity test — mathematical proof the explanation matches the model's arithmetic.

---

## Slide 11: Live Demonstration, Limitations, and Future Scope

### Demo Flow (7 minutes)
1. Health check → backend running, 399 disease classes
2. Login as approved doctor
3. Run a diagnosis: symptoms → prediction + confidence + XAI + Gemini recommendation
4. Save to patient record → view history
5. Show 401 on unauthenticated API call

### Current Limitations
- Academic dataset (4,201 rows / 399 classes) — not clinical-grade
- Confidence threshold is a heuristic, not calibrated
- Gemini output not clinically validated
- No OCR, no lab result integration

### Future Enhancements
- Calibrated confidence thresholds
- OCR for uploaded health reports
- Mobile application
- Multi-language support
- Lab result integration

---

## Slide 12: Conclusion

### What Was Achieved

- Complete, working Ayurvedic Clinical Decision Support System
- Logistic Regression model: 88.6% accuracy, 83.7% macro F1, 399 disease classes
- Genuine XAI: mathematically verified per-feature logit contributions
- Firebase Authentication + Firestore with role-based multi-clinic data isolation
- Gemini LLM integration with safe fallback
- 83 automated tests, all passing
- Professional React + FastAPI full-stack implementation

### Honest Position
ArogyaAI is an academic clinical decision support project. It is not a certified medical device and results require professional review. The system demonstrates that ML + generative AI can produce useful, transparent decision support output in the Ayurvedic domain.

**Questions Welcome**

---

## Speaker Notes

**Slide 4 (Proposed Solution):** Emphasise the three design principles — no hardcoded data, safe fallbacks, honest AI. These distinguish the project from a demo that fakes results.

**Slide 8 (ML Workflow):** Be ready to explain why Logistic Regression was chosen over Random Forest: cross-validation result AND the XAI requirement (linear coefficients allow exact contributions).

**Slide 10 (Testing):** Highlight the logit identity test specifically — this is a property that would fail if the explanation were fabricated or if preprocessing drifted.

**Slide 11 (Limitations):** State limitations honestly before the examiner asks. It demonstrates maturity and understanding of the gap between an academic prototype and a clinical system.
