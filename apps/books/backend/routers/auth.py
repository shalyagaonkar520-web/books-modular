"""Registration, login, token refresh, profile."""
from __future__ import annotations

import logging
import secrets
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user
from backend.models import BankAccount, EmailVerification, Organization, RefreshToken, User
from backend.schemas.auth import (
    AcceptInviteRequest,
    AuthResponse,
    ChangePasswordRequest,
    EmailVerificationStatusResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    InviteInfo,
    LoginRequest,
    OrganizationOut,
    RegisterRequest,
    ResetPasswordWithOtpRequest,
    SendEmailVerificationRequest,
    SendEmailVerificationResponse,
    SessionOut,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
    VerifyEmailTokenRequest,
    VerifyOtpRequest,
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
from backend.services.email_service import send_password_reset_email, send_verification_email
from backend.services.ratelimit import RateLimiter, client_ip
from backend.services.user_agent import parse_user_agent

logger = logging.getLogger("roomanbooks.auth")
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
            ip_address=client_ip(request)[:64],
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


EMAIL_TOKEN_EXPIRE_MINUTES = 30


@router.post("/send-verification-email", response_model=SendEmailVerificationResponse)
def send_email_verification(payload: SendEmailVerificationRequest, request: Request, db: Session = Depends(get_db)):
    login_limiter.check(f"send-verify:{client_ip(request)}")
    email = payload.email.lower().strip()

    # If an account already exists with this email, reject
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # Resend cooldown: 60 seconds
    recent = db.execute(
        select(EmailVerification)
        .where(
            EmailVerification.email == email,
            EmailVerification.status == "PENDING",
            EmailVerification.created_at > datetime.now(UTC) - timedelta(seconds=60),
        )
    ).scalar_one_or_none()
    if recent:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Please wait 60 seconds before requesting another verification code.",
        )

    # Invalidate any older PENDING tokens for this email
    pending_records = db.execute(
        select(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.status == "PENDING",
        )
    ).scalars().all()
    for rec in pending_records:
        rec.status = "EXPIRED"

    # Generate a 6-digit numeric OTP code
    otp = f"{secrets.randbelow(900000) + 100000}"
    raw_token = secrets.token_urlsafe(32)
    t_hash = hash_token(f"{email}:{otp}")
    expires_at = datetime.now(UTC) + timedelta(minutes=EMAIL_TOKEN_EXPIRE_MINUTES)

    verification = EmailVerification(
        email=email,
        token_hash=t_hash,
        status="PENDING",
        expires_at=expires_at,
    )
    db.add(verification)
    db.commit()

    app_url = (settings.app_url or "http://localhost:3000").rstrip("/")
    verify_url = f"{app_url}/verify-email?token={raw_token}"

    send_res = send_verification_email(email, verify_url=verify_url, otp=otp)
    dev_otp: Optional[str] = None
    if settings.environment == "development" or not send_res.get("success"):
        dev_otp = otp
        logger.info("[DEV OTP] Verification code for %s is %s", email, otp)

    if not send_res.get("success"):
        logger.warning("SMTP delivery notice: %s", send_res.get("error"))
        msg = f"Verification code generated: {otp} (Gmail delivery failed or in dev mode)"
    else:
        msg = "Verification code sent to your email. Please check your inbox."

    return SendEmailVerificationResponse(
        message=msg,
        cooldown_seconds=60,
        dev_otp=dev_otp,
    )


@router.post("/verify-otp", response_model=Message)
def verify_email_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    otp = payload.otp.strip()
    t_hash = hash_token(f"{email}:{otp}")

    verification = db.execute(
        select(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.token_hash == t_hash,
        )
    ).scalar_one_or_none()

    if verification is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid verification code. Please check and try again.")

    if verification.status == "VERIFIED":
        return Message(message="Email already verified")

    if verification.status != "PENDING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification code has already been used or expired.")

    exp = verification.expires_at.replace(tzinfo=UTC) if verification.expires_at.tzinfo is None else verification.expires_at
    if exp < datetime.now(UTC):
        verification.status = "EXPIRED"
        db.commit()
        raise HTTPException(status.HTTP_410_GONE, "Verification code has expired. Please request a new one.")

    verification.status = "VERIFIED"
    verification.verified_at = datetime.now(UTC)
    db.commit()

    return Message(message="Email verified successfully")


@router.post("/verify-email", response_model=Message)
def verify_email_token(payload: VerifyEmailTokenRequest, db: Session = Depends(get_db)):
    tok = payload.token.strip()
    t_hash = hash_token(tok)
    verification = db.execute(
        select(EmailVerification).where(
            (EmailVerification.token_hash == t_hash)
            | (EmailVerification.token_hash == hash_token(f"{EmailVerification.email}:{tok}"))
        )
    ).scalar_one_or_none()

    if verification is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Verification link is invalid or has expired.")

    if verification.status == "VERIFIED":
        return Message(message="Email already verified")

    if verification.status != "PENDING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification link is invalid or has already been used.")

    exp = verification.expires_at.replace(tzinfo=UTC) if verification.expires_at.tzinfo is None else verification.expires_at
    if exp < datetime.now(UTC):
        verification.status = "EXPIRED"
        db.commit()
        raise HTTPException(status.HTTP_410_GONE, "Verification link has expired. Please request a new one.")

    verification.status = "VERIFIED"
    verification.verified_at = datetime.now(UTC)
    db.commit()

    return Message(message="Email verified successfully")


