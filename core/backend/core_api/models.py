"""SQLAlchemy models for Rooman One Core: identity and platform data only.

Core owns users, organizations, memberships, roles, plans and the trial,
which apps an organization has, per-user module access, the shared customer
record (parties), the app registry, editable app content and the audit log.
It never holds business data such as invoices or appointments.

IDs are UUIDs (native ``uuid`` on PostgreSQL). Records copied from Rooman
Books keep their IDs: Books stores the same UUIDs as 32 hex characters.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from rooman_sdk.outbox import outbox_table
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from core_api.db import Base

Json = JSON().with_variant(JSONB(), "postgresql")
Money = Numeric(12, 2)

# Organization lifecycle. "pending" and "rejected" come from sign-up approval;
# "suspended" and "archived" are set by a platform admin.
ORG_STATUSES = ("pending", "active", "suspended", "archived", "rejected")
USER_STATUSES = ("active", "invited", "disabled")
MEMBERSHIP_STATUSES = ("active", "invited", "disabled")
BUILT_IN_ROLES = ("admin", "staff", "viewer", "employee")
SUBSCRIPTION_STATUSES = ("trial", "active", "expired", "cancelled")


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# Identity and organizations
# --------------------------------------------------------------------------- #
class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Short unique code ("acme", "acme-2"); the default admin-panel login is admin@<code>.
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(200))
    gstin: Mapped[str | None] = mapped_column(String(20))
    pan: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    country: Mapped[str] = mapped_column(String(100), default="India", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    status_reason: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # NULL while awaiting approval: the trial starts when the org becomes usable.
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class User(TimestampMixin, Base):
    """A person. May belong to several organizations through memberships."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Stored lower-cased; unique across the platform.
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # NULL while an invite is pending. bcrypt (from Books) or Argon2.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    mfa_secret: Mapped[str | None] = mapped_column(String(255))
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    must_change_credentials: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "org_id", name="uq_membership_user_org"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    # Key of a built-in role (org_id NULL in roles) or of one of the org's custom roles.
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)


class Role(TimestampMixin, Base):
    """Built-in roles have org_id NULL; an organization may add its own."""

    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("org_id", "key", name="uq_role_org_key"),
        Index("uq_role_builtin_key", "key", unique=True, postgresql_where=text("org_id IS NULL"), sqlite_where=text("org_id IS NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission", name="uq_permission_role"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    role_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    # e.g. "books.sales.write", "core.users.manage"
    permission: Mapped[str] = mapped_column(String(80), nullable=False)


class PlatformAdmin(TimestampMixin, Base):
    """A Rooman platform operator (super admin). Deliberately not a tenant user:
    a separate table and sign-in, so a compromised tenant account can never
    escalate into cross-tenant control."""

    __tablename__ = "platform_admins"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(255))
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# --------------------------------------------------------------------------- #
# Apps and plans
# --------------------------------------------------------------------------- #
class App(TimestampMixin, Base):
    __tablename__ = "apps"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)  # books | bookings | billing | ...
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | coming_soon | retired


