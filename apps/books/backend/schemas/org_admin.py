"""Request/response models for organization admin-panel logins: the panel's
own auth (``/api/org-admin/auth``) and their management by a platform admin
(``/api/platform/.../panel-admins``)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import EmailStr, Field, field_validator

from backend.schemas.auth import _not_null, _validate_password
from backend.schemas.common import APIModel


# --------------------------------------------------------------------------- #
# Panel auth
# --------------------------------------------------------------------------- #
class OrgPanelLoginRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=255)


class OrgPanelAdminProfile(APIModel):
    id: str
    name: str
    email: str
    organization_id: str
    last_login_at: Optional[datetime] = None
    created_at: datetime


class OrgPanelOrgRef(APIModel):
    id: str
    name: str


class OrgPanelMeOut(APIModel):
    admin: OrgPanelAdminProfile
    organization: OrgPanelOrgRef


class OrgPanelTokenResponse(OrgPanelMeOut):
    access_token: str


class ChangeOrgPanelPasswordRequest(APIModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


# --------------------------------------------------------------------------- #
# Management by a platform admin
# --------------------------------------------------------------------------- #
class OrgPanelAdminOut(APIModel):
    id: str
    name: str
    email: str
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    created_by: Optional[str] = None


class CreateOrgPanelAdminRequest(APIModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=255)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class UpdateOrgPanelAdminRequest(APIModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=255)

    _required = field_validator("name", "email", "is_active", "password")(_not_null)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class ApproveOrganizationRequest(APIModel):
    # Optionally create the organization's first admin-panel login together
    # with the approval (in the same transaction).
    panel_admin: Optional[CreateOrgPanelAdminRequest] = None
