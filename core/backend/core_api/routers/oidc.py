"""Browser sign-in endpoints (OpenID Connect, code flow + PKCE) under /api/oauth.

Served at id.<domain>/api/oauth/..., next to the sign-in page (/signin) that
the Core web app renders. The page talks to these endpoints with JSON; the
apps only see /authorize, /token, /userinfo, /logout and /jwks.
"""

from __future__ import annotations

import html
import uuid

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core_api import keys, signin, signup
from core_api.config import get_settings
from core_api.db import get_db
from core_api.models import App, Organization, User
from core_api.ratelimit import FailureLimiter

router = APIRouter(prefix="/api/oauth", tags=["Sign-in (OIDC)"])

COOKIE = "rooman_sid"
_login_failures = FailureLimiter(limit=20, window_seconds=300)
_signup_starts = FailureLimiter(limit=10, window_seconds=900)
SUPPORTED_SCOPES = {"openid", "profile", "email", "offline_access"}


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_session_cookie(response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/api/oauth",
    )


def _error_page(message: str, status_code: int = 400) -> HTMLResponse:
    """For a broken request we cannot safely send back to the app (unknown client or redirect)."""
    return HTMLResponse(
        status_code=status_code,
        content=(
            "<!doctype html><html lang='en'><head><meta charset='utf-8'><title>Sign-in problem</title>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'></head>"
            "<body style='font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem'>"
            f"<h1>We couldn't start the sign-in</h1><p>{html.escape(message)}</p>"
            "<p>Go back to the app and try again. If it keeps happening, contact support.</p></body></html>"
        ),
    )


def _signin_page(request_id: str) -> str:
    return f"{get_settings().issuer}/signin?request={request_id}"


def _require_page_header(x_rooman_signin: str | None) -> None:
    # The sign-in page always sends this header. A cross-site form cannot, and
    # a cross-site script would first need a CORS preflight that Core refuses.
    if x_rooman_signin != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing sign-in page header.")


def _sign_in_error(exc: signin.SignInError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"code": exc.code, "detail": exc.message})


# --------------------------------------------------------------------------- #
# The app's entry point
# --------------------------------------------------------------------------- #
@router.get("/authorize")
def authorize(
    request: Request,
    client_id: str = "",
    redirect_uri: str = "",
    response_type: str = "",
    scope: str = "",
    state: str | None = None,
    nonce: str | None = None,
    code_challenge: str = "",
    code_challenge_method: str = "",
    prompt: str | None = None,
    db: Session = Depends(get_db),
):
    client = signin.web_client(db, client_id)
    if client is None:
        return _error_page("The app that sent you here is not registered with Rooman One.")
    if redirect_uri not in client.redirect_uris:
        return _error_page("The app sent a return address that is not registered for it.")

    def back(error: str, description: str) -> RedirectResponse:
        return RedirectResponse(
            signin.redirect_with(redirect_uri, error=error, error_description=description, state=state), status_code=302
        )

    if response_type != "code":
        return back("unsupported_response_type", "Only response_type=code is supported.")
    if code_challenge_method != "S256" or not (43 <= len(code_challenge) <= 128):
        return back("invalid_request", "PKCE with code_challenge_method=S256 is required.")
    scopes = scope.split()
    if "openid" not in scopes or not set(scopes) <= SUPPORTED_SCOPES:
        return back("invalid_scope", f"scope must include openid and only: {' '.join(sorted(SUPPORTED_SCOPES))}.")

    pending = signin.save_request(db, client, redirect_uri, " ".join(scopes), state, nonce, code_challenge)
    found = None if prompt == "login" else signin.session_for(db, request.cookies.get(COOKIE))
    if found is not None:
        session, user = found
        orgs = signin.organizations(db, user)
        if len(orgs) == 1:
            code = signin.issue_code(db, pending, user, orgs[0][1], session)
            return RedirectResponse(signin.redirect_with(redirect_uri, code=code, state=state), status_code=302)
    return RedirectResponse(_signin_page(pending.id), status_code=302)


