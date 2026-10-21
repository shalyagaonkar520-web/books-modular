"""Sign in with Rooman One (OIDC authorization code + PKCE against Core).

Off until OIDC_ISSUER and OIDC_CLIENT_ID are set. Books' own email/password
sign-in is untouched; this is a second way in that ends in the same Books
session (access token + rb_refresh cookie, via auth._issue_tokens).

Flow:
  GET /api/auth/rooman-one/start     -> Core's sign-in page (state, nonce and the
                                        PKCE verifier kept in a sealed, 10-minute cookie)
  GET /api/auth/rooman-one/callback  <- Core: code exchanged for tokens; the
                                        signed id_token names the user and organization
                                        -> back to the app, signed in (the app restores the
                                        session from the refresh cookie as on any page load)

Core's users and organizations carry the same ids as Books' (dashed vs. hex),
so the id_token's ``sub``/``org_id`` point straight at the Books user. Every
check of the password sign-in applies here too (active, organization
suspended / awaiting approval, subscription).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import UTC, datetime
from typing import Any, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import org_approval_error, subscription_sign_in_error
from backend.models import User
from backend.services import audit

logger = logging.getLogger("roomanbooks.rooman_one")
router = APIRouter(prefix="/api/auth/rooman-one", tags=["auth"])

FLOW_COOKIE = "rb_oidc"
FLOW_PATH = "/api/auth/rooman-one"
FLOW_SECONDS = 600
HTTP_TIMEOUT = 10
SCOPES = "openid profile email"

TRY_AGAIN = "Your Rooman One sign-in expired or was started in another tab. Please try again."
NO_ACCOUNT = "There's no Rooman Books account for this Rooman One login yet. Ask your organization's admin to invite you."
OTHER_ORG = "This Rooman One login is for a different organization than your Rooman Books account."
NOT_IN_PLAN = "Rooman Books isn't part of your organization's Rooman One plan."
UNAVAILABLE = "Rooman One sign-in is unavailable right now. Please use your email and password."


class SignInError(Exception):
    """Ends the flow back on the login page with this message."""


# --------------------------------------------------------------------------- #
# Settings and Core
# --------------------------------------------------------------------------- #
def enabled() -> bool:
    settings = get_settings()
    return bool(settings.oidc_issuer.strip() and settings.oidc_client_id.strip())


def _issuer() -> str:
    return get_settings().oidc_issuer.strip().rstrip("/")


def _redirect_uri() -> str:
    settings = get_settings()
    return settings.oidc_redirect_uri.strip() or settings.app_url.rstrip("/") + "/api/auth/rooman-one/callback"


def _http_json(url: str, form: Optional[dict] = None) -> dict:
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    request = urllib.request.Request(url, data=data, headers={"Accept": "application/json", "User-Agent": "RoomanBooks-SignIn/1"})
    if data is not None:
        request.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode("utf-8"))
        except ValueError:
            body = {}
        body.setdefault("error", f"http_{exc.code}")
        return body


_discovery: dict[str, Any] = {}


def discovery() -> dict:
    """Core's OIDC configuration, cached for an hour."""
    issuer = _issuer()
    cached = _discovery.get(issuer)
    if cached and cached[0] > time.time():
        return cached[1]
    try:
        doc = _http_json(f"{issuer}/api/oauth/.well-known/openid-configuration")
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.warning("Rooman One discovery failed: %s", exc)
        raise SignInError(UNAVAILABLE) from exc
    if doc.get("issuer", "").rstrip("/") != issuer or "authorization_endpoint" not in doc:
        logger.error("Rooman One discovery at %s did not describe that issuer", issuer)
        raise SignInError(UNAVAILABLE)
    _discovery[issuer] = (time.time() + 3600, doc)
    return doc


_jwks_clients: dict[str, jwt.PyJWKClient] = {}


def signing_key(token: str):
    uri = discovery()["jwks_uri"]
    client = _jwks_clients.setdefault(uri, jwt.PyJWKClient(uri, cache_keys=True, lifespan=3600, timeout=HTTP_TIMEOUT))
    return client.get_signing_key_from_jwt(token).key


def exchange(code: str, verifier: str) -> dict:
    settings = get_settings()
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _redirect_uri(),
        "code_verifier": verifier,
        "client_id": settings.oidc_client_id.strip(),
    }
    if settings.oidc_client_secret:
        form["client_secret"] = settings.oidc_client_secret
    try:
        return _http_json(discovery()["token_endpoint"], form)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        logger.warning("Rooman One token exchange failed: %s", exc)
        raise SignInError(UNAVAILABLE) from exc


# --------------------------------------------------------------------------- #
# The short-lived flow cookie (sealed with SECRET_KEY)
# --------------------------------------------------------------------------- #
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _mac(body: str) -> str:
    return _b64(hmac.new(get_settings().secret_key.encode(), b"rooman-one-flow." + body.encode(), hashlib.sha256).digest())


