"""User sign-in for every Rooman app: the logic behind routers/oidc.py.

OpenID Connect authorization code flow with PKCE:

1. An app sends the browser to ``/api/oauth/authorize``. The request is kept
   (``AuthRequest``, 10 minutes) and the person signs in at ``/signin``.
2. Core checks the password (bcrypt, the same hashes Books had), locks the
   account after MAX_FAILED_LOGINS wrong tries, and opens a browser session.
3. The person picks an organization if they belong to several. Core sends the
   browser back to the app with a one-time code (60 s, bound to the PKCE
   challenge and the exact redirect URI).
4. The app swaps the code at ``/api/oauth/token`` for an access token (its
   audience is that app), an ID token and a refresh token. Refresh tokens are
   rotated on every use; reusing an old one revokes the whole family.
"""

from __future__ import annotations

import base64
import hashlib
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from core_api import keys
from core_api.config import get_settings
from core_api.models import (
    AuditLog,
    AuthCode,
    AuthRequest,
    Membership,
    OAuthClient,
    Organization,
    OrgApp,
    OrgSubscription,
    RefreshToken,
    User,
    UserModuleAccess,
    UserSession,
)

REQUEST_MINUTES = 10
SIGNABLE_ORG_STATUSES = ("active",)
_VERIFIER = re.compile(r"^[A-Za-z0-9\-._~]{43,128}$")
_DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(rounds=12))


