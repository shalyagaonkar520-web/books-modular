"""Sign in with Rooman One (OIDC authorization code + PKCE against Core).

Off until OIDC_ISSUER and OIDC_CLIENT_ID are set. Books' own email/password
sign-in is untouched; this is a second way in that ends in the same Books
session (access token + rb_refresh cookie, via auth._issue_tokens).

Every product (services/products) signs in as its own Rooman One app: the
request's host picks the product, the product picks the Core client (Books:
OIDC_CLIENT_ID; any other: OIDC_PRODUCT_CLIENT_IDS), and the callback and the
page the user lands on are on the product's own address. Core refuses the
sign-in when the organization's plan does not include that app.

Flow:
  GET /api/auth/rooman-one/start     -> Core's sign-in page (state, nonce and the
                                        PKCE verifier kept in a sealed, 10-minute cookie)
  GET /api/auth/rooman-one/callback  <- Core: code exchanged for tokens; the
                                        signed id_token names the user and organization
                                        -> back to the app, signed in (the app restores the
                                        session from the refresh cookie as on any page load)

Core's users and organizations carry the same ids as Books' (dashed vs. hex),
so the id_token's ``sub``/``org_id`` point straight at the Books user. Someone
Books has not seen yet (an organization created on Rooman One, or a person
added there) is set up on that first sign-in: the organization exactly as
Books' own sign-up would, the user with Rooman One's role. Every
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
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import org_approval_error, subscription_sign_in_error
from backend.models import Organization, User
from backend.services import audit, products
from backend.services.org_setup import create_organization
from backend.services.products import Product

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
NOT_IN_PLAN = "{product} isn't part of your organization's Rooman One plan."
EMAIL_IN_USE = "This email already has its own Rooman Books account. Sign in to Books with your email and password."
UNAVAILABLE = "Rooman One sign-in is unavailable right now. Please use your email and password."


class SignInError(Exception):
    """Ends the flow back on the login page with this message."""


# --------------------------------------------------------------------------- #
# Settings and Core
# --------------------------------------------------------------------------- #
def _pairs(raw: str) -> dict[str, str]:
    """``"a=x,b=y"`` -> ``{"a": "x", "b": "y"}``."""
    pairs = {}
    for item in filter(None, (part.strip() for part in raw.split(","))):
        key, _, value = item.partition("=")
        if key.strip() and value.strip():
            pairs[key.strip()] = value.strip()
    return pairs


def client_for(product: Optional[Product] = None) -> tuple[str, str]:
    """The product's Core client: (client_id, client_secret); empty when it has none."""
    settings = get_settings()
    product = product or products.fallback()
    if product.key == products.fallback().key:
        return settings.oidc_client_id.strip(), settings.oidc_client_secret
    return _pairs(settings.oidc_product_client_ids).get(product.key, ""), _pairs(settings.oidc_product_client_secrets).get(product.key, "")


def enabled(product: Optional[Product] = None) -> bool:
    return bool(get_settings().oidc_issuer.strip() and client_for(product)[0])


def _issuer() -> str:
    return get_settings().oidc_issuer.strip().rstrip("/")


def _redirect_uri(product: Optional[Product] = None) -> str:
    product = product or products.fallback()
    if product.key == products.fallback().key and get_settings().oidc_redirect_uri.strip():
        return get_settings().oidc_redirect_uri.strip()
    return product.app_url() + "/api/auth/rooman-one/callback"


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


def exchange(code: str, verifier: str, product: Optional[Product] = None) -> dict:
    client_id, client_secret = client_for(product)
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": _redirect_uri(product),
        "code_verifier": verifier,
        "client_id": client_id,
    }
    if client_secret:
        form["client_secret"] = client_secret
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


def _app(path: str, product: Optional[Product] = None) -> str:
    return (product or products.fallback()).app_url() + path


def _to_login(message: str, product: Optional[Product] = None) -> RedirectResponse:
    response = RedirectResponse(_app("/login?" + urllib.parse.urlencode({"sso_error": message}), product), status_code=303)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_PATH, domain=get_settings().cookie_domain)
    return response


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #
@router.get("")
def status(request: Request):
    """Whether the login page should offer "Sign in with Rooman One" (for this host's product)."""
    return {"enabled": enabled(products.current(request))}


