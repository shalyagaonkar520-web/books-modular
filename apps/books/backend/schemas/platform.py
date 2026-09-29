"""Request/response models for the super-admin (platform operator) API."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import EmailStr, Field, field_validator

from backend.schemas.auth import _validate_password
from backend.schemas.common import APIModel


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
# Dashboard
# --------------------------------------------------------------------------- #
class TimePoint(APIModel):
    label: str
    value: float


class PlatformDashboard(APIModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
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
    is_suspended: bool
    suspended_at: Optional[datetime] = None
    suspended_reason: Optional[str] = None
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
    currency: str = Field(default="INR", min_length=3, max_length=3)
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
    is_suspended: Optional[bool] = None
    suspended_reason: Optional[str] = Field(default=None, max_length=500)


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
# Payments (global) & audit
# --------------------------------------------------------------------------- #
class PlatformPaymentOut(APIModel):
    id: str
    kind: str  # "received" | "made"
    number: str
    organization_id: str
    organization_name: Optional[str] = None
    contact_name: Optional[str] = None
    amount: float
    mode: Optional[str] = None
    date: Optional[str] = None
    created_at: datetime


class PlatformPaymentStats(APIModel):
    total_received: float
    total_made: float
    received_count: int
    made_count: int


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


PlatformDashboard.model_rebuild()
OrgDetail.model_rebuild()
CreateOrgResponse.model_rebuild()
