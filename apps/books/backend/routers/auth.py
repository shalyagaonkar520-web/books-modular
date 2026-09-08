"""Registration, login, token refresh, profile."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user
from backend.models import BankAccount, Organization, RefreshToken, User
from backend.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    OrganizationOut,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from backend.schemas.common import Message
from backend.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from backend.services import audit
from backend.services.chart_of_accounts import bootstrap_accounts
from backend.services.ratelimit import RateLimiter, client_ip

settings = get_settings()
router = APIRouter(prefix="/api/auth", tags=["Authentication"])
login_limiter = RateLimiter(limit=settings.login_rate_limit_per_minute, window_seconds=60)

REFRESH_COOKIE = "rb_refresh"


def _issue_tokens(db: Session, user: User, response: Response, request: Request) -> str:
    access = create_access_token(user.id, user.organization_id, user.role)
    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            user_agent=(request.headers.get("user-agent") or "")[:255],
        )
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_refresh,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/auth",
        domain=settings.cookie_domain,
    )
    return access


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", domain=settings.cookie_domain)


def _auth_response(access: str, user: User) -> AuthResponse:
    return AuthResponse(
        access_token=access,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
        organization=OrganizationOut.model_validate(user.organization),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if not settings.allow_public_signup:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Public sign-up is disabled. Ask an administrator for an invite.")
    login_limiter.check(f"register:{client_ip(request)}")

    email = payload.email.lower()
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    org = Organization(name=payload.organization_name, gstin=payload.gstin or None)
    db.add(org)
    db.flush()

    accounts = bootstrap_accounts(db, org.id)
    db.add(
        BankAccount(
            organization_id=org.id,
            name="Petty Cash",
            type="cash",
            opening_balance=0,
            opening_balance_date=date.today(),
            ledger_account_id=accounts["1000"].id,
            is_primary=True,
        )
    )

    user = User(
        organization_id=org.id,
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
        role="admin",
        last_login_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    user.organization = org
    audit.record(db, user, "register", "organization", org.id, f"Organization '{org.name}' created")
    access = _issue_tokens(db, user, response, request)
    db.commit()
    return _auth_response(access, user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    login_limiter.check(f"login:{client_ip(request)}")
    user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    user.last_login_at = datetime.now(UTC)
    access = _issue_tokens(db, user, response, request)
    audit.record(db, user, "login", "user", user.id, f"{user.email} signed in")
    db.commit()
    return _auth_response(access, user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    token = db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw))).scalar_one_or_none()
    now = datetime.now(UTC)
    if token is None or token.revoked_at is not None or token.expires_at.replace(tzinfo=UTC) < now:
        _clear_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token is invalid or expired")
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        _clear_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User is inactive")
    token.revoked_at = now  # rotate
    access = _issue_tokens(db, user, response, request)
    db.commit()
    return TokenResponse(access_token=access, expires_in=settings.access_token_expire_minutes * 60)


@router.post("/logout", response_model=Message)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        token = db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw))).scalar_one_or_none()
        if token and token.revoked_at is None:
            token.revoked_at = datetime.now(UTC)
            db.commit()
    _clear_cookie(response)
    return Message(message="Signed out")


@router.get("/me", response_model=AuthResponse)
def me(user: User = Depends(get_current_user)):
    # Re-issue a fresh access token alongside profile data so the client can extend its session.
    access = create_access_token(user.id, user.organization_id, user.role)
    return _auth_response(access, user)


@router.put("/me", response_model=UserOut)
def update_profile(payload: UpdateProfileRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.name = payload.name
    audit.record(db, user, "update", "user", user.id, "Profile updated")
    db.commit()
    return UserOut.model_validate(user)


@router.post("/change-password", response_model=Message)
def change_password(
    payload: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    # Revoke all refresh tokens so other sessions must log in again.
    for token in db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))).scalars():
        token.revoked_at = datetime.now(UTC)
    audit.record(db, user, "update", "user", user.id, "Password changed")
    db.commit()
    return Message(message="Password updated. Other sessions have been signed out.")