# --------------------------------------------------------------------------- #
# What the sign-in page calls
# --------------------------------------------------------------------------- #
class LoginIn(BaseModel):
    # Without a request_id this is a sign-in on Core's own page (no app waiting):
    # it only opens the Rooman One session; the page then offers the person's apps.
    request_id: str | None = Field(default=None, max_length=64)
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


class ChooseOrgIn(BaseModel):
    request_id: str = Field(max_length=64)
    org_id: uuid.UUID


def _orgs_json(db: Session, user: User) -> list[dict]:
    return [{"id": str(o.id), "name": o.name, "code": o.code, "role": m.role} for m, o in signin.organizations(db, user)]


def _finish(db: Session, pending, user: User, org: Organization, session) -> dict:
    redirect_uri, state = pending.redirect_uri, pending.state
    code = signin.issue_code(db, pending, user, org, session)
    return {"redirect": signin.redirect_with(redirect_uri, code=code, state=state)}


@router.get("/requests/{request_id}")
def describe_request(request_id: str, request: Request, db: Session = Depends(get_db)):
    """What the sign-in page shows: which app is asking, and who is already signed in."""
    try:
        pending = signin.pending_request(db, request_id)
    except signin.SignInError as exc:
        return _sign_in_error(exc)
    client = signin.web_client(db, pending.client_id)
    app = db.get(App, client.app_key) if client else None
    found = signin.session_for(db, request.cookies.get(COOKIE))
    body: dict = {"app": {"key": app.key, "name": app.name} if app else None, "signedIn": found is not None}
    if found is not None:
        body["user"] = {"email": found[1].email, "name": found[1].name}
        body["organizations"] = _orgs_json(db, found[1])
    return body


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db), x_rooman_signin: str | None = Header(default=None)):
    _require_page_header(x_rooman_signin)
    ip = _ip(request)
    if _login_failures.blocked(f"login:{ip}"):
        return JSONResponse(
            status_code=429, content={"code": "slow_down", "detail": "Too many attempts. Wait a few minutes and try again."}
        )
    try:
        pending = signin.pending_request(db, body.request_id) if body.request_id else None
        user = signin.authenticate(db, body.email, body.password, ip)
    except signin.SignInError as exc:
        if exc.code == "invalid_credentials":
            _login_failures.record(f"login:{ip}")
        return _sign_in_error(exc)
    session, token = signin.open_session(db, user, ip, request.headers.get("user-agent"))
    orgs = signin.organizations(db, user)
    if not orgs:
        response = JSONResponse(
            status_code=403, content={"code": "no_organization", "detail": "Your account is not active in any organization."}
        )
    elif pending is None:
        response = JSONResponse(_home(db, user))
    elif len(orgs) == 1:
        response = JSONResponse(_finish(db, pending, user, orgs[0][1], session))
    else:
        response = JSONResponse({"chooseOrganization": _orgs_json(db, user)})
    _set_session_cookie(response, token)
    return response


def _home(db: Session, user: User) -> dict:
    return {
        "signedIn": True,
        "user": {"email": user.email, "name": user.name},
        "organizations": _orgs_json(db, user),
        "apps": signin.launcher(db, user),
    }


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    """Core's own page: who is signed in here, and which apps they can open."""
    found = signin.session_for(db, request.cookies.get(COOKIE))
    if found is None:
        return {"signedIn": False, "signupAllowed": get_settings().allow_signup}
    return _home(db, found[1])


class SignupIn(BaseModel):
    name: str = Field(max_length=120)
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)
    organization: str = Field(max_length=200)


class SignupConfirmIn(BaseModel):
    ticket: str = Field(max_length=4000)
    code: str = Field(max_length=12)


def _signup_error(exc: signup.SignupError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"code": exc.code, "detail": exc.message})