@router.get("/email-verification-status", response_model=EmailVerificationStatusResponse)
def check_email_verification_status(email: str, db: Session = Depends(get_db)):
    norm_email = email.lower().strip()
    rec = db.execute(
        select(EmailVerification)
        .where(
            EmailVerification.email == norm_email,
            EmailVerification.status == "VERIFIED",
            EmailVerification.used_at.is_(None),
        )
        .order_by(EmailVerification.verified_at.desc())
    ).scalars().first()

    if rec:
        exp = rec.expires_at.replace(tzinfo=UTC) if rec.expires_at.tzinfo is None else rec.expires_at
        if exp >= datetime.now(UTC):
            return EmailVerificationStatusResponse(
                email=norm_email,
                status="VERIFIED",
                verified=True,
                expires_at=rec.expires_at,
            )

    return EmailVerificationStatusResponse(
        email=norm_email,
        status="PENDING",
        verified=False,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if not settings.allow_public_signup:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Public sign-up is disabled. Ask an administrator for an invite.")
    login_limiter.check(f"register:{client_ip(request)}")

    email = payload.email.lower().strip()

    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # CORE SECURITY RULE: The backend must independently verify that the email address
    # has a valid, unexpired, single-use VERIFIED record before creating the organization.
    verification = db.execute(
        select(EmailVerification)
        .where(
            EmailVerification.email == email,
            EmailVerification.status == "VERIFIED",
            EmailVerification.used_at.is_(None),
        )
        .order_by(EmailVerification.verified_at.desc())
    ).scalars().first()

    if not verification:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="EMAIL_NOT_VERIFIED: Please verify your email address before creating your organization.",
        )

    exp = verification.expires_at.replace(tzinfo=UTC) if verification.expires_at.tzinfo is None else verification.expires_at
    if exp < datetime.now(UTC):
        verification.status = "EXPIRED"
        db.commit()
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="EMAIL_NOT_VERIFIED: Email verification has expired. Please verify your email again.",
        )

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

    # Invalidate the verification record as USED and attach user_id
    verification.status = "USED"
    verification.used_at = datetime.now(UTC)
    verification.user_id = user.id

    audit.record(db, user, "register", "organization", org.id, f"Organization '{org.name}' created")
    access = _issue_tokens(db, user, response, request)
    db.commit()
    return _auth_response(access, user)


@router.get("/invite/{token}", response_model=InviteInfo)
def get_invite(token: str, db: Session = Depends(get_db)):
    """Looked up by the accept-invite page before it asks for a password."""
    user = db.execute(select(User).where(User.invite_token_hash == hash_token(token))).scalar_one_or_none()
    if user is None or user.password_hash is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invite link is invalid or has already been used")
    if user.invite_token_expires_at is None or user.invite_token_expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "This invite link has expired. Ask an administrator to resend it.")
    return InviteInfo(name=user.name, email=user.email, organization_name=user.organization.name)


