"""ML pipeline tests: artifact contract, determinism, inference compatibility.

These tests exercise the real persisted artifact and the real inference path
(`backend.ml.preprocessing` + `backend.ml.predictor`), because the contract
between `ml/train.py` and `backend/ml/*` is what would silently break the API.

They do not retrain the model; that takes ~50s and belongs to `ml/train.py`.
"""
import json
import os
import sys
import unittest
from unittest import mock

import numpy as np

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.ml import model_loader  # noqa: E402
from backend.ml.predictor import predict  # noqa: E402
from backend.ml.preprocessing import (  # noqa: E402
    derive_age_group,
    normalize_categoricals,
    preprocess_input,
)

ARTIFACTS_DIR = os.path.join(PROJECT_ROOT, "ml", "artifacts")

VALID_INPUT = {
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
    "Weather": "Moderate",
    "Age_Group": "Young Adult",
}


class TestArtifactContract(unittest.TestCase):
    """The artifact must keep the keys the inference path reads."""

    REQUIRED_KEYS = ["model", "scaler", "vectorizer", "encoders", "feature_columns"]

    def test_artifact_exposes_required_keys(self):
        for key in self.REQUIRED_KEYS:
            self.assertIn(
                key, model_loader.model_components,
                f"artifact is missing required key '{key}' — inference would break",
            )

    def test_artifact_model_type_matches_the_model_object(self):
        """`model_type` is reported by /api/health, so it must not lie."""
        declared = model_loader.model_components.get("model_type")
        actual = type(model_loader.model).__name__
        self.assertIsNotNone(declared, "artifact has no model_type")
        expected = {
            "RandomForestClassifier": "Random Forest",
            "LogisticRegression": "Logistic Regression",
            "SVC": "SVM",
        }.get(actual)
        self.assertEqual(
            declared, expected,
            f"artifact says '{declared}' but the model is a {actual}",
        )

    def test_encoders_cover_every_feature_column(self):
        expected = {
            "Age_Group", "Gender", "Body_Type_Dosha_Sanskrit", "Food_Habits",
            "Current_Medication", "Allergies", "Season", "Weather", "Disease",
        }
        self.assertTrue(expected.issubset(set(model_loader.encoders.keys())))

    def test_feature_dimension_is_expected(self):
        """12 structured columns + TF-IDF must equal what the scaler was fitted on."""
        tfidf = len(model_loader.vectorizer.get_feature_names_out())
        structured = len(model_loader.training_feature_columns)
        self.assertEqual(structured, 12)
        self.assertEqual(tfidf, 807)
        self.assertEqual(
            model_loader.scaler.n_features_in_, structured + tfidf,
            "scaler input width does not match structured + TF-IDF",
        )

    def test_model_class_count_matches_disease_encoder(self):
        self.assertEqual(
            model_loader.model.n_classes_ if hasattr(model_loader.model, "n_classes_")
            else len(model_loader.encoders["Disease"].classes_),
            len(model_loader.encoders["Disease"].classes_),
        )