@router.get("/start")
def start(request: Request, next: Optional[str] = None):
    product = products.current(request)
    if not enabled(product):
        raise HTTPException(404, "Rooman One sign-in is not set up.")
    try:
        endpoint = discovery()["authorization_endpoint"]
    except SignInError as exc:
        return _to_login(str(exc), product)
    verifier = secrets.token_urlsafe(48)
    flow = {
        "state": secrets.token_urlsafe(24),
        "nonce": secrets.token_urlsafe(24),
        "verifier": verifier,
        "next": _safe_next(next),
        "product": product.key,
    }
    query = {
        "client_id": client_for(product)[0],
        "redirect_uri": _redirect_uri(product),
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
    product = products.current(request)
    if not enabled(product):
        raise HTTPException(404, "Rooman One sign-in is not set up.")
    flow = unseal(request.cookies.get(FLOW_COOKIE))
    if flow is None or not state or not hmac.compare_digest(str(state), str(flow["state"])):
        return _to_login(TRY_AGAIN, product)
    # Started on another product's address: its code belongs to another Core client.
    if flow.get("product", products.fallback().key) != product.key:
        return _to_login(TRY_AGAIN, product)
    if error or not code:
        return _to_login("Rooman One sign-in was cancelled." if error == "access_denied" else TRY_AGAIN, product)
    try:
        user = _user_from_core(db, code, flow, product)
    except SignInError as exc:
        return _to_login(str(exc), product)

    from backend.routers.auth import _issue_tokens  # the same session as a password sign-in

    response = RedirectResponse(_app(flow.get("next") or "/", product), status_code=303)
    response.delete_cookie(FLOW_COOKIE, path=FLOW_PATH, domain=get_settings().cookie_domain)
    user.last_login_at = datetime.now(UTC)
    _issue_tokens(db, user, response, request)
    audit.record(db, user, "login", "user", user.id, f"{user.email} signed in with Rooman One")
    db.commit()
    return response


# Rooman One roles -> Books roles; anything else gets the everyday role.
ROLES = {"admin": "admin", "owner": "admin", "staff": "staff", "viewer": "viewer", "employee": "employee"}


def _first_sign_in(db: Session, claims: dict, user_id: str, org_id: Optional[str]) -> User:
    """Someone from Rooman One whom Books has not seen yet: set up their organization
    (when it is new to Books, exactly as Books' own sign-up does) and their user,
    with Rooman One's ids. Committed here, so an organization waiting for a
    super-admin's approval is there to be approved."""
    email = str(claims.get("email") or "").strip().lower()
    if not org_id or not email:
        raise SignInError(NO_ACCOUNT)
    if db.execute(select(User.id).where(User.email == email)).first():
        raise SignInError(EMAIL_IN_USE)
    org = db.get(Organization, org_id)
    created_org = org is None
    if org is None:
        org, _ = create_organization(db, str(claims.get("org_name") or email.split("@")[1])[:200], org_id=org_id)
    role = ROLES.get(str(claims.get("role") or ""), "admin" if created_org else "staff")
    user = User(
        id=user_id,
        organization_id=org.id,
        name=str(claims.get("name") or email.split("@")[0])[:120],
        email=email,
        password_hash=None,  # signs in with Rooman One; "Forgot password" can add a Books password later
        role=role,
    )
    db.add(user)
    db.flush()
    user.organization = org
    if created_org:
        audit.record(db, user, "register", "organization", org.id, f"Organization '{org.name}' set up from Rooman One")
    audit.record(db, user, "create", "user", user.id, f"{email} joined from Rooman One as {role}")
    db.commit()
    return user


def _user_from_core(db: Session, code: str, flow: dict, product: Optional[Product] = None) -> User:
    product = product or products.fallback()
    tokens = exchange(code, flow["verifier"], product)
    if "id_token" not in tokens:
        problem = f"{tokens.get('error', '')} {tokens.get('error_description', '')}"
        logger.warning("Rooman One token exchange refused: %s", problem.strip())
        raise SignInError(NOT_IN_PLAN.format(product=product.name) if "app_not_in_plan" in problem else TRY_AGAIN)
    id_token = tokens["id_token"]
    try:
        claims = jwt.decode(
            id_token,
            signing_key(id_token),
            algorithms=["RS256"],
            audience=client_for(product)[0],
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
    if user is not None and user.role == "integration":
        raise SignInError(NO_ACCOUNT)
    if user is None:
        user = _first_sign_in(db, claims, user_id, org_id)
    elif org_id is not None and org_id != user.organization_id:
        raise SignInError(OTHER_ORG)
    if not user.is_active:
        raise SignInError("This account has been deactivated")
    if user.organization is not None and user.organization.is_suspended:
        raise SignInError("This organization has been suspended. Contact support.")
    approval_error = org_approval_error(user.organization) or subscription_sign_in_error(user)
    if approval_error:
        raise SignInError(approval_error)
    return user
