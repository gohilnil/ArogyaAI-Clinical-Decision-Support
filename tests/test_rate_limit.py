"""Tests for per-caller rate limiting on the expensive prediction route.

Two layers, kept separate on purpose:

  * unit tests of the sliding-window counter itself, driven with explicit
    timestamps so window behaviour is asserted deterministically rather than by
    sleeping;
  * an integration test proving the real route returns 429 once a caller exceeds
    the limit — the control is the FastAPI dependency, so it is tested through
    the app rather than by calling the counter directly.
"""
import os
import sys
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi.testclient import TestClient  # noqa: E402

from backend.core import rate_limit  # noqa: E402
from backend.core.security import require_user  # noqa: E402
from backend.main import app  # noqa: E402

VALID_PAYLOAD = {
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
}


def _stub_user():
    return {"uid": "rate-limit-user", "email": "rl@example.test"}


class TestSlidingWindow(unittest.TestCase):
    """The counter must allow `limit` in a window and refuse the next one."""

    def setUp(self):
        rate_limit.reset()

    def test_allows_up_to_the_limit_then_refuses(self):
        allowed = [rate_limit.allow_request("u", 3, now=1000.0) for _ in range(4)]
        self.assertEqual(allowed, [True, True, True, False])

    def test_counters_are_independent_per_caller(self):
        for _ in range(3):
            rate_limit.allow_request("u1", 3, now=1000.0)
        self.assertFalse(rate_limit.allow_request("u1", 3, now=1000.0))
        self.assertTrue(
            rate_limit.allow_request("u2", 3, now=1000.0),
            "one caller exhausting their budget must not affect another",
        )

    def test_hits_expire_out_of_the_window(self):
        base = 2000.0
        self.assertTrue(rate_limit.allow_request("u", 2, now=base))
        self.assertTrue(rate_limit.allow_request("u", 2, now=base + 1))
        self.assertFalse(rate_limit.allow_request("u", 2, now=base + 2))
        self.assertTrue(
            rate_limit.allow_request("u", 2, now=base + 61),
            "a hit older than the window must no longer count",
        )

    def test_window_slides_rather_than_resetting_on_a_boundary(self):
        """A fixed-window counter would allow 2x the limit across a boundary;
        the sliding window must not."""
        base = 3000.0
        self.assertTrue(rate_limit.allow_request("u", 2, now=base + 59))
        self.assertTrue(rate_limit.allow_request("u", 2, now=base + 59.5))
        self.assertFalse(
            rate_limit.allow_request("u", 2, now=base + 60.5),
            "burst either side of a boundary must still be bounded",
        )

    def test_tracked_callers_are_bounded(self):
        """A flood of distinct accounts must not grow the map without limit."""
        with patch.object(rate_limit, "_MAX_TRACKED_KEYS", 5):
            for i in range(50):
                rate_limit.allow_request(f"user-{i}", 1, now=4000.0 + i)
            self.assertLessEqual(len(rate_limit._hits), 6)


class TestEndpointEnforcement(unittest.TestCase):
    """The real route must refuse once the caller is over budget."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        app.dependency_overrides[require_user] = _stub_user

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.pop(require_user, None)

    def setUp(self):
        rate_limit.reset()

    def test_over_limit_caller_gets_429(self):
        # The LLM call is stubbed so the test is hermetic; the limiter runs in a
        # dependency, before the handler, so it is exercised either way.
        with patch.object(rate_limit, "RATE_LIMIT_PER_MINUTE", 1), patch(
            "backend.services.prediction_service.get_llm_validation_and_explanation",
            return_value="stub recommendation",
        ):
            first = self.client.post("/api/predict", json=VALID_PAYLOAD)
            second = self.client.post("/api/predict", json=VALID_PAYLOAD)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.json()["detail"]["error"]["code"], "RATE_LIMITED")
        self.assertEqual(second.headers.get("Retry-After"), "60")
        # The refusal must not echo the payload or any internal detail.
        self.assertNotIn("fever", second.text)

    def test_limit_of_zero_disables_the_control(self):
        """Explicit opt-out for local debugging, mirroring AROGYA_AUTH_REQUIRED."""
        with patch.object(rate_limit, "RATE_LIMIT_PER_MINUTE", 0), patch(
            "backend.services.prediction_service.get_llm_validation_and_explanation",
            return_value="stub recommendation",
        ):
            codes = [
                self.client.post("/api/predict", json=VALID_PAYLOAD).status_code
                for _ in range(3)
            ]
        self.assertEqual(codes, [200, 200, 200])

    def test_a_malformed_estimate_is_charged_too(self):
        """The limiter runs before the handler, so a caller cannot probe the
        endpoint cheaply with invalid bodies to bypass counting."""
        with patch.object(rate_limit, "RATE_LIMIT_PER_MINUTE", 1), patch(
            "backend.services.prediction_service.get_llm_validation_and_explanation",
            return_value="stub recommendation",
        ):
            self.client.post(
                "/api/predict", json={**VALID_PAYLOAD, "Age": 3}
            )  # 422, but counted
            second = self.client.post("/api/predict", json=VALID_PAYLOAD)

        self.assertEqual(second.status_code, 429)


if __name__ == "__main__":
    unittest.main()