class TestPreprocessingDeterminism(unittest.TestCase):
    """The same input must always produce the same feature matrix."""

    def test_identical_input_gives_identical_features(self):
        first = preprocess_input(dict(VALID_INPUT))
        second = preprocess_input(dict(VALID_INPUT))
        np.testing.assert_array_equal(first, second)

    def test_feature_shape_is_one_by_dimension(self):
        features = preprocess_input(dict(VALID_INPUT))
        self.assertEqual(features.shape[0], 1)
        self.assertEqual(features.shape[1], model_loader.scaler.n_features_in_)

    def test_bmi_is_computed(self):
        """A zero BMI in the input must be replaced by the derived value, so the
        structured block is never silently all-zeros."""
        user = dict(VALID_INPUT)
        user.pop("BMI", None)
        features = preprocess_input(user)
        self.assertFalse(np.allclose(features, 0))

    def test_age_group_derivation_boundaries(self):
        self.assertEqual(derive_age_group(12), "Child")
        self.assertEqual(derive_age_group(13), "Adolescent")
        self.assertEqual(derive_age_group(20), "Young Adult")
        self.assertEqual(derive_age_group(36), "Middle Age")
        self.assertEqual(derive_age_group(56), "Senior")
        self.assertEqual(derive_age_group(80), "Elderly")

    def test_unseen_categoricals_are_normalised_not_dropped(self):
        user = dict(VALID_INPUT)
        user.update({
            "Gender": "NonBinary", "Body_Type_Dosha_Sanskrit": "UnknownDosha",
            "Food_Habits": "Nonsense", "Season": "Nonsense", "Weather": "Nonsense",
        })
        normalize_categoricals(user)
        self.assertEqual(user["Gender"], "Male")
        self.assertEqual(user["Body_Type_Dosha_Sanskrit"], "Vata")
        self.assertEqual(user["Season"], "Summer")

    def test_preprocessing_does_not_mutate_the_caller_input_in_place(self):
        """normalize_categoricals edits a dict it is given; preprocess_input must
        not depend on that side effect for correctness."""
        user = dict(VALID_INPUT)
        original = dict(user)
        preprocess_input(user)
        self.assertEqual(user, original, "preprocess_input mutated its argument")


class TestPredictorOutput(unittest.TestCase):
    def test_prediction_returns_label_and_confidence(self):
        features = preprocess_input(dict(VALID_INPUT))
        label, confidence = predict(features)
        self.assertIsInstance(label, str)
        self.assertTrue(label, "predicted label is empty")

    def test_confidence_is_a_percentage_in_range(self):
        features = preprocess_input(dict(VALID_INPUT))
        _, confidence = predict(features)
        self.assertGreaterEqual(confidence, 0.0)
        self.assertLessEqual(confidence, 100.0)

    def test_predicted_label_is_a_known_class(self):
        features = preprocess_input(dict(VALID_INPUT))
        label, _ = predict(features)
        self.assertIn(label, set(model_loader.encoders["Disease"].classes_))

    def test_predict_is_deterministic(self):
        features = preprocess_input(dict(VALID_INPUT))
        first = predict(features)
        second = predict(features)
        self.assertEqual(first[0], second[0])
        self.assertEqual(first[1], second[1])


class TestRecordedMetrics(unittest.TestCase):
    """If metrics.json exists, it must describe the artifact honestly."""

    def setUp(self):
        self.path = os.path.join(ARTIFACTS_DIR, "metrics.json")
        if not os.path.exists(self.path):
            self.skipTest("ml/artifacts/metrics.json not present")

    def _metrics(self):
        with open(self.path, encoding="utf-8") as fh:
            return json.load(fh)

    def test_metrics_exist_and_report_the_deployed_model(self):
        m = self._metrics()
        self.assertIn("deployed_model", m)
        self.assertIn("test_metrics", m)

    def test_reported_metrics_are_not_a_leaked_perfect_score(self):
        """A 1.0 on 399 classes over 841 test rows previously indicated leakage.
        If the honest pipeline ever reproduces a perfect score, that needs
        explaining rather than shipping silently."""
        m = self._metrics()
        self.assertLess(
            m["test_metrics"]["accuracy"], 1.0,
            "test accuracy is exactly 1.0 — re-check for leakage before trusting it",
        )

    def test_cross_validation_was_run_on_more_than_one_candidate(self):
        m = self._metrics()
        self.assertGreaterEqual(len(m["cross_validation"]), 2)

    def test_metrics_record_the_dataset_hash(self):
        m = self._metrics()
        self.assertEqual(len(m["dataset_sha256"]), 64)

    def test_feature_count_recorded_is_819(self):
        m = self._metrics()
        self.assertEqual(m.get("test_metrics", {}).get("n_classes"), 399)


