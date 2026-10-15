"""Token endpoint (client credentials) and the public keys apps verify Core's tokens with."""

from __future__ import annotations

import base64
import binascii
from datetime import timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from core_api import clients, keys
from core_api.config import get_settings
from core_api.db import get_db
from core_api.ratelimit import FailureLimiter

router = APIRouter(tags=["OAuth"])

SERVICE_AUDIENCE = "core"
_failures = FailureLimiter(limit=10, window_seconds=300)


def _oauth_error(status: int, error: str, description: str) -> JSONResponse:
    headers = {"Cache-Control": "no-store"}
    if status == 401:
        headers["WWW-Authenticate"] = 'Basic realm="core"'
    return JSONResponse(status_code=status, content={"error": error, "error_description": description}, headers=headers)


def _client_credentials(request: Request, form: dict) -> tuple[str, str]:
    """client_id/secret from HTTP Basic (preferred) or the form body."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("basic "):
        try:
            raw = base64.b64decode(auth[6:].strip(), validate=True).decode()
            client_id, _, secret = raw.partition(":")
            return client_id, secret
        except (binascii.Error, UnicodeDecodeError):
            return "", ""
    return str(form.get("client_id") or ""), str(form.get("client_secret") or "")


@router.post("/token")
async def token(request: Request, db: Session = Depends(get_db)):
    form = dict(await request.form())
    if form.get("grant_type") != "client_credentials":
        return _oauth_error(400, "unsupported_grant_type", "Only the client_credentials grant is supported here.")
    client_id, secret = _client_credentials(request, form)
    ip = request.client.host if request.client else "unknown"
    if _failures.blocked(f"token:{ip}:{client_id}"):
        return _oauth_error(429, "slow_down", "Too many failed attempts. Wait a few minutes.")
    client = clients.authenticate(db, client_id, secret)
    if client is None:
        _failures.record(f"token:{ip}:{client_id}")
        return _oauth_error(401, "invalid_client", "Unknown client or wrong secret.")

    requested = str(form.get("scope") or "").split()
    granted = [s for s in client.scopes if not requested or s in requested]
    ttl = timedelta(minutes=get_settings().service_token_minutes)
    access = keys.sign(
        db,
        {
            "sub": f"client:{client.client_id}",
            "aud": SERVICE_AUDIENCE,
            "typ": "service",
            "client_id": client.client_id,
            "app": client.app_key,
            "scope": " ".join(granted),
        },
        ttl,
    )
    return JSONResponse(
        {"access_token": access, "token_type": "Bearer", "expires_in": int(ttl.total_seconds()), "scope": " ".join(granted)},
        headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@router.get("/jwks")
@router.get("/.well-known/jwks.json")
def public_keys(db: Session = Depends(get_db)):
    return JSONResponse(keys.jwks(db), headers={"Cache-Control": "public, max-age=300"})


@router.get("/.well-known/openid-configuration")
def discovery():
    issuer = get_settings().issuer
    return {
        "issuer": issuer,
        "jwks_uri": f"{issuer}/jwks",
        "token_endpoint": f"{issuer}/token",
        "grant_types_supported": ["client_credentials"],
        "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
        "id_token_signing_alg_values_supported": [keys.ALGORITHM],
    }