@router.post("/accept-invite", response_model=Message)
def accept_invite(payload: AcceptInviteRequest, db: Session = Depends(get_db)):
    """Sets the invitee's own password. They then sign in normally at /login."""
    user = db.execute(select(User).where(User.invite_token_hash == hash_token(payload.token))).scalar_one_or_none()
    if user is None or user.password_hash is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This invite link is invalid or has already been used")
    if user.invite_token_expires_at is None or user.invite_token_expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status.HTTP_410_GONE, "This invite link has expired. Ask an administrator to resend it.")
    user.password_hash = hash_password(payload.password)
    user.invite_token_hash = None
    user.invite_token_expires_at = None
    audit.record(db, user, "update", "user", user.id, f"{user.email} accepted their invite and set a password")
    db.commit()
    return Message(message="Password set. You can now sign in.")


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    login_limiter.check(f"login:{client_ip(request)}:{email_clean}")
    user = db.execute(select(User).where(User.email == email_clean)).scalar_one_or_none()
    if user and user.password_hash is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This invitation hasn't been accepted yet. Check your email for the setup link.")
    password_ok = user is not None and (
        verify_password(payload.password, user.password_hash)
        or verify_password(payload.password.strip(), user.password_hash)
    )
    if not user or not password_ok:
        logger.warning("Login failed for email '%s' (user_found: %s)", email_clean, user is not None)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    user.last_login_at = datetime.now(UTC)
    access = _issue_tokens(db, user, response, request)
    audit.record(db, user, "login", "user", user.id, f"{user.email} signed in")
    db.commit()
    return _auth_response(access, user)


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    login_limiter.check(f"forgot-password:{client_ip(request)}")
    email = payload.email.lower().strip()

    # CORE REQUIREMENT: Only send if registered
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        # Check if they verified email during setup but didn't finish creating organization
        verified_ev = db.execute(
            select(EmailVerification).where(
                EmailVerification.email == email,
                EmailVerification.status == "VERIFIED",
            )
        ).first()
        if verified_ev:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "This email was verified, but registration was not completed. Please create your organization on the registration page first.",
            )
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "No registered account found with this email address.",
        )

    if not user.is_active:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your account has been deactivated. Please contact your administrator.",
        )

    # Resend cooldown: 60 seconds
    recent = db.execute(
        select(EmailVerification)
        .where(
            EmailVerification.email == email,
            EmailVerification.status == "PENDING",
            EmailVerification.created_at > datetime.now(UTC) - timedelta(seconds=60),
        )
    ).scalar_one_or_none()
    if recent:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Please wait 60 seconds before requesting another reset code.",
        )

    # Invalidate older pending reset tokens for this email
    pending_records = db.execute(
        select(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.status == "PENDING",
        )
    ).scalars().all()
    for rec in pending_records:
        rec.status = "EXPIRED"

    otp = f"{secrets.randbelow(900000) + 100000}"
    t_hash = hash_token(f"reset:{email}:{otp}")
    expires_at = datetime.now(UTC) + timedelta(minutes=15)

    verification = EmailVerification(
        user_id=user.id,
        email=email,
        token_hash=t_hash,
        status="PENDING",
        expires_at=expires_at,
    )
    db.add(verification)
    db.commit()

    send_res = send_password_reset_email(email, otp)
    dev_otp: Optional[str] = None
    if settings.environment == "development" or not send_res.get("success"):
        dev_otp = otp
        logger.info("[DEV OTP] Password reset code for %s is %s", email, otp)

    if not send_res.get("success"):
        msg = "Password reset code sent. Please check your email inbox."
    else:
        msg = "Password reset code sent to your email. Please check your inbox."

    return ForgotPasswordResponse(
        message=msg,
        cooldown_seconds=60,
        dev_otp=dev_otp,
    )


@router.post("/reset-password", response_model=Message)
def reset_password_with_otp(payload: ResetPasswordWithOtpRequest, request: Request, db: Session = Depends(get_db)):
    login_limiter.check(f"reset-password:{client_ip(request)}")
    email = payload.email.lower().strip()
    otp = payload.otp.strip()
    t_hash = hash_token(f"reset:{email}:{otp}")

    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No registered account found with this email address.")

    verification = db.execute(
        select(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.token_hash == t_hash,
        )
    ).scalar_one_or_none()

    if verification is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid verification code. Please check and try again.")

    if verification.status != "PENDING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification code has already been used or expired.")

    exp = verification.expires_at.replace(tzinfo=UTC) if verification.expires_at.tzinfo is None else verification.expires_at
    if exp < datetime.now(UTC):
        verification.status = "EXPIRED"
        db.commit()
        raise HTTPException(status.HTTP_410_GONE, "Verification code has expired. Please request a new one.")

    # Update password and invalidate verification record
    user.password_hash = hash_password(payload.new_password)
    verification.status = "USED"
    verification.used_at = datetime.now(UTC)

    # Invalidate existing refresh tokens so user logs in cleanly
    existing_tokens = db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)).scalars().all()
    for tok in existing_tokens:
        tok.revoked = True

    audit.record(db, user, "reset_password", "user", user.id, "Password reset via OTP")
    db.commit()

    return Message(message="Password reset successfully. You can now sign in with your new password.")


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


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Every device/browser the user is currently signed in on.

    One row per active (unrevoked, unexpired) refresh token - which is issued
    fresh on every login and every token refresh - so a login from another
    device or browser shows up here as soon as it happens.
    """
    now = datetime.now(UTC)
    current_raw = request.cookies.get(REFRESH_COOKIE)
    current_hash = hash_token(current_raw) if current_raw else None
    rows = db.execute(
        select(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .order_by(RefreshToken.created_at.desc())
    ).scalars()
    out: list[SessionOut] = []
    for token in rows:
        # Compare in Python (not SQL) since SQLite stores this column as a
        # naive timestamp - see the same pattern in refresh() above.
        if token.expires_at.replace(tzinfo=UTC) < now:
            continue
        info = parse_user_agent(token.user_agent)
        out.append(
            SessionOut(
                id=token.id,
                device=info.device,
                browser=info.browser,
                ip_address=token.ip_address,
                created_at=token.created_at,
                expires_at=token.expires_at,
                is_current=current_hash is not None and token.token_hash == current_hash,
            )
        )
    return out


@router.delete("/sessions/{session_id}", response_model=Message)
def revoke_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sign a single device/browser out remotely."""
    token = db.execute(
        select(RefreshToken).where(RefreshToken.id == session_id, RefreshToken.user_id == user.id)
    ).scalar_one_or_none()
    if token is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    if token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)
        audit.record(db, user, "update", "user", user.id, "Signed out a device from Active Sessions")
        db.commit()
    return Message(message="Session signed out")