@router.post("/signup")
def signup_start(body: SignupIn, request: Request, db: Session = Depends(get_db), x_rooman_signin: str | None = Header(default=None)):
    """Create an organization, step 1: check the details and email a code."""
    _require_page_header(x_rooman_signin)
    if not get_settings().allow_signup:
        return JSONResponse(
            status_code=403, content={"code": "signup_closed", "detail": "Sign-up is not open. Ask your administrator for an invite."}
        )
    ip = _ip(request)
    if _signup_starts.blocked(f"signup:{ip}"):
        return JSONResponse(
            status_code=429, content={"code": "slow_down", "detail": "Too many sign-ups from here. Wait a few minutes and try again."}
        )
    _signup_starts.record(f"signup:{ip}")
    try:
        ticket = signup.start(db, body.name, body.email, body.password, body.organization)
    except signup.SignupError as exc:
        return _signup_error(exc)
    return {"ticket": ticket, "email": body.email.strip().lower()}


@router.post("/signup/confirm")
def signup_confirm(
    body: SignupConfirmIn, request: Request, db: Session = Depends(get_db), x_rooman_signin: str | None = Header(default=None)
):
    """Create an organization, step 2: the emailed code; creates it all and signs the person in."""
    _require_page_header(x_rooman_signin)
    if not get_settings().allow_signup:
        return JSONResponse(
            status_code=403, content={"code": "signup_closed", "detail": "Sign-up is not open. Ask your administrator for an invite."}
        )
    ip = _ip(request)
    try:
        user = signup.confirm(db, body.ticket, body.code, ip)
    except signup.SignupError as exc:
        return _signup_error(exc)
    _session, token = signin.open_session(db, user, ip, request.headers.get("user-agent"))
    response = JSONResponse(_home(db, user))
    _set_session_cookie(response, token)
    return response


@router.post("/choose-org")
def choose_org(body: ChooseOrgIn, request: Request, db: Session = Depends(get_db), x_rooman_signin: str | None = Header(default=None)):
    _require_page_header(x_rooman_signin)
    found = signin.session_for(db, request.cookies.get(COOKIE))
    if found is None:
        return JSONResponse(status_code=401, content={"code": "signed_out", "detail": "Please sign in again."})
    session, user = found
    try:
        pending = signin.pending_request(db, body.request_id)
        org = db.get(Organization, body.org_id)
        if org is None:
            raise signin.SignInError("org_not_allowed", "You can't sign in to that organization.", 403)
        return _finish(db, pending, user, org, session)
    except signin.SignInError as exc:
        return _sign_in_error(exc)


# --------------------------------------------------------------------------- #
# For the apps after sign-in
# --------------------------------------------------------------------------- #
@router.get("/userinfo")
def userinfo(request: Request, db: Session = Depends(get_db)):
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "A user access token is required.", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = keys.verify(db, auth[7:].strip(), audience=None)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The token is not valid or has expired.", headers={"WWW-Authenticate": "Bearer"})
    if claims.get("typ") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This is not a user access token.")
    user = db.get(User, uuid.UUID(claims["sub"]))
    if user is None or user.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The account is no longer active.")
    return {"sub": str(user.id), "email": user.email, "name": user.name, "org_id": claims.get("org_id"), "role": claims.get("role")}


@router.get("/logout")
def logout(request: Request, client_id: str = "", post_logout_redirect_uri: str = "", db: Session = Depends(get_db)):
    """Sign out everywhere: Core's session and every app token it produced."""
    found = signin.session_for(db, request.cookies.get(COOKIE))
    if found is not None:
        signin.close_session(db, found[0])
    client = signin.web_client(db, client_id) if client_id else None
    target = (
        post_logout_redirect_uri
        if client and post_logout_redirect_uri in client.redirect_uris
        else f"{get_settings().issuer}/signin?signed_out=1"
    )
    response = RedirectResponse(target, status_code=302)
    response.delete_cookie(COOKIE, path="/api/oauth")
    return response
