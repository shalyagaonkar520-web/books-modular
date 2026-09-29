"""Request/response models for the super-admin (platform operator) API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import EmailStr, Field, field_validator

from backend.schemas import validators
from backend.schemas.auth import _not_null, _validate_password
from backend.schemas.common import APIModel

# ISO 4217 style: exactly three upper-case letters.
_CURRENCY_PATTERN = r"^[A-Z]{3}$"


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class PlatformLoginRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=255)


class PlatformAdminOut(APIModel):
    id: str
    name: str
    email: str
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime


class PlatformTokenResponse(APIModel):
    access_token: str
    admin: PlatformAdminOut


class PlatformAccessToken(APIModel):
    access_token: str


# --------------------------------------------------------------------------- #
# Platform admin management
# --------------------------------------------------------------------------- #
class CreatePlatformAdminRequest(APIModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class UpdatePlatformAdminRequest(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    is_active: Optional[bool] = None


class ChangePlatformPasswordRequest(APIModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
class TimePoint(APIModel):
    label: str
    value: float


class PlatformDashboard(APIModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
    archived_organizations: int
    total_users: int
    active_users: int
    total_invoices: int
    total_invoiced_amount: float
    total_collected_amount: float
    total_bills: int
    total_paid_to_vendors: float
    new_organizations_this_month: int
    organization_growth: List[TimePoint]
    revenue_by_month: List[TimePoint]
    top_organizations: List[OrgSummary]
    recent_activity: List[PlatformAuditOut]


# --------------------------------------------------------------------------- #
# Organizations
# --------------------------------------------------------------------------- #
class OrgSummary(APIModel):
    id: str
    name: str
    is_suspended: bool
    is_archived: bool = False
    deleted_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    user_count: int
    invoice_count: int
    invoiced_amount: float
    collected_amount: float
    created_at: datetime


class OrgDetail(APIModel):
    id: str
    name: str
    legal_name: Optional[str] = None
    gstin: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    country: str
    currency: str
    fiscal_year_start_month: int
    default_tax_rate: float
    default_payment_terms_days: int
    invoice_terms: Optional[str] = None
    invoice_notes: Optional[str] = None
    is_suspended: bool
    suspended_at: Optional[datetime] = None
    suspended_reason: Optional[str] = None
    deleted_at: Optional[datetime] = None
    is_archived: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    user_count: int
    invoice_count: int
    bill_count: int
    contact_count: int
    invoiced_amount: float
    collected_amount: float
    outstanding_receivables: float
    admins: List[PlatformUserOut]


class CreateOrganizationRequest(APIModel):
    name: str = Field(min_length=2, max_length=200)
    gstin: Optional[str] = Field(default=None, max_length=20)
    # Omitted -> the platform's global default currency.
    currency: Optional[str] = Field(default=None, pattern=_CURRENCY_PATTERN)
    country: str = Field(default="India", min_length=2, max_length=100)
    # The first administrator to create for the new org.
    admin_name: str = Field(min_length=2, max_length=120)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=255)

    @field_validator("admin_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class UpdateOrganizationRequest(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    legal_name: Optional[str] = Field(default=None, max_length=200)
    gstin: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    currency: Optional[str] = Field(default=None, pattern=_CURRENCY_PATTERN)
    fiscal_year_start_month: Optional[int] = Field(default=None, ge=1, le=12)
    default_tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    default_payment_terms_days: Optional[int] = Field(default=None, ge=0, le=365)
    invoice_terms: Optional[str] = None
    invoice_notes: Optional[str] = None
    is_suspended: Optional[bool] = None
    suspended_reason: Optional[str] = Field(default=None, max_length=500)

    _required = field_validator(
        "name",
        "currency",
        "fiscal_year_start_month",
        "default_tax_rate",
        "default_payment_terms_days",
        "is_suspended",
    )(_not_null)

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, value):
        # A cleared email box arrives as "" - store that as "no email".
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: Optional[str]) -> Optional[str]:
        return validators.phone(value)

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, value: Optional[str]) -> Optional[str]:
        return validators.gstin(value)


class CreateOrgResponse(APIModel):
    organization: OrgDetail
    admin: PlatformUserOut


# --------------------------------------------------------------------------- #
# Users (across all organizations)
# --------------------------------------------------------------------------- #
class PlatformUserOut(APIModel):
    id: str
    name: str
    email: str
    role: str
    is_active: bool
    organization_id: str
    organization_name: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: datetime


class CreatePlatformUserRequest(APIModel):
    organization_id: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)
    role: str = Field(default="staff")

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        allowed = {"admin", "staff", "viewer"}
        if v not in allowed:
            raise ValueError(f"role must be one of {sorted(allowed)}")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class UpdatePlatformUserRequest(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    role: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        if v is not None and v not in {"admin", "staff", "viewer", "employee"}:
            raise ValueError("invalid role")
        return v


class ResetUserPasswordRequest(APIModel):
    new_password: str = Field(min_length=8, max_length=255)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #
class PlatformAuditOut(APIModel):
    id: str
    organization_id: str
    organization_name: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Impersonation ("view as" a tenant user)
# --------------------------------------------------------------------------- #
class ImpersonateOrg(APIModel):
    id: str
    name: str


class ImpersonateResponse(APIModel):
    access_token: str
    user: PlatformUserOut
    organization: ImpersonateOrg


# --------------------------------------------------------------------------- #
# Org drill-down: invoices
# --------------------------------------------------------------------------- #
class PlatformInvoiceOut(APIModel):
    id: str
    number: str
    customer_name: Optional[str] = None
    date: Optional[str] = None
    due_date: Optional[str] = None
    status: str
    total: float
    amount_paid: float
    balance_due: float


# --------------------------------------------------------------------------- #
# Global search
# --------------------------------------------------------------------------- #
class PlatformSearchResults(APIModel):
    organizations: List[OrgSummary]
    users: List[PlatformUserOut]


# --------------------------------------------------------------------------- #
# Platform settings
# --------------------------------------------------------------------------- #
class PlatformSettingsOut(APIModel):
    allow_public_signup: bool
    environment: str
    razorpay_configured: bool
    smtp_configured: bool
    # Global defaults seeded into every newly created organization.
    default_tax_rate: float
    default_payment_terms_days: int
    default_currency: str


class UpdatePlatformSettingsRequest(APIModel):
    allow_public_signup: Optional[bool] = None
    default_tax_rate: Optional[Decimal] = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    default_payment_terms_days: Optional[int] = Field(default=None, ge=0, le=365)
    default_currency: Optional[str] = Field(default=None, pattern=_CURRENCY_PATTERN)

    _required = field_validator("default_tax_rate", "default_payment_terms_days", "default_currency")(_not_null)


PlatformDashboard.model_rebuild()
OrgDetail.model_rebuild()
CreateOrgResponse.model_rebuild()