class SignInError(Exception):
    """A refusal the person (or the app) is shown, with a stable code."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def now() -> datetime:
    return datetime.now(UTC)


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def pkce_ok(verifier: str, challenge: str) -> bool:
    if not verifier or not _VERIFIER.match(verifier):
        return False
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return secrets.compare_digest(digest, challenge)


# --------------------------------------------------------------------------- #
# Passwords and lockout
# --------------------------------------------------------------------------- #
def _password_matches(password: str, stored: str | None) -> bool:
    raw = password.encode()[:72]  # bcrypt reads at most 72 bytes; Books enforced the same limit
    try:
        return bcrypt.checkpw(raw, (stored or "").encode()) if stored else bcrypt.checkpw(raw, _DUMMY_HASH) and False
    except ValueError:
        return False


def authenticate(db: Session, email: str, password: str, ip: str | None = None) -> User:
    """The user these credentials belong to (commits the lockout counters). Raises SignInError."""
    settings = get_settings()
    user = db.scalar(select(User).where(User.email == (email or "").strip().lower()))
    if user is None:
        _password_matches(password, None)  # same work as a real check, so timing does not reveal accounts
        raise SignInError("invalid_credentials", "Wrong email or password.", 401)
    locked = aware(user.locked_until)
    if locked and locked > now():
        raise SignInError("locked", "Too many wrong passwords. Try again in a few minutes, or reset your password.", 423)
    if not _password_matches(password, user.password_hash):
        user.failed_logins = (user.failed_logins or 0) + 1
        if user.failed_logins >= settings.max_failed_logins:
            user.locked_until = now() + timedelta(minutes=settings.lockout_minutes)
            user.failed_logins = 0
            db.add(AuditLog(actor_type="user", actor_id=str(user.id), action="user.locked", target=user.email, ip=ip))
        db.commit()
        raise SignInError("invalid_credentials", "Wrong email or password.", 401)
    if user.status == "invited" or not user.password_hash:
        raise SignInError("invited", "Finish setting up your account from the invitation email first.", 403)
    if user.status != "active":
        raise SignInError("disabled", "This account has been disabled. Contact your organization's admin.", 403)
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now()
    db.add(AuditLog(actor_type="user", actor_id=str(user.id), action="user.signed_in", target=user.email, ip=ip))
    db.commit()
    return user


def organizations(db: Session, user: User) -> list[tuple[Membership, Organization]]:
    """The organizations this user may sign in to: active membership in an active organization."""
    rows = db.execute(
        select(Membership, Organization)
        .join(Organization, Organization.id == Membership.org_id)
        .where(Membership.user_id == user.id, Membership.status == "active", Organization.status.in_(SIGNABLE_ORG_STATUSES))
        .order_by(Organization.name)
    ).all()
    return [(m, o) for m, o in rows]


# --------------------------------------------------------------------------- #
# Browser sessions at Core
# --------------------------------------------------------------------------- #
def open_session(db: Session, user: User, ip: str | None, user_agent: str | None) -> tuple[UserSession, str]:
    token = secrets.token_urlsafe(32)
    session = UserSession(
        token_hash=token_hash(token),
        user_id=user.id,
        expires_at=now() + timedelta(hours=get_settings().session_hours),
        last_seen_at=now(),
        ip=(ip or "")[:64] or None,
        user_agent=(user_agent or "")[:300] or None,
    )
    db.add(session)
    db.commit()
    return session, token


def session_for(db: Session, token: str | None) -> tuple[UserSession, User] | None:
    if not token:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token_hash == token_hash(token)))
    if session is None or session.revoked_at is not None or (aware(session.expires_at) or now()) <= now():
        return None
    user = db.get(User, session.user_id)
    if user is None or user.status != "active":
        return None
    return session, user


def close_session(db: Session, session: UserSession) -> None:
    """Sign out at Core: the session and every refresh token it produced stop working."""
    session.revoked_at = now()
    db.execute(
        update(RefreshToken).where(RefreshToken.session_id == session.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now())
    )
    db.add(AuditLog(actor_type="user", actor_id=str(session.user_id), action="user.signed_out"))
    db.commit()


# --------------------------------------------------------------------------- #
# App requests and one-time codes
# --------------------------------------------------------------------------- #
def web_client(db: Session, client_id: str) -> OAuthClient | None:
    client = db.scalar(select(OAuthClient).where(OAuthClient.client_id == client_id))
    if client is None or not client.is_active or not client.redirect_uris:
        return None
    return client


def save_request(
    db: Session, client: OAuthClient, redirect_uri: str, scope: str, state: str | None, nonce: str | None, challenge: str
) -> AuthRequest:
    request = AuthRequest(
        id=secrets.token_urlsafe(24),
        client_id=client.client_id,
        redirect_uri=redirect_uri,
        scope=scope,
        state=state,
        nonce=nonce,
        code_challenge=challenge,
        expires_at=now() + timedelta(minutes=REQUEST_MINUTES),
    )
    db.add(request)
    db.commit()
    return request


def pending_request(db: Session, request_id: str | None) -> AuthRequest:
    request = db.get(AuthRequest, request_id or "")
    if request is None or (aware(request.expires_at) or now()) <= now():
        raise SignInError("request_expired", "This sign-in link has expired. Go back to the app and sign in again.", 400)
    return request


def issue_code(db: Session, request: AuthRequest, user: User, org: Organization, session: UserSession) -> str:
    """The one-time code for the app; the request is used up (commits)."""
    if not any(o.id == org.id for _, o in organizations(db, user)):
        raise SignInError("org_not_allowed", "You can't sign in to that organization.", 403)
    code = secrets.token_urlsafe(32)
    db.add(
        AuthCode(
            code_hash=token_hash(code),
            client_id=request.client_id,
            user_id=user.id,
            org_id=org.id,
            session_id=session.id,
            redirect_uri=request.redirect_uri,
            scope=request.scope,
            nonce=request.nonce,
            code_challenge=request.code_challenge,
            expires_at=now() + timedelta(seconds=get_settings().auth_code_seconds),
        )
    )
    db.delete(request)
    db.commit()
    return code


def redirect_with(uri: str, **params: str | None) -> str:
    from urllib.parse import urlencode

    query = urlencode({k: v for k, v in params.items() if v is not None})
    return f"{uri}{'&' if '?' in uri else '?'}{query}"


# --------------------------------------------------------------------------- #
# Tokens for users
# --------------------------------------------------------------------------- #
def user_claims(db: Session, user: User, org: Organization, app_key: str) -> dict[str, Any]:
    """What an app needs to know about the person (matches rooman_sdk.tokens.Claims)."""
    membership = db.scalar(
        select(Membership).where(Membership.user_id == user.id, Membership.org_id == org.id, Membership.status == "active")
    )
    if membership is None or org.status not in SIGNABLE_ORG_STATUSES:
        raise SignInError("org_not_allowed", "You no longer have access to this organization.", 403)
    apps = sorted(a.app_key for a in db.scalars(select(OrgApp).where(OrgApp.org_id == org.id, OrgApp.status == "active")))
    subs = {s.app_key: s for s in db.scalars(select(OrgSubscription).where(OrgSubscription.org_id == org.id))}
    access = {
        a.app_key: a.modules
        for a in db.scalars(select(UserModuleAccess).where(UserModuleAccess.user_id == user.id, UserModuleAccess.org_id == org.id))
    }
    modules: dict[str, list[str]] = {}
    for app in apps:
        plan = subs[app].modules if app in subs else None
        own = access.get(app) if membership.role != "admin" else None
        if plan is not None and own is not None:
            modules[app] = [m for m in plan if m in set(own)]
        elif plan is not None or own is not None:
            modules[app] = list(plan if plan is not None else own)
    sub = subs.get(app_key)
    trial_ends = (
        (sub.trial_ends_at if sub and sub.trial_ends_at else org.trial_ends_at) if (sub is None or sub.status != "active") else None
    )
    return {
        "sub": str(user.id),
        "org_id": str(org.id),
        "org_code": org.code,
        "role": membership.role,
        "apps": apps,
        "modules": modules,
        "subscription_status": sub.status if sub else None,
        "trial_ends_at": aware(trial_ends).isoformat() if trial_ends else None,
    }


@dataclass
class Tokens:
    access_token: str
    id_token: str | None
    refresh_token: str
    expires_in: int
    scope: str

    def as_response(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "access_token": self.access_token,
            "token_type": "Bearer",
            "expires_in": self.expires_in,
            "refresh_token": self.refresh_token,
            "scope": self.scope,
        }
        if self.id_token:
            body["id_token"] = self.id_token
        return body


def _issue(
    db: Session,
    client: OAuthClient,
    user: User,
    org: Organization,
    scope: str,
    nonce: str | None,
    session_id: uuid.UUID | None,
    family_id: uuid.UUID,
) -> Tokens:
    settings = get_settings()
    ttl = timedelta(minutes=settings.user_token_minutes)
    claims = user_claims(db, user, org, client.app_key)
    if client.app_key not in claims["apps"]:
        raise SignInError("app_not_in_plan", "Your organization's plan does not include this app.", 403)
    access = keys.sign(db, {**claims, "aud": client.app_key, "typ": "access", "client_id": client.client_id, "scope": scope}, ttl)
    id_token = None
    if "openid" in scope.split():
        id_claims = {"sub": str(user.id), "aud": client.client_id, "org_id": str(org.id), "auth_time": int(now().timestamp())}
        if nonce:
            id_claims["nonce"] = nonce
        if "email" in scope.split():
            id_claims["email"] = user.email
        if "profile" in scope.split():
            id_claims["name"] = user.name
        id_token = keys.sign(db, id_claims, ttl)
    refresh = secrets.token_urlsafe(32)
    db.add(
        RefreshToken(
            token_hash=token_hash(refresh),
            family_id=family_id,
            client_id=client.client_id,
            user_id=user.id,
            org_id=org.id,
            session_id=session_id,
            scope=scope,
            expires_at=now() + timedelta(days=settings.refresh_token_days),
        )
    )
    db.commit()
    return Tokens(access, id_token, refresh, int(ttl.total_seconds()), scope)


def client_for_token(db: Session, client_id: str, secret: str | None) -> OAuthClient:
    """A web client: public ones use PKCE only; confidential ones must also send their secret."""
    from core_api import clients

    client = web_client(db, client_id)
    if client is None:
        raise SignInError("invalid_client", "Unknown client.", 401)
    if client.secret_hash and clients.authenticate(db, client_id, secret or "") is None:
        raise SignInError("invalid_client", "Wrong client secret.", 401)
    return client


def exchange_code(db: Session, client: OAuthClient, code: str, redirect_uri: str, verifier: str) -> Tokens:
    row = db.get(AuthCode, token_hash(code or ""))
    if row is None or row.client_id != client.client_id:
        raise SignInError("invalid_grant", "The code is not valid.", 400)
    if row.used_at is not None:
        # A replayed code: someone else may have it. Cut off what it produced.
        if row.family_id is not None:
            _revoke_family(db, row.family_id)
        raise SignInError("invalid_grant", "The code has already been used.", 400)
    if (aware(row.expires_at) or now()) <= now():
        raise SignInError("invalid_grant", "The code has expired.", 400)
    if row.redirect_uri != redirect_uri:
        raise SignInError("invalid_grant", "redirect_uri does not match the sign-in request.", 400)
    if not pkce_ok(verifier, row.code_challenge):
        raise SignInError("invalid_grant", "The PKCE code_verifier does not match.", 400)
    family = uuid.uuid4()
    row.used_at = now()
    row.family_id = family
    db.commit()
    user, org = db.get(User, row.user_id), db.get(Organization, row.org_id)
    if user is None or user.status != "active" or org is None:
        raise SignInError("invalid_grant", "The account is no longer active.", 400)
    return _issue(db, client, user, org, row.scope, row.nonce, row.session_id, family)


def _revoke_family(db: Session, family_id: uuid.UUID) -> None:
    db.execute(update(RefreshToken).where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now()))
    db.add(AuditLog(actor_type="system", action="refresh_family.revoked", target=str(family_id)))
    db.commit()


def refresh(db: Session, client: OAuthClient, token: str) -> Tokens:
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(token or "")))
    if row is None or row.client_id != client.client_id:
        raise SignInError("invalid_grant", "The refresh token is not valid.", 400)
    if row.used_at is not None or row.revoked_at is not None:
        if row.used_at is not None:
            _revoke_family(db, row.family_id)  # an old token came back: assume it was stolen
        raise SignInError("invalid_grant", "The refresh token is no longer valid. Sign in again.", 400)
    if (aware(row.expires_at) or now()) <= now():
        raise SignInError("invalid_grant", "The refresh token has expired. Sign in again.", 400)
    if row.session_id is not None:
        session = db.get(UserSession, row.session_id)
        if session is None or session.revoked_at is not None:
            raise SignInError("invalid_grant", "You signed out. Sign in again.", 400)
    row.used_at = now()
    db.commit()
    user, org = db.get(User, row.user_id), db.get(Organization, row.org_id)
    if user is None or user.status != "active" or org is None:
        _revoke_family(db, row.family_id)
        raise SignInError("invalid_grant", "The account is no longer active.", 400)
    return _issue(db, client, user, org, row.scope, None, row.session_id, row.family_id)
