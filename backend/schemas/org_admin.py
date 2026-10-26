"""Request/response models for organization admin-panel logins: the panel's
own auth (``/api/org-admin/auth``) and their management by a platform admin
(``/api/platform/.../panel-admins``)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import AliasChoices, EmailStr, Field, field_validator

from backend.schemas.auth import _not_null, _validate_password
from backend.schemas.common import APIModel

# --------------------------------------------------------------------------- #
# Panel auth
# --------------------------------------------------------------------------- #
# A login ID: an email, or an ID such as admin@rooman (no spaces).
LOGIN_ID_PATTERN = r"^[a-z0-9][a-z0-9._@+-]{2,119}$"


def _login_id(value: str) -> str:
    return value.strip().lower()


class OrgPanelLoginRequest(APIModel):
    # "loginId"; "email" is still accepted from older clients.
    login_id: str = Field(min_length=1, max_length=255, validation_alias=AliasChoices("loginId", "login_id", "email"))
    password: str = Field(min_length=1, max_length=255)

    _norm = field_validator("login_id")(classmethod(lambda cls, v: _login_id(v)))


class SetupCredentialsRequest(APIModel):
    """First sign-in (or after a reset): the admin's own login ID and password."""

    login_id: str = Field(pattern=LOGIN_ID_PATTERN)
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    new_password: str = Field(min_length=8, max_length=255)

    @field_validator("login_id", mode="before")
    @classmethod
    def _norm(cls, v):
        return _login_id(v) if isinstance(v, str) else v

    @field_validator("new_password")
    @classmethod
    def _pw(cls, v: str) -> str:
        return _validate_password(v)


class ForgotPanelPasswordRequest(APIModel):
    login_id: str = Field(min_length=1, max_length=255, validation_alias=AliasChoices("loginId", "login_id", "email"))

    _norm = field_validator("login_id")(classmethod(lambda cls, v: _login_id(v)))


class OrgPanelAdminProfile(APIModel):
    id: str
    name: str
    email: str
    organization_id: str
    # True until the admin has chosen their own login ID and password.
    must_change_credentials: bool = False
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
    must_change_credentials: bool = False
    reset_requested_at: Optional[datetime] = None


class PanelTempCredentialsOut(APIModel):
    """A generated login ID and temporary password - shown to the platform admin once."""

    admin: OrgPanelAdminOut
    login_id: str
    password: str


class PanelResetRequestOut(APIModel):
    admin: OrgPanelAdminOut
    organization_id: str
    organization_name: str
    organization_code: Optional[str] = None


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
    # Kept so older clients that still send a body are accepted. The admin-panel
    # login is created separately (POST .../panel-admins/default).
    pass