def seal(payload: dict) -> str:
    body = _b64(json.dumps({**payload, "exp": int(time.time()) + FLOW_SECONDS}).encode())
    return f"{body}.{_mac(body)}"


def unseal(value: Optional[str]) -> Optional[dict]:
    if not value or "." not in value:
        return None
    body, mac = value.rsplit(".", 1)
    if not hmac.compare_digest(mac, _mac(body)):
        return None
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except ValueError:
        return None
    return payload if payload.get("exp", 0) > time.time() else None


def _safe_next(value: Optional[str]) -> str:
    """Only paths inside Books (no other sites, no //host tricks)."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    return value[:500]


def _app(path: str) -> str:
    return get_settings().app_url.rstrip("/") + path


def _to_login(message: str) -> RedirectResponse:
    response = RedirectResponse(_app("/login?" + urllib.parse.urlencode({"sso_error": message})), status_code=303)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_PATH, domain=get_settings().cookie_domain)
    return response


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@router.get("")
def status():
    """Whether the login page should offer "Sign in with Rooman One"."""
    return {"enabled": enabled()}


@router.get("/start")
def start(next: Optional[str] = None):
    if not enabled():
        raise HTTPException(404, "Rooman One sign-in is not set up.")
    try:
        endpoint = discovery()["authorization_endpoint"]
    except SignInError as exc:
        return _to_login(str(exc))
    verifier = secrets.token_urlsafe(48)
    flow = {"state": secrets.token_urlsafe(24), "nonce": secrets.token_urlsafe(24), "verifier": verifier, "next": _safe_next(next)}
    query = {
        "client_id": get_settings().oidc_client_id.strip(),
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": SCOPES,
        "state": flow["state"],
        "nonce": flow["nonce"],
        "code_challenge": _b64(hashlib.sha256(verifier.encode()).digest()),
        "code_challenge_method": "S256",
    }
    response = RedirectResponse(f"{endpoint}?{urllib.parse.urlencode(query)}", status_code=303)
    settings = get_settings()
    response.set_cookie(
        FLOW_COOKIE,
        seal(flow),
        max_age=FLOW_SECONDS,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",  # sent on Core's top-level redirect back to us
        path=FLOW_PATH,
        domain=settings.cookie_domain,
    )
    return response


@router.get("/callback")
def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if not enabled():
        raise HTTPException(404, "Rooman One sign-in is not set up.")
    flow = unseal(request.cookies.get(FLOW_COOKIE))
    if flow is None or not state or not hmac.compare_digest(str(state), str(flow["state"])):
        return _to_login(TRY_AGAIN)
    if error or not code:
        return _to_login("Rooman One sign-in was cancelled." if error == "access_denied" else TRY_AGAIN)
    try:
        user = _user_from_core(db, code, flow)
    except SignInError as exc:
        return _to_login(str(exc))

    from backend.routers.auth import _issue_tokens  # the same session as a password sign-in

    response = RedirectResponse(_app(flow.get("next") or "/"), status_code=303)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_PATH, domain=get_settings().cookie_domain)
    user.last_login_at = datetime.now(UTC)
    _issue_tokens(db, user, response, request)
    audit.record(db, user, "login", "user", user.id, f"{user.email} signed in with Rooman One")
    db.commit()
    return response


def _user_from_core(db: Session, code: str, flow: dict) -> User:
    tokens = exchange(code, flow["verifier"])
    if "id_token" not in tokens:
        problem = f"{tokens.get('error', '')} {tokens.get('error_description', '')}"
        logger.warning("Rooman One token exchange refused: %s", problem.strip())
        raise SignInError(NOT_IN_PLAN if "app_not_in_plan" in problem else TRY_AGAIN)
    id_token = tokens["id_token"]
    try:
        claims = jwt.decode(
            id_token,
            signing_key(id_token),
            algorithms=["RS256"],
            audience=get_settings().oidc_client_id.strip(),
            issuer=_issuer(),
            leeway=60,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
    except (jwt.PyJWTError, KeyError) as exc:
        logger.warning("Rooman One id_token rejected: %s", exc)
        raise SignInError(TRY_AGAIN) from exc
    if not hmac.compare_digest(str(claims.get("nonce", "")), str(flow["nonce"])):
        raise SignInError(TRY_AGAIN)

    try:
        user_id = uuid.UUID(str(claims["sub"])).hex
        org_id = uuid.UUID(str(claims.get("org_id"))).hex if claims.get("org_id") else None
    except ValueError as exc:
        raise SignInError(NO_ACCOUNT) from exc
    user = db.get(User, user_id)
    if user is None or user.role == "integration":
        raise SignInError(NO_ACCOUNT)
    if org_id is not None and org_id != user.organization_id:
        raise SignInError(OTHER_ORG)
    if not user.is_active:
        raise SignInError("This account has been deactivated")
    if user.organization is not None and user.organization.is_suspended:
        raise SignInError("This organization has been suspended. Contact support.")
    approval_error = org_approval_error(user.organization) or subscription_sign_in_error(user)
    if approval_error:
        raise SignInError(approval_error)
    return user
