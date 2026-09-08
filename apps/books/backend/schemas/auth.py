from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import EmailStr, Field, field_validator

from backend.schemas.common import APIModel

# bcrypt only considers the first 72 bytes of a password, so a longer one would
# silently authenticate from its prefix. Reject those instead of truncating.
MAX_PASSWORD_BYTES = 72


def _validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes long")
    if value.lower() == value or value.upper() == value:
        raise ValueError("Password must contain both upper and lower case letters")
    if not any(ch.isdigit() for ch in value):
        raise ValueError("Password must contain at least one digit")
    return value


class RegisterRequest(APIModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str
    organization_name: str = Field(min_length=2, max_length=200)
    gstin: Optional[str] = Field(default=None, max_length=20)

    @field_validator("password")
    @classmethod
    def _pw(cls, value: str) -> str:
        return _validate_password(value)


class LoginRequest(APIModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(APIModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _pw(cls, value: str) -> str:
        return _validate_password(value)


class UpdateProfileRequest(APIModel):
    name: str = Field(min_length=2, max_length=120)


class UserOut(APIModel):
    id: str
    name: str
    email: str
    role: str
    is_active: bool
    organization_id: str
    last_login_at: Optional[datetime] = None
    created_at: datetime


class OrganizationOut(APIModel):
    id: str
    name: str
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: str
    currency: str
    fiscal_year_start_month: int
    invoice_terms: Optional[str] = None
    invoice_notes: Optional[str] = None


class OrganizationUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    fiscal_year_start_month: Optional[int] = Field(default=None, ge=1, le=12)
    invoice_terms: Optional[str] = None
    invoice_notes: Optional[str] = None


class AuthResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    organization: OrganizationOut


class TokenResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class InviteUserRequest(APIModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    role: str = Field(default="staff", pattern="^(admin|staff|viewer)$")
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, value: str) -> str:
        return _validate_password(value)


class UpdateUserRequest(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    role: Optional[str] = Field(default=None, pattern="^(admin|staff|viewer)$")
    is_active: Optional[bool] = None


class AuditLogOut(APIModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime


class UsersList(APIModel):
    items: List[UserOut]