class OrgApp(TimestampMixin, Base):
    __tablename__ = "org_apps"
    __table_args__ = (UniqueConstraint("org_id", "app_key", name="uq_org_app"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    app_key: Mapped[str] = mapped_column(String(40), ForeignKey("apps.key"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | disabled


class Plan(TimestampMixin, Base):
    """A priced catalog for one app. Books sells modules a la carte, so its plan
    is a catalog of modules (plan_modules) with a base price."""

    __tablename__ = "plans"
    __table_args__ = (UniqueConstraint("app_key", "code", name="uq_plan_app_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    app_key: Mapped[str] = mapped_column(String(40), ForeignKey("apps.key"), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    base_monthly_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    yearly_multiplier: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("10"), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(Json, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PlanModule(Base):
    __tablename__ = "plan_modules"
    __table_args__ = (UniqueConstraint("plan_id", "module_key", name="uq_plan_module"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True)
    module_key: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    monthly_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    is_core: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires: Mapped[list[str]] = mapped_column(Json, default=list, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class OrgSubscription(TimestampMixin, Base):
    """An organization's subscription to one app. ``modules`` NULL = every module
    (trial, or an organization from before plans existed)."""

    __tablename__ = "org_subscriptions"
    __table_args__ = (UniqueConstraint("org_id", "app_key", name="uq_subscription_org_app"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    app_key: Mapped[str] = mapped_column(String(40), ForeignKey("apps.key"), nullable=False)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(String(20), default="trial", nullable=False)
    cycle: Mapped[str | None] = mapped_column(String(10))  # monthly | yearly
    modules: Mapped[list[str] | None] = mapped_column(Json)
    monthly_price: Mapped[Decimal | None] = mapped_column(Money)
    cycle_price: Mapped[Decimal | None] = mapped_column(Money)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    renews_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # A plan request waiting for a platform admin: {modules, cycle, monthlyPrice, cyclePrice, requestedAt}
    pending_request: Mapped[dict[str, Any] | None] = mapped_column(Json)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(Text)


class UserModuleAccess(TimestampMixin, Base):
    """Narrows what a non-admin member may edit in one app (NULL row = every module of the plan)."""

    __tablename__ = "user_module_access"
    __table_args__ = (UniqueConstraint("user_id", "org_id", "app_key", name="uq_user_module_access"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    app_key: Mapped[str] = mapped_column(String(40), ForeignKey("apps.key"), nullable=False)
    modules: Mapped[list[str]] = mapped_column(Json, default=list, nullable=False)


# --------------------------------------------------------------------------- #
# Admin panel and content
# --------------------------------------------------------------------------- #
class PanelAdmin(TimestampMixin, Base):
    """A login for one organization's admin panel (admin@<code> or an email)."""

    __tablename__ = "panel_admins"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    login_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(255))
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    must_change_credentials: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reset_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column(String(255))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PanelContentAccess(TimestampMixin, Base):
    """Which parts of the app content an organization's admin panel may edit (NULL = the plan's modules)."""

    __tablename__ = "panel_content_access"

    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    parts: Mapped[list[str] | None] = mapped_column(Json)


class AppContent(TimestampMixin, Base):
    """Editable app texts. org_id NULL = shared content; otherwise one organization's overrides."""

    __tablename__ = "app_content"
    __table_args__ = (
        UniqueConstraint("org_id", "key", name="uq_app_content_org_key"),
        Index(
            "uq_app_content_shared_key", "key", unique=True, postgresql_where=text("org_id IS NULL"), sqlite_where=text("org_id IS NULL")
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False)  # e.g. "books"
    value: Mapped[dict[str, Any]] = mapped_column(Json, nullable=False)


class PlatformSetting(Base):
    """Runtime platform configuration (site content, trial length, sign-up approval, ...)."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# Shared customer record
# --------------------------------------------------------------------------- #
class Party(TimestampMixin, Base):
    """A customer or vendor shared by every app. Deliberately thin: apps keep the details."""

    __tablename__ = "parties"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    type: Mapped[str] = mapped_column(String(20), default="customer", nullable=False)  # customer | vendor | both

    __table_args__ = (
        Index("ix_parties_org_email", "org_id", "email"),
        Index("ix_parties_org_phone", "org_id", "phone"),
    )


class ExternalId(TimestampMixin, Base):
    """Where a party lives in each app (e.g. Books contact id)."""

    __tablename__ = "external_ids"
    __table_args__ = (
        UniqueConstraint("org_id", "app_key", "local_id", name="uq_external_id_app_local"),
        UniqueConstraint("party_id", "app_key", name="uq_external_id_party_app"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    party_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True)
    app_key: Mapped[str] = mapped_column(String(40), ForeignKey("apps.key"), nullable=False)
    local_id: Mapped[str] = mapped_column(String(64), nullable=False)


# --------------------------------------------------------------------------- #
# Integration and audit
# --------------------------------------------------------------------------- #
class OAuthClient(TimestampMixin, Base):
    __tablename__ = "oauth_clients"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    app_key: Mapped[str] = mapped_column(String(40), ForeignKey("apps.key"), nullable=False)
    client_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    # NULL for public clients (browser apps using PKCE only)
    secret_hash: Mapped[str | None] = mapped_column(String(255))
    scopes: Mapped[list[str]] = mapped_column(Json, default=list, nullable=False)
    redirect_uris: Mapped[list[str]] = mapped_column(Json, default=list, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


SIGNING_KEY_STATUSES = ("active", "retiring", "retired")


class SigningKey(Base):
    """An RSA key pair that signs Core's tokens. Exactly one is active at a time.

    "retiring" keys no longer sign but stay in /jwks for the overlap window, so
    tokens they signed keep verifying. The private key is stored encrypted with
    KEY_ENCRYPTION_KEYS and never leaves Core.
    """

    __tablename__ = "signing_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kid: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    algorithm: Mapped[str] = mapped_column(String(10), default="RS256", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    public_jwk: Mapped[dict[str, Any]] = mapped_column(Json, nullable=False)
    private_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    retiring_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    """Every admin action and every sign-in. org_id NULL = a platform-level action."""

    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_org_at", "org_id", "at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(64))
    actor_type: Mapped[str] = mapped_column(String(20), nullable=False)  # user | panel_admin | platform_admin | service | system
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    target: Mapped[str | None] = mapped_column(String(200))
    detail: Mapped[dict[str, Any] | None] = mapped_column(Json)
    ip: Mapped[str | None] = mapped_column(String(64))
    request_id: Mapped[str | None] = mapped_column(String(40))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# Sign-in (OIDC authorization code flow with PKCE)
# --------------------------------------------------------------------------- #
class AuthRequest(Base):
    """An app's sign-in request, kept while the person signs in (10 minutes)."""

    __tablename__ = "auth_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # random, given to the sign-in page
    client_id: Mapped[str] = mapped_column(String(80), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    scope: Mapped[str] = mapped_column(String(200), nullable=False)
    state: Mapped[str | None] = mapped_column(String(500))
    nonce: Mapped[str | None] = mapped_column(String(200))
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserSession(Base):
    """A signed-in browser at Core (the "rooman_sid" cookie). Only its SHA-256 is stored."""

    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))


class AuthCode(Base):
    """A one-time code for an app (60 seconds), bound to its PKCE challenge."""

    __tablename__ = "auth_codes"

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_id: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    scope: Mapped[str] = mapped_column(String(200), nullable=False)
    nonce: Mapped[str | None] = mapped_column(String(200))
    code_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    family_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # refresh family it started (revoked if the code is replayed)


class RefreshToken(Base):
    """Refresh tokens, rotated on every use. Reusing an old one revokes the whole family."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    org_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    scope: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# Transactional outbox for Core's events (org.created, user.invited, ...)
outbox = outbox_table(Base.metadata)
