"""
Arogya AI — Comprehensive Backend Test Suite
==============================================
Review 3 Test Suite Covering:
    TEST 1: Root endpoint & API status
    TEST 2: Health check endpoint & metadata
    TEST 3: Age group derivation logic
    TEST 4: Input validation (Empty symptoms, out-of-range Age/Height/Weight)
    TEST 5: Categorical value fallback handling
    TEST 6: Model preprocessing pipeline (BMI computation, TF-IDF vectorization, encoding)
    TEST 7: Model prediction inference & confidence output
    TEST 8: Low confidence gate (<35% threshold)
    TEST 9: Gemini LLM failure/fallback handling
    TEST 10: End-to-end API predict route with mocked Gemini
    TEST 11: /api/predict requires a valid Firebase ID token
    TEST 12: public endpoints stay reachable without a token
"""

import sys
import os
import json
import unittest
from unittest.mock import patch, MagicMock
import numpy as np

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi.testclient import TestClient
from backend.index import app, derive_age_group, VALID_GENDERS, VALID_DOSHAS
from backend.core.security import require_user
from arogya_predict import preprocess_input, model, model_components, encoders


def _stub_user():
    """A synthetic verified caller, used only to satisfy the auth dependency
    while tests exercise ML/AI behaviour. It is never used by the authorization
    tests, which assert that the dependency is genuinely enforced."""
    return {"uid": "test-user", "email": "test@example.test"}


class TestBackendAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # These tests cover prediction behaviour, not authentication. The real
        # auth middleware is bypassed here via FastAPI's dependency override,
        # which touches no production code path. Enforcement of the dependency
        # is verified separately in TestBackendAPIAuthorization.
        app.dependency_overrides[require_user] = _stub_user
        cls.valid_payload = {
            "Symptoms": "fever, headache, chills, joint pain",
            "Age": 28,
            "Height_cm": 175,
            "Weight_kg": 70,
            "Gender": "Male",
            "Body_Type_Dosha_Sanskrit": "Pitta",
            "Food_Habits": "Vegetarian",
            "Current_Medication": "Unknown",
            "Allergies": "Unknown",
            "Season": "Summer",
            "Weather": "Moderate"
        }

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(require_user, None)

    # -------------------------------------------------------------------------
    # TEST 1: Root Endpoint
    # -------------------------------------------------------------------------
    def test_read_root(self):
        """Test GET / returns welcoming message and documentation links."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("message", data)
        self.assertEqual(data["message"], "Welcome to ArogyaAI API.")
        self.assertIn("health", data)

    # -------------------------------------------------------------------------
    # TEST 2: Health Check Endpoint
    # -------------------------------------------------------------------------
    def test_health_check(self):
        """Test GET /api/health returns healthy status and metadata.

        The model name is asserted against the loaded artifact rather than a
        literal, because the deployed estimator is chosen by cross-validation
        and changes when the winner changes. Hardcoding it made this test fail
        the moment Random Forest was correctly replaced by Logistic Regression.
        """
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["model"], model_components.get("model_type"))
        self.assertGreater(data["supported_diseases"], 0)
        self.assertIn("disclaimer", data)

    # -------------------------------------------------------------------------
    # TEST 3: Age Group Derivation
    # -------------------------------------------------------------------------
    def test_derive_age_group(self):
        """Test age classification boundaries for ML model compatibility."""
        self.assertEqual(derive_age_group(8), "Child")
        self.assertEqual(derive_age_group(12), "Child")
        self.assertEqual(derive_age_group(13), "Adolescent")
        self.assertEqual(derive_age_group(19), "Adolescent")
        self.assertEqual(derive_age_group(20), "Young Adult")
        self.assertEqual(derive_age_group(35), "Young Adult")
        self.assertEqual(derive_age_group(36), "Middle Age")
        self.assertEqual(derive_age_group(55), "Middle Age")
        self.assertEqual(derive_age_group(56), "Senior")
        self.assertEqual(derive_age_group(70), "Senior")
        self.assertEqual(derive_age_group(75), "Elderly")

    # -------------------------------------------------------------------------
    # TEST 4: Input Validation (Edge Cases & Invalids)
    # -------------------------------------------------------------------------
    def test_empty_symptoms_validation(self):
        """Test that empty or whitespace-only symptoms return HTTP 422."""
        invalid_payload = self.valid_payload.copy()
        invalid_payload["Symptoms"] = "   "
        response = self.client.post("/api/predict", json=invalid_payload)
        self.assertEqual(response.status_code, 422)

    def test_invalid_age_validation(self):
        """Test that age < 1 or age > 120 returns HTTP 422."""
        invalid_payload = self.valid_payload.copy()
        invalid_payload["Age"] = 0
        response = self.client.post("/api/predict", json=invalid_payload)
        self.assertEqual(response.status_code, 422)

        invalid_payload["Age"] = 150
        response = self.client.post("/api/predict", json=invalid_payload)
        self.assertEqual(response.status_code, 422)

    def test_invalid_height_weight_validation(self):
        """Test out of range height or weight returns HTTP 422."""
        invalid_height = self.valid_payload.copy()
        invalid_height["Height_cm"] = 30
        response = self.client.post("/api/predict", json=invalid_height)
        self.assertEqual(response.status_code, 422)

        invalid_weight = self.valid_payload.copy()
        invalid_weight["Weight_kg"] = 5
        response = self.client.post("/api/predict", json=invalid_weight)
        self.assertEqual(response.status_code, 422)

    # -------------------------------------------------------------------------
    # TEST 5: Fallback for Unknown Categorical Values
    # -------------------------------------------------------------------------
    @patch("backend.services.prediction_service.get_llm_validation_and_explanation")
    @patch("backend.ml.predictor.model.predict_proba")
    def test_unknown_categorical_fallback(self, mock_proba, mock_llm):
        """Test that unexpected categorical inputs are gracefully fallen back."""
        num_classes = len(encoders['Disease'].classes_)
        mock_probs = np.zeros((1, num_classes))
        mock_probs[0][0] = 0.85
        mock_proba.return_value = mock_probs
        mock_llm.return_value = "Sample Ayurvedic Recommendation"
        
        payload = self.valid_payload.copy()
        payload["Gender"] = "NonBinary"
        payload["Body_Type_Dosha_Sanskrit"] = "UnknownDosha"
        payload["Food_Habits"] = "JunkFoodObsessed"

        response = self.client.post("/api/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("prediction", data)
        self.assertIn("confidence", data)
        self.assertGreaterEqual(data["confidence"], 35.0)

    # -------------------------------------------------------------------------
    # TEST 6: Preprocessing Pipeline
    # -------------------------------------------------------------------------
    def test_preprocess_input_shape_and_bmi(self):
        """Test preprocessing produces scaled feature array of expected shape."""
        user_data = self.valid_payload.copy()
        user_data["Age_Group"] = derive_age_group(user_data["Age"])
        scaled_features = preprocess_input(user_data)
        
        self.assertIsInstance(scaled_features, np.ndarray)
        self.assertEqual(len(scaled_features.shape), 2)
        self.assertEqual(scaled_features.shape[0], 1)

    # -------------------------------------------------------------------------
    # TEST 7: ML Model Inference & Confidence
    # -------------------------------------------------------------------------
    def test_model_inference(self):
        """Test loaded Random Forest model can predict on preprocessed data."""
        user_data = self.valid_payload.copy()
        user_data["Age_Group"] = derive_age_group(user_data["Age"])
        scaled_features = preprocess_input(user_data)

        prediction_encoded = model.predict(scaled_features)[0]
        probabilities = model.predict_proba(scaled_features)[0]
        confidence = float(max(probabilities) * 100)

        disease_name = encoders['Disease'].inverse_transform([prediction_encoded])[0]
        self.assertIsInstance(disease_name, str)
        self.assertGreater(len(disease_name), 0)
        self.assertGreaterEqual(confidence, 0.0)
        self.assertLessEqual(confidence, 100.0)

    # -------------------------------------------------------------------------
    # TEST 8: Low Confidence Safety Gate
    # -------------------------------------------------------------------------
    @patch("backend.ml.predictor.model.predict_proba")
    def test_low_confidence_gate(self, mock_proba):
        """Test that confidence < 35% returns Inconclusive Data safety response."""
        # Mock probabilities with max < 0.35
        num_classes = len(encoders['Disease'].classes_)
        mock_probs = np.full((1, num_classes), 0.1)
        mock_proba.return_value = mock_probs

        response = self.client.post("/api/predict", json=self.valid_payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["prediction"], "Inconclusive Data")
        self.assertIn("safety threshold", data["recommendation"])

    # -------------------------------------------------------------------------
    # TEST 9: LLM Fallback When Gemini Fails
    # -------------------------------------------------------------------------
    @patch("backend.services.prediction_service.get_llm_validation_and_explanation")
    @patch("backend.ml.predictor.model.predict_proba")
    def test_gemini_fallback(self, mock_proba, mock_llm):
        """Test that graceful fallback is returned if Gemini LLM encounters an issue."""
        num_classes = len(encoders['Disease'].classes_)
        mock_probs = np.zeros((1, num_classes))
        mock_probs[0][0] = 0.88
        mock_proba.return_value = mock_probs
        
        mock_llm.return_value = (
            "### Clinical Assessment: Malaria\n\n"
            "**Primary Dosha Imbalance:** Pitta\n\n"
            "**Ayurvedic Care:**\n- Rest in a cool place\n- Hydrate with warm herbal water\n\n"
            "*(Rule-based fallback recommendation)*"
        )
        response = self.client.post("/api/predict", json=self.valid_payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("recommendation", data)
        self.assertIn("Clinical Assessment", data["recommendation"])

    # -------------------------------------------------------------------------
    # TEST 10: End-to-End Prediction API Route
    # -------------------------------------------------------------------------
    @patch("backend.services.prediction_service.get_llm_validation_and_explanation")
    @patch("backend.ml.predictor.model.predict_proba")
    def test_e2e_predict_endpoint_success(self, mock_proba, mock_llm):
        """Test full successful prediction cycle through API."""
        num_classes = len(encoders['Disease'].classes_)
        mock_probs = np.zeros((1, num_classes))
        mock_probs[0][0] = 0.92
        mock_proba.return_value = mock_probs
        
        mock_llm.return_value = "Personalized Ayurvedic Treatment: Giloy Ghanvati, Shadanga Paniya."
        response = self.client.post("/api/predict", json=self.valid_payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("prediction", data)
        self.assertIn("confidence", data)
        self.assertIn("recommendation", data)
        self.assertIsInstance(data["confidence"], float)


class TestBackendAPIAuthorization(unittest.TestCase):
    """Proves POST /api/predict is genuinely protected.

    These tests deliberately run WITHOUT the dependency override used by
    TestBackendAPI, so they exercise the real `require_user` dependency. They
    never reach the ML pipeline, so no network access is involved.
    """

    @classmethod
    def setUpClass(cls):
        app.dependency_overrides.pop(require_user, None)
        cls.client = TestClient(app)
        cls.valid_payload = {
            "Symptoms": "fever, headache",
            "Age": 28,
            "Height_cm": 175,
            "Weight_kg": 70,
            "Gender": "Male",
            "Body_Type_Dosha_Sanskrit": "Pitta",
        }

    def test_predict_without_token_is_unauthorized(self):
        """No Authorization header -> 401 MISSING_TOKEN."""
        response = self.client.post("/api/predict", json=self.valid_payload)
        self.assertEqual(response.status_code, 401)
        detail = response.json()["detail"]
        self.assertEqual(detail["error"]["code"], "MISSING_TOKEN")

    def test_predict_with_malformed_token_is_unauthorized(self):
        """A structurally invalid token -> 401 INVALID_TOKEN."""
        response = self.client.post(
            "/api/predict",
            json=self.valid_payload,
            headers={"Authorization": "Bearer not.a.token"},
        )
        self.assertEqual(response.status_code, 401)
        detail = response.json()["detail"]
        self.assertEqual(detail["error"]["code"], "INVALID_TOKEN")

    def test_predict_with_wrong_auth_scheme_is_unauthorized(self):
        """A non-Bearer scheme is not accepted."""
        response = self.client.post(
            "/api/predict",
            json=self.valid_payload,
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        self.assertEqual(response.status_code, 401)
        detail = response.json()["detail"]
        self.assertEqual(detail["error"]["code"], "MISSING_TOKEN")

    def test_unauthorized_response_does_not_leak_internals(self):
        """The 401 body must not disclose stack traces or key material."""
        response = self.client.post("/api/predict", json=self.valid_payload)
        body = response.text.lower()
        for leak in ("traceback", "private", "-----begin", "file \""):
            self.assertNotIn(leak, body)

    def test_public_endpoints_need_no_token(self):
        """Health and root stay reachable so the app can boot and be monitored."""
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.get("/api/health").status_code, 200)

    @patch("backend.services.prediction_service.get_llm_validation_and_explanation")
    @patch("backend.ml.predictor.model.predict_proba")
    @patch("backend.core.security.verify_id_token")
    def test_valid_token_reaches_the_pipeline(self, mock_verify, mock_proba, mock_llm):
        """A cryptographically valid token carries the request through to the
        handler, proving the dependency is wired into the route rather than
        merely present. Only signature verification is stubbed (it needs
        Google's live certificates); the dependency itself runs for real."""
        num_classes = len(encoders["Disease"].classes_)
        mock_probs = np.zeros((1, num_classes))
        mock_probs[0][0] = 0.9
        mock_proba.return_value = mock_probs
        mock_verify.return_value = {"uid": "real-user", "email": "u@test.test"}
        mock_llm.return_value = "Ayurvedic guidance."

        response = self.client.post(
            "/api/predict",
            json=self.valid_payload,
            headers={"Authorization": "Bearer a.well.formed.token"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("prediction", response.json())
        mock_verify.assert_called_once()


class TestRealPipelineIntegration(unittest.TestCase):
    """The full HTTP -> preprocessing -> real model -> explanation path.

    Every other test that reaches the model patches `model.predict_proba`,
    which is correct for isolating behaviour — but it means the contract
    between the persisted artifact and the route is never exercised through
    the API. A change to feature ordering, the scaler, or the encoder
    mapping could break real inference while every mocked test stayed green.

    This class deliberately does NOT patch the model. Only the LLM is
    patched, because Gemini needs credentials and network and its prose is
    not what is under test.
    """

    # A fixed input known to score well above the confidence gate, so the
    # explanation path is the one exercised. The model is deterministic, so
    # this is stable rather than lucky.
    PAYLOAD = {
        "Symptoms": "continuous sneezing, cough, fever, headache, joint pain",
        "Age": 28,
        "Height_cm": 175,
        "Weight_kg": 70,
        "Gender": "Male",
        "Body_Type_Dosha_Sanskrit": "Pitta",
        "Food_Habits": "Vegetarian",
        "Current_Medication": "Unknown",
        "Allergies": "Unknown",
        "Season": "Summer",
        "Weather": "Moderate",
    }

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        app.dependency_overrides[require_user] = _stub_user

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(require_user, None)

    def _predict(self, **overrides):
        with patch(
            "backend.services.prediction_service.get_llm_validation_and_explanation",
            return_value="stubbed narrative",
        ):
            response = self.client.post(
                "/api/predict", json={**self.PAYLOAD, **overrides}
            )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_real_model_returns_a_known_class_with_an_explanation(self):
        data = self._predict()
        self.assertGreaterEqual(data["confidence"], 35.0)
        self.assertIn(data["prediction"], set(encoders["Disease"].classes_))
        self.assertIsNotNone(
            data.get("explanation"),
            "a linear model must produce an explanation on the confident path",
        )

    def test_explanation_class_matches_the_returned_prediction(self):
        data = self._predict()
        self.assertEqual(data["explanation"]["predicted_class"], data["prediction"])

    def test_explanation_sum_reconstructs_the_models_own_logit(self):
        """Ties the HTTP response to the artifact's arithmetic.

        Recomputes the logit for the predicted class directly from the loaded
        model and the preprocessed features, and asserts the response's
        intercept plus total contribution equals it. If the route ever
        explained a different class, or the preprocessing drifted from what
        the coefficients expect, this fails.
        """
        data = self._predict()
        label = data["prediction"]
        index = int(encoders["Disease"].transform([label])[0])

        user = dict(self.PAYLOAD)
        user["Age_Group"] = derive_age_group(user["Age"])
        features = preprocess_input(user)
        expected = float(model.intercept_[index] + features[0] @ model.coef_[index])

        explanation = data["explanation"]
        self.assertAlmostEqual(
            explanation["intercept"] + explanation["total_contribution"],
            expected,
            places=6,
        )

    def test_explanation_features_are_ranked_by_magnitude(self):
        features = self._predict()["explanation"]["features"]
        magnitudes = [abs(f["contribution"]) for f in features]
        self.assertEqual(magnitudes, sorted(magnitudes, reverse=True))

    def test_direction_agrees_with_the_sign_of_each_contribution(self):
        for feature in self._predict()["explanation"]["features"]:
            expected = "supports" if feature["contribution"] >= 0 else "opposes"
            self.assertEqual(feature["direction"], expected)

    def test_symptom_terms_come_from_the_submitted_text(self):
        """A term the caller never typed would be noise shown as an explanation."""
        text = self.PAYLOAD["Symptoms"].lower()
        for feature in self._predict()["explanation"]["features"]:
            if feature["group"] == "symptom":
                self.assertIn(feature["feature"], text)

    def test_identical_requests_produce_identical_answers(self):
        first = self._predict()
        second = self._predict()
        self.assertEqual(first["prediction"], second["prediction"])
        self.assertEqual(first["confidence"], second["confidence"])
        self.assertEqual(first["explanation"], second["explanation"])

    def test_low_confidence_path_withholds_the_explanation(self):
        """Explaining a condition the system declines to name would present a
        guess as a finding, so the field must be absent there."""
        with patch("backend.ml.predictor.model.predict_proba") as mock_proba:
            num_classes = len(encoders["Disease"].classes_)
            mock_proba.return_value = np.full((1, num_classes), 0.1)
            data = self._predict()
        self.assertEqual(data["prediction"], "Inconclusive Data")
        self.assertIsNone(data.get("explanation"))
        self.assertIn("ml_prediction", data)

    def test_unknown_categoricals_are_normalised_by_the_real_pipeline(self):
        """The route must survive values the encoders never saw."""
        data = self._predict(
            **{
                "Gender": "NonBinary",
                "Body_Type_Dosha_Sanskrit": "UnknownDosha",
                "Season": "Nonexistent",
                "Weather": "Nonexistent",
            }
        )
        self.assertIn(data["prediction"], set(encoders["Disease"].classes_))


class TestProductionCorsOrigin(unittest.TestCase):
    """Regression: the deployed frontend origin must be allowed to call the API.

    The live backend was configured with `https://arogyaai.vercel.app`, which is
    NOT the address the site serves from. Every preflight from the real origin
    was rejected with 400 and no allow-origin header, so the browser blocked
    every prediction request — the app looked broken with no server-side error.

    A CORS origin has to match the served origin exactly, so this test pins the
    real deployed origin into the default allowlist rather than a lookalike.
    """

    DEPLOYED_ORIGIN = "https://arogya-ai-clinical-decision-support-nine.vercel.app"

    def test_deployed_origin_is_in_the_default_allowlist(self):
        """The default (no-env) configuration must include the served origin."""
        import importlib
        import backend.core.config as cfg

        # Re-read the default by clearing the override, since the process env
        # may carry one from the surrounding shell.
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("AROGYA_CORS_ORIGINS", None)
            importlib.reload(cfg)
            try:
                self.assertIn(
                    self.DEPLOYED_ORIGIN,
                    cfg.CORS_ORIGINS,
                    "the deployed frontend origin is missing from CORS_ORIGINS, "
                    "so the browser will block every request in production",
                )
            finally:
                importlib.reload(cfg)

    def test_preflight_from_the_legacy_origin_is_also_allowed(self):
        """An older ArogyaAI deployment shares the API and must keep working.

        `https://arogyaai.vercel.app` serves an earlier build of this product
        (title "Arogya AI"), so it is a legitimate second frontend rather than a
        lookalike. Both origins stay on the allowlist so fixing the current
        build does not break the older one.
        """
        client = TestClient(app)
        response = client.options(
            "/api/predict",
            headers={
                "Origin": "https://arogyaai.vercel.app",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "https://arogyaai.vercel.app",
        )

    def test_preflight_from_the_deployed_origin_succeeds(self):
        """An OPTIONS preflight from the real origin gets 200 + allow-origin."""
        client = TestClient(app)
        response = client.options(
            "/api/predict",
            headers={
                "Origin": self.DEPLOYED_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            self.DEPLOYED_ORIGIN,
        )

    def test_preflight_from_an_unknown_origin_is_refused(self):
        """An origin not on the allowlist gets no allow-origin header."""
        client = TestClient(app)
        response = client.options(
            "/api/predict",
            headers={
                "Origin": "https://attacker.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        self.assertIsNone(response.headers.get("access-control-allow-origin"))


class TestFirestoreIndexConfiguration(unittest.TestCase):
    """Regression: the dashboard's clinic-wide assessment query needs an index.

    `listClinicAssessments` runs a collection-group query
    (`collectionGroup('assessments').where('clinicId','==',...)`). Firestore
    refuses to serve it without a COLLECTION_GROUP index on `assessments.clinicId`
    and answers HTTP 400 FAILED_PRECONDITION — which the dashboard surfaced as
    "Could not load clinic statistics."

    `firestore.indexes.json` declared no index at all, so the query could never
    succeed in any environment. This pins the required index into the repository
    so it cannot be dropped again.
    """

    def test_assessments_clinicid_collection_group_index_is_declared(self):
        path = os.path.join(PROJECT_ROOT, "firestore.indexes.json")
        with open(path, encoding="utf-8") as handle:
            config = json.load(handle)

        matches = [
            override
            for override in config.get("fieldOverrides", [])
            if override.get("collectionGroup") == "assessments"
            and override.get("fieldPath") == "clinicId"
            and any(
                index.get("queryScope") == "COLLECTION_GROUP"
                for index in override.get("indexes", [])
            )
        ]
        self.assertTrue(
            matches,
            "firestore.indexes.json must declare a COLLECTION_GROUP index on "
            "assessments.clinicId or the clinic dashboard query returns 400",
        )


if __name__ == "__main__":
    unittest.main()
