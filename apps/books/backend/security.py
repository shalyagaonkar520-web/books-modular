"""Password hashing and JWT helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, Optional

import jwt
from passlib.context import CryptContext

from backend.config import get_settings

settings = get_settings()
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _pwd_context.verify(password, password_hash)
    except ValueError:
        return False


def create_access_token(
    user_id: str, organization_id: str, role: str, expires_minutes: Optional[int] = None, impersonator: Optional[str] = None
) -> str:
    now = datetime.now(UTC)
    payload: Dict[str, Any] = {
        "sub": user_id,
        "org": organization_id,
        "role": role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    if impersonator:
        # A platform admin working inside this org ("workspace mode"); carried
        # so every change made with this token is attributed to them.
        payload["imp"] = impersonator
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def create_platform_access_token(admin_id: str, expires_minutes: Optional[int] = None) -> str:
    """Access token for a super-admin. A distinct ``type`` means a tenant token
    can never be replayed against the platform API and vice versa."""
    now = datetime.now(UTC)
    payload: Dict[str, Any] = {
        "sub": admin_id,
        "type": "platform_access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_platform_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "platform_access":
        return None
    return payload


def create_org_panel_access_token(admin_id: str, organization_id: str, expires_minutes: Optional[int] = None) -> str:
    """Access token for an organization admin-panel login. Its own ``type``
    keeps it out of the tenant app and the platform API (and theirs out of the
    panel)."""
    now = datetime.now(UTC)
    payload: Dict[str, Any] = {
        "sub": admin_id,
        "org": organization_id,
        "type": "org_panel_access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes or settings.access_token_expire_minutes)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_org_panel_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "org_panel_access":
        return None
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
