"""Firebase ID-token verification for the API.

Every protected route depends on `require_user`, which verifies the caller's
Firebase ID token before the handler runs. Verification is performed against
Google's public signing certificates, so the backend proves who the caller is
**without holding a service-account private key** — there is no privileged
credential on the server to leak.

A token is only accepted when all of the following hold:
  * the signature matches a current Google certificate (RS256)
  * `aud` is this Firebase project
  * `iss` is `https://securetoken.google.com/<project>`
  * `exp` is in the future and `iat` is in the past
  * `sub` is a non-empty user id

Failure is reported as 401 with a stable `error.code` so the frontend can
distinguish "sign in again" from a server fault.
"""
import threading
import time
from typing import Any, Dict, Optional

import jwt
import requests
from cryptography.x509 import load_pem_x509_certificate
from fastapi import Header, HTTPException, status

from backend.core.config import (
    AUTH_REQUIRED,
    FIREBASE_CERT_URL,
    FIREBASE_PROJECT_ID,
)
from backend.core.logging import logger

_ISSUER = f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"

# Google rotates these certificates; refresh well inside their advertised max-age.
_CERT_TTL_SECONDS = 3600

_cert_lock = threading.Lock()
_cert_cache: Dict[str, Any] = {"certs": {}, "expires_at": 0.0}


def _fetch_certs(force: bool = False) -> Dict[str, str]:
    """Return {kid: PEM certificate}, cached in-process."""
    with _cert_lock:
        now = time.time()
        if not force and _cert_cache["certs"] and now < _cert_cache["expires_at"]:
            return _cert_cache["certs"]

        response = requests.get(FIREBASE_CERT_URL, timeout=10)
        response.raise_for_status()
        certs = response.json()
        _cert_cache["certs"] = certs
        _cert_cache["expires_at"] = now + _CERT_TTL_SECONDS
        return certs


def _public_key_for_kid(kid: str):
    """Resolve a signing key, refetching once if the kid is unknown."""
    certs = _fetch_certs()
    if kid not in certs:
        certs = _fetch_certs(force=True)
    if kid not in certs:
        raise ValueError("Unknown token signing key")
    certificate = load_pem_x509_certificate(certs[kid].encode())
    return certificate.public_key()


def verify_id_token(token: str) -> Dict[str, Any]:
    """Verify a Firebase ID token and return its claims.

    Raises ValueError when the token is not acceptable for any reason.
    """
    if not token or not token.strip():
        raise ValueError("Empty token")

    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise ValueError("Malformed token header") from exc

    kid = header.get("kid")
    if not kid:
        raise ValueError("Token header is missing a key id")

    key = _public_key_for_kid(kid)

    try:
        claims = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=_ISSUER,
            options={"require": ["exp", "iat", "aud", "iss", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ValueError("Token has expired") from exc
    except jwt.InvalidAudienceError as exc:
        raise ValueError("Token audience is not this project") from exc
    except jwt.InvalidIssuerError as exc:
        raise ValueError("Token issuer is not this project") from exc
    except jwt.PyJWTError as exc:
        raise ValueError("Token signature or claims are invalid") from exc

    if not claims.get("sub"):
        raise ValueError("Token subject is empty")
    return claims


def _unauthorized(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": {"code": code, "message": message}},
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_user(
    authorization: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    """FastAPI dependency enforcing a valid Firebase ID token.

    Returns the verified claims (including `uid`, `email`). The caller is
    identified from the *token*, never from the request body, so a client
    cannot claim to be another user.
    """
    if not AUTH_REQUIRED:
        # Explicitly opted out for local debugging only.
        return {"uid": "auth-disabled", "email": None}

    if not authorization or not authorization.lower().startswith("bearer "):
        raise _unauthorized(
            "MISSING_TOKEN",
            "A Firebase ID token is required in the Authorization header.",
        )

    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = verify_id_token(token)
    except ValueError as exc:
        logger.warning("Rejected ID token: %s", exc)
        raise _unauthorized("INVALID_TOKEN", "The authentication token is not valid.")

    return claims