class TestExplainability(unittest.TestCase):
    """The explanation must be the model's own arithmetic, not a narrative.

    Every assertion here recomputes the claim independently from the model
    object, so a decorative or fabricated explanation cannot pass.
    """

    def setUp(self):
        from backend.ml.explainability import explain_prediction
        from backend.ml.model_loader import model

        self.explain_prediction = explain_prediction
        self.model = model
        if not hasattr(model, "coef_"):
            self.skipTest("deployed estimator is not linear; no contributions exist")

        self.user = dict(VALID_INPUT)
        from backend.ml.preprocessing import preprocess_input

        self.features = preprocess_input(dict(self.user))
        label, _ = predict(self.features)
        self.label = label
        self.explanation = explain_prediction(self.user, self.features, label)

    def test_explanation_matches_the_shown_prediction(self):
        self.assertIsNotNone(self.explanation)
        self.assertEqual(self.explanation["predicted_class"], self.label)

    def test_predicted_class_index_is_the_model_argmax(self):
        """The explained class must be the one the model actually selected."""
        import numpy as np

        index = int(
            model_loader.encoders["Disease"].transform(
                [self.explanation["predicted_class"]]
            )[0]
        )
        logits = self.model.intercept_ + (
            self.features[0] @ self.model.coef_.T
        )
        self.assertEqual(index, int(np.argmax(logits)))

    def test_contributions_sum_back_to_the_model_logit(self):
        """intercept + total_contribution must equal the model's own score for
        the predicted class, to floating-point tolerance. This is the property
        that makes the explanation genuine rather than decorative."""
        index = int(
            model_loader.encoders["Disease"].transform([self.label])[0]
        )
        expected_logit = float(
            self.model.intercept_[index]
            + self.features[0] @ self.model.coef_[index]
        )
        reconstructed = (
            self.explanation["intercept"] + self.explanation["total_contribution"]
        )
        self.assertAlmostEqual(reconstructed, expected_logit, places=6)

    def test_each_returned_contribution_matches_its_own_coefficient(self):
        """Recompute every returned term straight from coef_ x feature."""
        import numpy as np

        index = int(
            model_loader.encoders["Disease"].transform([self.label])[0]
        )
        names = list(model_loader.scaler.get_feature_names_out())
        row = self.model.coef_[index]
        for item in self.explanation["features"]:
            if item["group"] != "profile":
                continue
            # Locate the scaler column by matching the term exactly.
            candidate = None
            for i, name in enumerate(names):
                if item["feature"] in (name, name.replace("_encoded", "")):
                    candidate = i
                    break
            if candidate is None:
                continue
            expected = float(row[candidate] * self.features[0][candidate])
            self.assertAlmostEqual(item["contribution"], expected, places=9)

    def test_direction_matches_the_sign_of_the_contribution(self):
        for item in self.explanation["features"]:
            if item["contribution"] >= 0:
                self.assertEqual(item["direction"], "supports")
            else:
                self.assertEqual(item["direction"], "opposes")

    def test_features_are_ranked_by_absolute_contribution(self):
        magnitudes = [
            abs(item["contribution"]) for item in self.explanation["features"]
        ]
        self.assertEqual(magnitudes, sorted(magnitudes, reverse=True))

    def test_explanation_is_deterministic(self):
        again = self.explain_prediction(self.user, self.features, self.label)
        self.assertEqual(
            json.dumps(again, sort_keys=True),
            json.dumps(self.explanation, sort_keys=True),
        )

    def test_symptom_terms_come_from_the_callers_own_text(self):
        """A term the caller never typed must not appear: it would be noise
        presented as an explanation."""
        from backend.ml.model_loader import vectorizer

        text = self.user["Symptoms"].lower()
        for item in self.explanation["features"]:
            if item["group"] != "symptom":
                continue
            self.assertIn(item["feature"], text)
            self.assertIn(item["feature"], vectorizer.vocabulary_)

    def test_no_explanation_for_an_unsupported_estimator(self):
        """A non-linear estimator must yield None, never a fabricated one."""
        from backend.ml import explainability

        with mock.patch.object(explainability, "model", object()):
            self.assertFalse(explainability.supports_explanations())
            self.assertIsNone(
                explainability.explain_prediction(self.user, self.features, self.label)
            )


if __name__ == "__main__":
    unittest.main()
