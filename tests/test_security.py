"""Unit tests for Firebase ID-token verification (backend/core/security.py).

These tests do not contact Google. A throwaway RSA key pair is generated, a
self-signed certificate is exposed through a patched certificate fetch, and
tokens are signed locally. That lets every rejection rule be asserted in
isolation: signature, expiry, audience, issuer and subject.
"""
import datetime as dt
import os
import sys
import unittest
from unittest.mock import patch

import jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.core import security  # noqa: E402
from backend.core.config import FIREBASE_PROJECT_ID  # noqa: E402

KID = "test-key-1"
ISSUER = f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"


def _make_cert_pem(private_key) -> str:
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=1))
        .sign(private_key, hashes.SHA256())
    )
    return cert.public_bytes(serialization.Encoding.PEM).decode()


class TestIdTokenVerification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.cert_pem = _make_cert_pem(cls.private_key)
        cls.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        patcher = patch.object(security, "_fetch_certs", return_value={KID: self.cert_pem})
        self.addCleanup(patcher.stop)
        patcher.start()

    def make_token(self, **overrides):
        now = dt.datetime.now(dt.timezone.utc)
        claims = {
            "aud": FIREBASE_PROJECT_ID,
            "iss": ISSUER,
            "sub": "user-123",
            "iat": now,
            "exp": now + dt.timedelta(hours=1),
            "user_id": "user-123",
        }
        key = overrides.pop("_key", self.private_key)
        kid = overrides.pop("_kid", KID)
        claims.update(overrides)
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})

    # -- accepted -----------------------------------------------------------
    def test_valid_token_is_accepted(self):
        claims = security.verify_id_token(self.make_token())
        self.assertEqual(claims["sub"], "user-123")
        self.assertEqual(claims["aud"], FIREBASE_PROJECT_ID)

    # -- rejected -----------------------------------------------------------
    def test_token_signed_by_another_key_is_rejected(self):
        token = self.make_token(_key=self.other_key)
        with self.assertRaises(ValueError):
            security.verify_id_token(token)

    def test_expired_token_is_rejected(self):
        now = dt.datetime.now(dt.timezone.utc)
        token = self.make_token(
            exp=now - dt.timedelta(minutes=5),
            iat=now - dt.timedelta(hours=1),
        )
        with self.assertRaises(ValueError) as ctx:
            security.verify_id_token(token)
        self.assertIn("expired", str(ctx.exception).lower())

    def test_wrong_audience_is_rejected(self):
        with self.assertRaises(ValueError):
            security.verify_id_token(self.make_token(aud="some-other-project"))

    def test_wrong_issuer_is_rejected(self):
        with self.assertRaises(ValueError):
            security.verify_id_token(
                self.make_token(iss="https://securetoken.google.com/evil-project")
            )

    def test_empty_subject_is_rejected(self):
        with self.assertRaises(ValueError):
            security.verify_id_token(self.make_token(sub=""))

    def test_unknown_signing_key_is_rejected(self):
        with self.assertRaises(ValueError):
            security.verify_id_token(self.make_token(_kid="not-a-known-kid"))

    def test_token_without_kid_header_is_rejected(self):
        token = jwt.encode(
            {
                "aud": FIREBASE_PROJECT_ID,
                "iss": ISSUER,
                "sub": "user-123",
                "iat": dt.datetime.now(dt.timezone.utc),
                "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1),
            },
            self.private_key,
            algorithm="RS256",
        )
        with self.assertRaises(ValueError):
            security.verify_id_token(token)

    def test_malformed_and_empty_tokens_are_rejected(self):
        for bad in ["", "   ", "not-a-jwt", "a.b.c"]:
            with self.assertRaises(ValueError):
                security.verify_id_token(bad)

    def test_algorithm_none_is_rejected(self):
        """The classic JWT attack: an unsigned token must never be accepted."""
        unsigned = jwt.encode(
            {
                "aud": FIREBASE_PROJECT_ID,
                "iss": ISSUER,
                "sub": "attacker",
                "iat": dt.datetime.now(dt.timezone.utc),
                "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1),
            },
            key="",
            algorithm="none",
            headers={"kid": KID},
        )
        with self.assertRaises(ValueError):
            security.verify_id_token(unsigned)


class TestRequireUserDependency(unittest.TestCase):
    def test_missing_header_raises_401(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            security.require_user(None)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail["error"]["code"], "MISSING_TOKEN")

    def test_bad_scheme_raises_401(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            security.require_user("Token abc")
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail["error"]["code"], "MISSING_TOKEN")

    def test_invalid_token_raises_401_without_leaking_detail(self):
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            security.require_user("Bearer not.a.token")
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail["error"]["code"], "INVALID_TOKEN")
        self.assertNotIn("not.a.token", ctx.exception.detail["error"]["message"])

    def test_auth_can_be_disabled_explicitly_for_local_debugging(self):
        with patch.object(security, "AUTH_REQUIRED", False):
            claims = security.require_user(None)
        self.assertEqual(claims["uid"], "auth-disabled")


if __name__ == "__main__":
    unittest.main()
