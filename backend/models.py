"""SQLAlchemy ORM models for Rooman Books.

All business tables are scoped by ``organization_id`` (multi-tenant) and use
string UUID primary keys so that the schema is portable between SQLite and
PostgreSQL.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy import false as sa_false
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from backend.db import Base

Money = Numeric(14, 2)
Qty = Numeric(14, 3)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class OrgScopedMixin:
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)


class SourceRefMixin:
    """Which other Rooman app sent a record, and its id there (NULL = made in Books).

    Kept from the Books that ran inside Rooman One (revision f2a6c8e1d4b7), so
    its database upgrades here and its rows keep their origin.
    """

    source_app: Mapped[Optional[str]] = mapped_column(String(20))
    source_ref: Mapped[Optional[str]] = mapped_column(String(64))


# --------------------------------------------------------------------------- #
# Identity & tenancy
# --------------------------------------------------------------------------- #
class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Short unique code derived from the name ("rooman", "rooman-2"); the
    # default admin-panel login is admin@<code>. Assigned on insert.
    code: Mapped[Optional[str]] = mapped_column(String(40), unique=True, index=True)
    # Which parts of the app content its admin panel may edit (JSON list of
    # module keys plus "branding" / "general"); NULL = the plan's modules.
    # See services/panel_content.
    panel_content_access: Mapped[Optional[str]] = mapped_column(Text)
    legal_name: Mapped[Optional[str]] = mapped_column(String(200))
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    pan: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    address: Mapped[Optional[str]] = mapped_column(Text)
    city: Mapped[Optional[str]] = mapped_column(String(100))
    state: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(100), default="India", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    invoice_terms: Mapped[Optional[str]] = mapped_column(Text)
    invoice_notes: Mapped[Optional[str]] = mapped_column(Text)
    # Org-wide defaults applied to new documents (seeded from the platform's
    # global defaults when the org is created).
    default_tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("18"), nullable=False)
    default_payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    # Books are closed up to and including this date: nothing may be posted,
    # edited, voided or deleted on or before it (enforced in services/ledger).
    lock_date: Mapped[Optional[date]] = mapped_column(Date)
    # Invoices / bills at or above these totals need an admin's approval
    # before they post (services/approvals); null = no approval needed.
    invoice_approval_threshold: Mapped[Optional[Decimal]] = mapped_column(Money)
    bill_approval_threshold: Mapped[Optional[Decimal]] = mapped_column(Money)
    # Document branding (PDFs and the customer portal).
    brand_color: Mapped[Optional[str]] = mapped_column(String(7))
    logo_url: Mapped[Optional[str]] = mapped_column(String(500))
    document_footer: Mapped[Optional[str]] = mapped_column(Text)
    signature_label: Mapped[Optional[str]] = mapped_column(String(120))
    # Default reimbursement per km for mileage claims.
    mileage_rate: Mapped[Optional[Decimal]] = mapped_column(Money)
    # UPI ID printed as a pay-by-QR code on invoices (e.g. business@okhdfcbank).
    upi_id: Mapped[Optional[str]] = mapped_column(String(100))
    # Point of Sale: where UPI / card takings go (null = Petty Cash, like cash),
    # whether the counter may sell below zero stock, and the receipt's top and
    # bottom lines.
    pos_bank_account_id: Mapped[Optional[str]] = mapped_column(String(32))
    pos_allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false(), nullable=False)
    pos_receipt_header: Mapped[Optional[str]] = mapped_column(Text)
    pos_receipt_footer: Mapped[Optional[str]] = mapped_column(Text)
    # Platform-level suspension: set by a super-admin. A suspended org's users
    # are locked out (enforced in get_current_user) but its data is retained.
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    suspended_reason: Mapped[Optional[str]] = mapped_column(Text)
    # Soft delete ("archive") by a super-admin: the org is also suspended so its
    # users are locked out, but every row is kept and it can be restored.
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Sign-up approval by a super-admin: approved | pending | rejected. Users of
    # a non-approved org cannot sign in (enforced in auth login/refresh and
    # get_current_user). Existing and platform-created orgs are approved.
    approval_status: Mapped[str] = mapped_column(String(20), default="approved", server_default="approved", nullable=False)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    # Subscription (see services/subscription). A new organization gets a free
    # trial of every module, starting when it becomes usable (at approval, or at
    # sign-up without the approval gate); while it waits for approval
    # trial_ends_at is NULL. Its admin then requests a plan (modules + billing
    # cycle), which a super-admin accepts or rejects.
    #   * subscription_status: "trial" | "active". "expired" is derived at read
    #     time, never stored: not active and the trial is over. Such an org is
    #     locked out of the app (HTTP 402) until a plan is accepted.
    #   * pending_request: JSON {modules, billingCycle, monthlyPrice, planPrice,
    #     requestedAt} of a request waiting for a super-admin (NULL = none),
    #     both for a first plan and for a change to an active one;
    #     subscription_requested_at mirrors its time (for sorting).
    #   * requested_modules (JSON list of module keys), billing_cycle
    #     ("monthly" | "yearly"), monthly_price and plan_price (price per
    #     cycle): the ACTIVE plan, NULL while on trial.
    #   * subscription_decided_at / subscription_note: when the last request
    #     was accepted or rejected, and the last rejection reason.
    # Organizations from before subscriptions are "active" with no plan: every
    # module, no price.
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    subscription_status: Mapped[str] = mapped_column(String(20), default="active", server_default="active", nullable=False)
    pending_request: Mapped[Optional[str]] = mapped_column(Text)
    subscription_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    subscription_decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    subscription_note: Mapped[Optional[str]] = mapped_column(Text)
    requested_modules: Mapped[Optional[str]] = mapped_column(Text)
    billing_cycle: Mapped[Optional[str]] = mapped_column(String(10))
    monthly_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    plan_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))

    @property
    def is_archived(self) -> bool:
        return self.deleted_at is not None

    @property
    def is_approved(self) -> bool:
        return self.approval_status == "approved"

    users: Mapped[List[User]] = relationship(back_populates="organization")


class User(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Null while an email invite is pending acceptance - the invitee has no
    # password yet and cannot log in until they set one via the invite link.
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="staff", nullable=False)  # admin | staff | viewer | employee
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    invite_token_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    invite_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Modules (module_pricing keys) this user may edit, as a JSON list; NULL =
    # every module of the organization's plan. Set from the org admin panel;
    # ignored for admins. See deps.require_module.
    module_access: Mapped[Optional[str]] = mapped_column(Text)

    organization: Mapped[Organization] = relationship(back_populates="users")

    @property
    def pending_invite(self) -> bool:
        """No password yet: the emailed invite has not been accepted."""
        return self.password_hash is None


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))


class PlatformAdmin(TimestampMixin, Base):
    """A super-admin / platform operator. Deliberately NOT a tenant ``User``:
    it has no ``organization_id`` and its own auth, so a compromised tenant
    admin can never escalate into cross-tenant control."""

    __tablename__ = "platform_admins"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class PlatformRefreshToken(Base):
    __tablename__ = "platform_refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    admin_id: Mapped[str] = mapped_column(String(32), ForeignKey("platform_admins.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))


class OrgPanelAdmin(TimestampMixin, OrgScopedMixin, Base):
    """A login for one organization's admin panel (``/api/org-admin``).

    Created only by a platform admin (typically while approving the org's
    sign-up). Deliberately NOT a tenant ``User``: it has its own auth and token
    type, can only use the org admin panel, and only for its own organization.
    Its email is a separate namespace, so the same address may also belong to
    a tenant user or a platform admin. The ``email`` column holds the login ID,
    which is an email or an ID such as ``admin@rooman``.
    """

    __tablename__ = "org_panel_admins"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Email of the platform admin who created this login.
    created_by: Mapped[Optional[str]] = mapped_column(String(255))
    # Set for a default login (admin@<code>, random password) and after a
    # password reset: the admin must choose their own ID and password before
    # using the panel.
    must_change_credentials: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # When the admin asked the platform admin for a password reset (pending).
    reset_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    organization: Mapped[Organization] = relationship()

    @property
    def audit_name(self) -> str:
        """How this admin's changes are attributed in the org's audit log."""
        return f"{self.name} (org admin panel)"


class OrgPanelRefreshToken(Base):
    __tablename__ = "org_panel_refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    admin_id: Mapped[str] = mapped_column(String(32), ForeignKey("org_panel_admins.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))


class PlatformSetting(Base):
    """A single runtime configuration value owned by the platform operator.

    Stored as a string keyed by ``key`` so a super-admin can toggle behaviour
    (e.g. public tenant signup) without an env change or redeploy. Values are
    coerced by the ``platform_settings`` service, not the column type.
    """

    __tablename__ = "platform_settings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)  # PENDING | VERIFIED | EXPIRED | USED
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class DocumentSequence(Base):
    """Per-organization running numbers for invoices, bills, payments, etc."""

    __tablename__ = "document_sequences"
    __table_args__ = (UniqueConstraint("organization_id", "kind", name="uq_sequence_org_kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    prefix: Mapped[str] = mapped_column(String(10), nullable=False)
    next_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(String(32))
    user_name: Mapped[Optional[str]] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(40), nullable=False)  # create | update | delete | login ...
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64))
    summary: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# Chart of accounts & journal
# --------------------------------------------------------------------------- #
class Account(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_account_org_code"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # asset | liability | equity | income | expense
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    # finer grained: bank, cash, accounts_receivable, accounts_payable, inventory, tax, cogs, other_income ...
    subtype: Mapped[Optional[str]] = mapped_column(String(40))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class JournalEntry(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "journal_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    entry_number: Mapped[str] = mapped_column(String(30), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    # manual | invoice | customer_payment | bill | vendor_payment | expense | payroll | inventory_adjustment
    source_type: Mapped[str] = mapped_column(String(40), default="manual", nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    is_reversal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    # Set on manual journals created by a recurring profile.
    recurring_profile_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    # Branch / location for reporting (P&L by branch); null = none.
    branch_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)

    lines: Mapped[List[JournalLine]] = relationship(back_populates="entry", cascade="all, delete-orphan", order_by="JournalLine.position")


class JournalLine(Base):
    __tablename__ = "journal_lines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    entry_id: Mapped[str] = mapped_column(String(32), ForeignKey("journal_entries.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[str] = mapped_column(String(32), ForeignKey("accounts.id"), index=True, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    debit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    contact_id: Mapped[Optional[str]] = mapped_column(String(32))

    entry: Mapped[JournalEntry] = relationship(back_populates="lines")
    account: Mapped[Account] = relationship()


# --------------------------------------------------------------------------- #
# Items & contacts
# --------------------------------------------------------------------------- #
class Item(TimestampMixin, OrgScopedMixin, SourceRefMixin, Base):
    __tablename__ = "items"
    __table_args__ = (
        UniqueConstraint("organization_id", "sku", name="uq_item_org_sku"),
        # A barcode is unique within an organization when set; items without one are not compared.
        Index(
            "uq_item_org_barcode",
            "organization_id",
            "barcode",
            unique=True,
            postgresql_where=text("barcode IS NOT NULL"),
            sqlite_where=text("barcode IS NOT NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(10), default="goods", nullable=False)  # goods | service
    sku: Mapped[str] = mapped_column(String(50), nullable=False)
    # Printed barcode (EAN-13, UPC, Code 128...) scanned at the Point of Sale counter.
    barcode: Mapped[Optional[str]] = mapped_column(String(64))
    unit: Mapped[str] = mapped_column(String(20), default="pcs", nullable=False)
    hsn_sac: Mapped[Optional[str]] = mapped_column(String(20))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    selling_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    sales_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    sales_description: Mapped[Optional[str]] = mapped_column(Text)

    cost_price: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    purchase_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    purchase_description: Mapped[Optional[str]] = mapped_column(Text)
    preferred_vendor_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"))

    track_inventory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Every unit carries its own serial number (services/stock).
    track_serial: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false(), nullable=False)
    opening_stock: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    opening_stock_rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    stock_on_hand: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    reorder_level: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    warehouse_location: Mapped[Optional[str]] = mapped_column(String(120))

    sales_account: Mapped[Optional[Account]] = relationship(foreign_keys=[sales_account_id])
    purchase_account: Mapped[Optional[Account]] = relationship(foreign_keys=[purchase_account_id])
    preferred_vendor: Mapped[Optional[Contact]] = relationship(foreign_keys=[preferred_vendor_id])


class Contact(TimestampMixin, OrgScopedMixin, SourceRefMixin, Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # customer | vendor
    # A business is billed under its company name, an individual under their own.
    contact_type: Mapped[str] = mapped_column(String(12), default="business", nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_name: Mapped[Optional[str]] = mapped_column(String(200))
    # The person to talk to, entered in parts. contact_person stays the single
    # display form every existing screen and PDF already reads, and is kept in
    # step with these by the contacts router.
    salutation: Mapped[Optional[str]] = mapped_column(String(10))
    first_name: Mapped[Optional[str]] = mapped_column(String(60))
    last_name: Mapped[Optional[str]] = mapped_column(String(60))
    contact_person: Mapped[Optional[str]] = mapped_column(String(120))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    # phone is the landline/work number; mobile is separate, as on the invoice
    # and statement templates where only one of the two belongs.
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    mobile: Mapped[Optional[str]] = mapped_column(String(40))
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    pan: Mapped[Optional[str]] = mapped_column(String(20))
    # Where a vendor gets paid. Held per contact so a payment run does not need
    # the details re-keyed each time.
    bank_account_holder: Mapped[Optional[str]] = mapped_column(String(120))
    bank_name: Mapped[Optional[str]] = mapped_column(String(120))
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(40))
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(20))
    gst_treatment: Mapped[str] = mapped_column(String(30), default="unregistered", nullable=False)
    # GST state code (services/gst.STATE_CODES) of where supplies to / from this
    # contact take place; null = taken from its GSTIN.
    place_of_supply: Mapped[Optional[str]] = mapped_column(String(2))
    # Currency its invoices / bills are raised in; null = the base currency.
    currency: Mapped[Optional[str]] = mapped_column(String(3))
    # Price list suggested on its documents (inventory_ops.price_lists_router).
    price_list_id: Mapped[Optional[str]] = mapped_column(String(32))
    language: Mapped[Optional[str]] = mapped_column(String(40))
    # Overrides the org-wide receivables (1100) / payables (2000) account when
    # this contact's invoices or bills are posted. Null keeps the default.
    ledger_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    # Rooman One's party id for the contact (revision e5b9d2f7a1c3); unused here.
    party_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    party_sync_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false(), nullable=False)
    billing_address: Mapped[Optional[str]] = mapped_column(Text)
    shipping_address: Mapped[Optional[str]] = mapped_column(Text)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    ledger_account: Mapped[Optional[Account]] = relationship(foreign_keys=[ledger_account_id])


class InventoryAdjustment(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "inventory_adjustments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    adjustment_number: Mapped[str] = mapped_column(String(30), nullable=False)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity_delta: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    # Warehouse its stock moves from / into; null = the default warehouse.
    warehouse_id: Mapped[Optional[str]] = mapped_column(
        String(32), ForeignKey("warehouses.id", name="fk_inventory_adjustments_warehouse_id")
    )

    item: Mapped[Item] = relationship()


# --------------------------------------------------------------------------- #
# Sales
# --------------------------------------------------------------------------- #
class Invoice(TimestampMixin, OrgScopedMixin, SourceRefMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("organization_id", "invoice_number", name="uq_invoice_org_number"),
        UniqueConstraint("share_token", name="uq_invoices_share_token"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    invoice_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("projects.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    # draft | sent | partially_paid | paid | void  (overdue is derived)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    # The customer's own purchase order number, their line on the invoice.
    order_number: Mapped[Optional[str]] = mapped_column(String(120))
    # One-line description of what the invoice covers, printed above the items.
    subject: Mapped[Optional[str]] = mapped_column(String(250))
    salesperson: Mapped[Optional[str]] = mapped_column(String(120))
    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    terms: Mapped[Optional[str]] = mapped_column(Text)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    # Set by the automated overdue chaser so it never mails the same customer twice in a day.
    last_reminder_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reminder_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # GST: place of supply (state code; null = the customer's), TCS collected
    # on top of the total (section 206C), and e-invoice / e-way bill numbers
    # once registered on the government portals.
    place_of_supply: Mapped[Optional[str]] = mapped_column(String(2))
    tcs_rate: Mapped[Decimal] = mapped_column(Numeric(5, 3), default=Decimal("0"), server_default="0", nullable=False)
    tcs_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    irn: Mapped[Optional[str]] = mapped_column(String(64))
    irn_ack_no: Mapped[Optional[str]] = mapped_column(String(30))
    irn_ack_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    eway_bill_no: Mapped[Optional[str]] = mapped_column(String(20))
    # Foreign currency (services/fx): the amounts above are always in the base
    # currency; these hold the document's own currency figures and the rate
    # (base per unit) it was booked at. For base-currency documents they
    # mirror the base amounts and the rate is 1.
    currency: Mapped[Optional[str]] = mapped_column(String(3))
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(14, 6), default=Decimal("1"), server_default="1", nullable=False)
    fc_subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_tax_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_amount_paid: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    # Warehouse its stock moves from / into; null = the default warehouse.
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("warehouses.id", name="fk_invoices_warehouse_id"))
    # Approval (services/approvals): pending | approved | rejected; null = not asked.
    approval_status: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    approval_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[Optional[str]] = mapped_column(String(32))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # What the PDF is titled: null = Tax Invoice; "bill_of_supply" for exempt goods
    # or a composition dealer (no GST may be charged on it).
    document_type: Mapped[Optional[str]] = mapped_column(String(20))
    approved_total: Mapped[Optional[Decimal]] = mapped_column(Money)
    approval_note: Mapped[Optional[str]] = mapped_column(String(500))
    # Customer portal link token (routers/portal); null = not shared.
    share_token: Mapped[Optional[str]] = mapped_column(String(64))
    # Branch / location for reporting (P&L by branch); null = none.
    branch_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    # Set when the invoice was generated by a recurring profile.
    recurring_profile_id: Mapped[Optional[str]] = mapped_column(
        String(32), ForeignKey("recurring_profiles.id", ondelete="SET NULL", name="fk_invoices_recurring_profile_id"), index=True
    )

    customer: Mapped[Contact] = relationship()
    lines: Mapped[List[InvoiceLine]] = relationship(back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLine.position")
    payments: Mapped[List[CustomerPayment]] = relationship(back_populates="invoice")

    @property
    def balance_due(self) -> Decimal:
        return (self.total or Decimal("0")) - (self.amount_paid or Decimal("0"))


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    invoice_id: Mapped[str] = mapped_column(String(32), ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("items.id"))
    account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("1"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)  # before tax
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # The line in the document's currency (see Invoice.currency).
    fc_rate: Mapped[Optional[Decimal]] = mapped_column(Money)
    fc_amount: Mapped[Optional[Decimal]] = mapped_column(Money)
    # Batch the goods were sold from (inventory batches).
    batch_number: Mapped[Optional[str]] = mapped_column(String(60))
    # Serial numbers sold, comma separated.
    serial_numbers: Mapped[Optional[str]] = mapped_column(Text)

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    item: Mapped[Optional[Item]] = relationship()


class CustomerPayment(TimestampMixin, OrgScopedMixin, SourceRefMixin, Base):
    __tablename__ = "customer_payments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    payment_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id"), index=True)
    bank_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="bank_transfer", nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    # Foreign-currency payment: fc_amount at exchange_rate. amount is what the
    # bank moved (base); applied_amount is the base value cleared off the
    # document at its own rate (null = amount). The difference is exchange gain/loss.
    currency: Mapped[Optional[str]] = mapped_column(String(3))
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(14, 6), default=Decimal("1"), server_default="1", nullable=False)
    fc_amount: Mapped[Optional[Decimal]] = mapped_column(Money)
    applied_amount: Mapped[Optional[Decimal]] = mapped_column(Money)

    customer: Mapped[Contact] = relationship()
    invoice: Mapped[Optional[Invoice]] = relationship(back_populates="payments")
    bank_account: Mapped[BankAccount] = relationship()


class PosSale(TimestampMixin, OrgScopedMixin, Base):
    """A sale at the counter: an invoice and its payment, made in one go.

    ``client_sale_id`` is generated by the till before it sends the sale, so a
    retry after a dropped connection finds the sale already made instead of
    charging the customer twice.
    """

    __tablename__ = "pos_sales"
    __table_args__ = (UniqueConstraint("organization_id", "client_sale_id", name="uq_pos_sale_org_client"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    client_sale_id: Mapped[str] = mapped_column(String(64), nullable=False)
    invoice_id: Mapped[str] = mapped_column(String(32), ForeignKey("invoices.id"), nullable=False)
    payment_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("customer_payments.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)  # cash | upi | card
    total: Mapped[Decimal] = mapped_column(Money, nullable=False)
    tendered: Mapped[Decimal] = mapped_column(Money, nullable=False)
    change_due: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    # Value of goods brought back since (credit notes against the invoice).
    returned_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    cashier_id: Mapped[Optional[str]] = mapped_column(String(32))

    invoice: Mapped[Invoice] = relationship()
    payment: Mapped[Optional[CustomerPayment]] = relationship()


class PosScannerSession(TimestampMixin, OrgScopedMixin, Base):
    """A phone lent to a counter as its barcode scanner.

    The counter opens a session and shows its link as a QR code. The link
    carries a secret key (only its SHA-256 is kept), so the phone needs no
    sign-in: whoever holds the key may look items up, add new ones and send
    codes to that counter's bill until the session ends (12 hours, or the
    counter disconnects). The counter picks the codes up from pos_scans.
    """

    __tablename__ = "pos_scanner_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    token_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    # sale: scans go onto the counter's bill. items: the phone adds stock or creates items (Items screen).
    purpose: Mapped[str] = mapped_column(String(10), default="sale", server_default="sale", nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # When a phone first opened it (phone_user_id: kept from sign-in phones; unused now).
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    phone_user_id: Mapped[Optional[str]] = mapped_column(String(32))
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_seq: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)


class PosScan(Base):
    """One code a phone scanned for a counter, numbered in order within its session."""

    __tablename__ = "pos_scans"
    __table_args__ = (UniqueConstraint("session_id", "seq", name="uq_pos_scan_session_seq"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    session_id: Mapped[str] = mapped_column(String(32), ForeignKey("pos_scanner_sessions.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("1"), server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# Purchases
# --------------------------------------------------------------------------- #
class Bill(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "bills"
    __table_args__ = (UniqueConstraint("organization_id", "bill_number", name="uq_bill_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    bill_number: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor_bill_number: Mapped[Optional[str]] = mapped_column(String(60))
    # Our purchase order number, and a one-line description of the bill.
    order_number: Mapped[Optional[str]] = mapped_column(String(120))
    subject: Mapped[Optional[str]] = mapped_column(String(250))
    vendor_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    # draft | open | partially_paid | paid | void
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    recurring_profile_id: Mapped[Optional[str]] = mapped_column(
        String(32), ForeignKey("recurring_profiles.id", ondelete="SET NULL", name="fk_bills_recurring_profile_id"), index=True
    )
    # Warehouse its stock moves from / into; null = the default warehouse.
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("warehouses.id", name="fk_bills_warehouse_id"))
    # Approval (services/approvals): pending | approved | rejected; null = not asked.
    approval_status: Mapped[Optional[str]] = mapped_column(String(20), index=True)
    approval_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[Optional[str]] = mapped_column(String(32))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_total: Mapped[Optional[Decimal]] = mapped_column(Money)
    approval_note: Mapped[Optional[str]] = mapped_column(String(500))
    # Branch / location for reporting (P&L by branch); null = none.
    branch_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    # Project the cost belongs to (project profitability).
    project_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    # GST: place of supply, and whether tax is paid by us under reverse charge
    # (the vendor's bill then carries no GST to pay them). TDS (Income-tax
    # section and rate) is withheld from the vendor and owed to the government;
    # total is what the vendor is paid, after TDS.
    place_of_supply: Mapped[Optional[str]] = mapped_column(String(2))
    reverse_charge: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sa_false(), nullable=False)
    tds_section: Mapped[Optional[str]] = mapped_column(String(20))
    tds_rate: Mapped[Decimal] = mapped_column(Numeric(5, 3), default=Decimal("0"), server_default="0", nullable=False)
    tds_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    # Foreign currency (services/fx): the amounts above are always in the base
    # currency; these hold the document's own currency figures and the rate
    # (base per unit) it was booked at. For base-currency documents they
    # mirror the base amounts and the rate is 1.
    currency: Mapped[Optional[str]] = mapped_column(String(3))
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(14, 6), default=Decimal("1"), server_default="1", nullable=False)
    fc_subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_tax_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    fc_amount_paid: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)

    vendor: Mapped[Contact] = relationship()
    lines: Mapped[List[BillLine]] = relationship(back_populates="bill", cascade="all, delete-orphan", order_by="BillLine.position")
    payments: Mapped[List[VendorPayment]] = relationship(back_populates="bill")

    @property
    def balance_due(self) -> Decimal:
        return (self.total or Decimal("0")) - (self.amount_paid or Decimal("0"))


class BillLine(Base):
    __tablename__ = "bill_lines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    bill_id: Mapped[str] = mapped_column(String(32), ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("items.id"))
    account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("1"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)

    # The line in the document's currency (see Invoice.currency).
    fc_rate: Mapped[Optional[Decimal]] = mapped_column(Money)
    fc_amount: Mapped[Optional[Decimal]] = mapped_column(Money)
    # Batch received, and its expiry.
    batch_number: Mapped[Optional[str]] = mapped_column(String(60))
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    # Serial numbers received, comma separated.
    serial_numbers: Mapped[Optional[str]] = mapped_column(Text)

    bill: Mapped[Bill] = relationship(back_populates="lines")
    item: Mapped[Optional[Item]] = relationship()


class VendorPayment(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "vendor_payments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    payment_number: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    bill_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("bills.id"), index=True)
    bank_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="bank_transfer", nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    # Foreign-currency payment: fc_amount at exchange_rate. amount is what the
    # bank moved (base); applied_amount is the base value cleared off the
    # document at its own rate (null = amount). The difference is exchange gain/loss.
    currency: Mapped[Optional[str]] = mapped_column(String(3))
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(14, 6), default=Decimal("1"), server_default="1", nullable=False)
    fc_amount: Mapped[Optional[Decimal]] = mapped_column(Money)
    applied_amount: Mapped[Optional[Decimal]] = mapped_column(Money)

    vendor: Mapped[Contact] = relationship()
    bill: Mapped[Optional[Bill]] = relationship(back_populates="payments")
    bank_account: Mapped[BankAccount] = relationship()


class Expense(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    expense_number: Mapped[str] = mapped_column(String(30), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(32), ForeignKey("accounts.id"), nullable=False)
    paid_through_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id"), nullable=False)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"))
    customer_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"))
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="Other", nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), default="bank_transfer", nullable=False)
    receipt_url: Mapped[Optional[str]] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), default="paid", nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    # Branch / location for reporting (P&L by branch); null = none.
    branch_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    # Mileage claims: distance travelled and the rate per km it was paid at.
    distance_km: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    rate_per_km: Mapped[Optional[Decimal]] = mapped_column(Money)

    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    paid_through: Mapped[BankAccount] = relationship()
    vendor: Mapped[Optional[Contact]] = relationship(foreign_keys=[vendor_id])
    customer: Mapped[Optional[Contact]] = relationship(foreign_keys=[customer_id])


# --------------------------------------------------------------------------- #
# Banking
# --------------------------------------------------------------------------- #
class BankAccount(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[str] = mapped_column(String(20), default="bank", nullable=False)  # bank | cash | credit_card
    bank_name: Mapped[Optional[str]] = mapped_column(String(120))
    account_number: Mapped[Optional[str]] = mapped_column(String(40))
    ifsc: Mapped[Optional[str]] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    opening_balance_date: Mapped[date] = mapped_column(Date, nullable=False)
    ledger_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("accounts.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    ledger_account: Mapped[Account] = relationship()
    transactions: Mapped[List[BankTransaction]] = relationship(back_populates="bank_account")


class BankTransaction(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "bank_transactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    bank_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # deposit | withdrawal
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    # customer_payment | vendor_payment | expense | payroll | transfer | manual
    source_type: Mapped[str] = mapped_column(String(30), default="manual", nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    counter_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    is_reconciled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reconciled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(32))
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    bank_account: Mapped[BankAccount] = relationship(back_populates="transactions")


# --------------------------------------------------------------------------- #
# Time tracking
# --------------------------------------------------------------------------- #
class Project(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"))
    description: Mapped[Optional[str]] = mapped_column(Text)
    # fixed | hourly
    billing_method: Mapped[str] = mapped_column(String(20), default="hourly", nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    budget_hours: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    # What an hour of work costs the business (project profitability).
    cost_rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), server_default="0", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active | completed | on_hold

    customer: Mapped[Optional[Contact]] = relationship()
    time_entries: Mapped[List[TimeEntry]] = relationship(back_populates="project", cascade="all, delete-orphan")


class TimeEntry(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "time_entries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(String(32), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hours: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id"))

    project: Mapped[Project] = relationship(back_populates="time_entries")
    user: Mapped[User] = relationship()


# --------------------------------------------------------------------------- #
# Documents
# --------------------------------------------------------------------------- #
class Document(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(60), default="general", nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    linked_entity_type: Mapped[Optional[str]] = mapped_column(String(40))
    linked_entity_id: Mapped[Optional[str]] = mapped_column(String(32))
    uploaded_by: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("users.id"))

    uploader: Mapped[Optional[User]] = relationship()


# --------------------------------------------------------------------------- #
# Payroll
# --------------------------------------------------------------------------- #
class Employee(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (UniqueConstraint("organization_id", "employee_code", name="uq_employee_org_code"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    employee_code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    designation: Mapped[Optional[str]] = mapped_column(String(120))
    department: Mapped[Optional[str]] = mapped_column(String(120))
    date_of_joining: Mapped[date] = mapped_column(Date, nullable=False)
    # Day of the month salary is paid (1-31; a value past the month's actual
    # length clamps to its last day). Null means "the last day of the month" -
    # the common default - so existing employees need no backfill.
    salary_day: Mapped[Optional[int]] = mapped_column(Integer)
    pan: Mapped[Optional[str]] = mapped_column(String(20))
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(40))
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(20))
    basic_salary: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    hra: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    other_allowances: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    pf_employee: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    professional_tax: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tds: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Set once this employee has been invited to the self-service portal and
    # accepted - lets them log in (role=employee) and see only their own
    # payslips and profile. Null until then; SET NULL if that login is removed.
    user_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), unique=True, index=True)

    user: Mapped[Optional[User]] = relationship()


class LeaveRecord(TimestampMixin, OrgScopedMixin, Base):
    """One day an employee was on leave. Feeds loss-of-pay when a pay run is
    created for the period it falls in, unless the admin overrides that
    employee's LOP days by hand."""

    __tablename__ = "leave_records"
    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_leave_employee_date"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    employee_id: Mapped[str] = mapped_column(String(32), ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    leave_type: Mapped[str] = mapped_column(String(20), default="unpaid", nullable=False)  # paid | unpaid
    notes: Mapped[Optional[str]] = mapped_column(String(255))
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    employee: Mapped[Employee] = relationship()


class PayRun(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "pay_runs"
    __table_args__ = (UniqueConstraint("organization_id", "period_year", "period_month", name="uq_payrun_period"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft | approved | paid
    pay_date: Mapped[Optional[date]] = mapped_column(Date)
    bank_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("bank_accounts.id"))
    total_gross: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_deductions: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_net: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    payslips: Mapped[List[Payslip]] = relationship(back_populates="pay_run", cascade="all, delete-orphan")


class Payslip(Base):
    __tablename__ = "payslips"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    pay_run_id: Mapped[str] = mapped_column(String(32), ForeignKey("pay_runs.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[str] = mapped_column(String(32), ForeignKey("employees.id"), nullable=False, index=True)
    basic_salary: Mapped[Decimal] = mapped_column(Money, nullable=False)
    hra: Mapped[Decimal] = mapped_column(Money, nullable=False)
    other_allowances: Mapped[Decimal] = mapped_column(Money, nullable=False)
    gross: Mapped[Decimal] = mapped_column(Money, nullable=False)
    pf_employee: Mapped[Decimal] = mapped_column(Money, nullable=False)
    professional_tax: Mapped[Decimal] = mapped_column(Money, nullable=False)
    tds: Mapped[Decimal] = mapped_column(Money, nullable=False)
    loss_of_pay_days: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)
    loss_of_pay_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total_deductions: Mapped[Decimal] = mapped_column(Money, nullable=False)
    net_pay: Mapped[Decimal] = mapped_column(Money, nullable=False)

    pay_run: Mapped[PayRun] = relationship(back_populates="payslips")
    employee: Mapped[Employee] = relationship()


Index("ix_invoices_org_status_due", Invoice.organization_id, Invoice.status, Invoice.due_date)
Index("ix_bills_org_status_due", Bill.organization_id, Bill.status, Bill.due_date)


# --------------------------------------------------------------------------- #
# Razorpay, Refunds, Settlements & Financial Ledger
# --------------------------------------------------------------------------- #
class PaymentRecord(TimestampMixin, OrgScopedMixin, Base):
    """Razorpay payments record linked to internal payments and invoices.

    ``razorpay_payment_id`` is globally unique: the same Razorpay payment can
    never be imported twice, whichever path (checkout, webhook or sync) sees it
    first.
    """

    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("razorpay_payment_id", name="uq_payments_razorpay_payment_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    razorpay_order_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    razorpay_payment_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    razorpay_invoice_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    razorpay_signature: Mapped[Optional[str]] = mapped_column(String(255))
    customer_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"), index=True)
    sales_order_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id"), index=True)
    customer_payment_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("customer_payments.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    payment_method: Mapped[str] = mapped_column(
        String(40), default="card", nullable=False
    )  # upi | card | netbanking | wallet | emi | other
    payment_status: Mapped[str] = mapped_column(
        String(30), default="captured", nullable=False, index=True
    )  # created | authorized | captured | failed | refunded | partially_refunded
    mode: Mapped[str] = mapped_column(String(10), default="test", nullable=False)  # test | live
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    refund_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    razorpay_fee: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_on_fee: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    net_settlement: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    settlement_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(100))
    error_description: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    # --- Synchronisation & bookkeeping metadata ---------------------------- #
    # Contact details as Razorpay reported them. Kept alongside customer_id so a
    # payment stays readable even when it could not be linked to a Contact.
    customer_name: Mapped[Optional[str]] = mapped_column(String(200))
    customer_email: Mapped[Optional[str]] = mapped_column(String(255))
    customer_contact: Mapped[Optional[str]] = mapped_column(String(40))
    description: Mapped[Optional[str]] = mapped_column(String(500))
    # Instrument hints only. Never a full card number, CVV, OTP or credential.
    method_detail: Mapped[Optional[str]] = mapped_column(String(160))
    transaction_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    source: Mapped[str] = mapped_column(String(20), default="checkout", nullable=False)  # checkout | webhook | sync
    category: Mapped[Optional[str]] = mapped_column(String(60), index=True)
    category_source: Mapped[Optional[str]] = mapped_column(String(20))  # rule | invoice | description | auto | manual
    category_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    category_status: Mapped[str] = mapped_column(String(20), default="suggested", nullable=False)  # suggested | accepted
    ledger_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    reconciliation_status: Mapped[str] = mapped_column(
        String(20), default="unmatched", nullable=False, index=True
    )  # unmatched | matched | partially_matched | needs_review | ignored
    invoice_match_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    posted_entry_id: Mapped[Optional[str]] = mapped_column(String(32))
    raw_reference: Mapped[Optional[str]] = mapped_column(Text)  # sanitised Razorpay payload for audit
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Optional[Contact]] = relationship()
    invoice: Mapped[Optional[Invoice]] = relationship()
    customer_payment: Mapped[Optional[CustomerPayment]] = relationship()
    ledger_account: Mapped[Optional[Account]] = relationship()
    refunds: Mapped[List[PaymentRefund]] = relationship(back_populates="payment", cascade="all, delete-orphan")

    @property
    def net_amount(self) -> Decimal:
        """Amount actually settled: gross less gateway fee, tax on fee and refunds."""
        return (
            (self.amount or Decimal("0"))
            - (self.razorpay_fee or Decimal("0"))
            - (self.tax_on_fee or Decimal("0"))
            - (self.refund_amount or Decimal("0"))
        )


RazorpayPayment = PaymentRecord


class PaymentEvent(TimestampMixin, Base):
    """Webhook event log ensuring idempotency and full auditability."""

    __tablename__ = "payment_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    event_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="processed", nullable=False)  # processed | ignored | failed
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)


class PaymentRefund(TimestampMixin, OrgScopedMixin, Base):
    """Refund tracking for payments."""

    __tablename__ = "refunds"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    payment_id: Mapped[str] = mapped_column(String(32), ForeignKey("payments.id", ondelete="CASCADE"), index=True, nullable=False)
    razorpay_payment_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    razorpay_refund_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    refund_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), default="Customer return / refund", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="processed", nullable=False)  # pending | processed | failed
    speed: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)  # normal | optimum
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    payment: Mapped[PaymentRecord] = relationship(back_populates="refunds")
    invoice: Mapped[Optional[Invoice]] = relationship()


class SettlementRecord(TimestampMixin, OrgScopedMixin, Base):
    """Razorpay settlements for bank payouts."""

    __tablename__ = "settlements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    settlement_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    gross_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    adjustments: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    refunds: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="processed", nullable=False)  # created | processed | failed
    bank_reference: Mapped[Optional[str]] = mapped_column(String(100))  # UTR
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reconciled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class ReconciliationRecord(TimestampMixin, OrgScopedMixin, Base):
    """Three-way reconciliation between Internal Payments, Razorpay Payments, and Settlements."""

    __tablename__ = "reconciliation_records"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    reconciliation_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    settlement_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    internal_payment_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    razorpay_payment_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False)  # matched | mismatch | missing_settlement | duplicate
    discrepancy_note: Mapped[Optional[str]] = mapped_column(Text)
    amount_expected: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    amount_actual: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    difference: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(32))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class FinancialTransactionRecord(TimestampMixin, OrgScopedMixin, Base):
    """Granular transaction ledger table for reporting, analytics and audit."""

    __tablename__ = "financial_transactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    transaction_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    transaction_type: Mapped[str] = mapped_column(
        String(40), index=True, nullable=False
    )  # customer_payment | refund | gateway_fee | purchase | expense | settlement | manual
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)  # invoice | payment | refund | bill | expense | settlement
    reference_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    debit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    credit: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    account: Mapped[str] = mapped_column(String(120), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="posted", nullable=False)  # posted | reversed | pending
    created_by: Mapped[Optional[str]] = mapped_column(String(32))


class RazorpaySyncLog(TimestampMixin, OrgScopedMixin, Base):
    """One row per synchronisation run — the audit trail for every import.

    A run is never silently dropped: it starts as ``running`` and always ends as
    ``completed``, ``partial`` or ``failed`` with a human readable message.
    """

    __tablename__ = "razorpay_sync_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    sync_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # initial | incremental | manual | scheduled
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False, index=True)  # running | completed | partial | failed
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    window_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    window_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    records_fetched: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    refunds_synced: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pages_fetched: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mode: Mapped[str] = mapped_column(String(10), default="test", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(32))

    @property
    def duration_seconds(self) -> Optional[float]:
        if not self.completed_at:
            return None
        return (self.completed_at - self.started_at).total_seconds()


class RazorpayCategoryRule(TimestampMixin, OrgScopedMixin, Base):
    """User-maintained categorisation rules, applied before any automatic guess."""

    __tablename__ = "razorpay_category_rules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # description_contains | method_is | email_contains | notes_contains | status_is
    match_type: Mapped[str] = mapped_column(String(30), nullable=False)
    match_value: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    ledger_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    ledger_account: Mapped[Optional[Account]] = relationship()


# --------------------------------------------------------------------------- #
# External payment intake
# --------------------------------------------------------------------------- #
class ExternalPayment(TimestampMixin, OrgScopedMixin, Base):
    """External payment received from any outside platform (UPI, bank transfer,
    a card gateway, a wallet, and so on), awaiting or confirmed through the
    email YES/NO confirmation flow.
    """

    __tablename__ = "external_payments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    platform: Mapped[str] = mapped_column(String(50), default="external", nullable=False, index=True)
    external_transaction_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    payer_name: Mapped[Optional[str]] = mapped_column(String(120))
    payer_email: Mapped[Optional[str]] = mapped_column(String(120))
    payer_phone: Mapped[Optional[str]] = mapped_column(String(40))
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id"), index=True)
    customer_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"), index=True)
    bank_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("bank_accounts.id"))
    status: Mapped[str] = mapped_column(
        String(30), default="pending_confirmation", nullable=False, index=True
    )  # pending_confirmation | approved | rejected
    approval_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    approval_notes: Mapped[Optional[str]] = mapped_column(Text)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[Optional[str]] = mapped_column(String(120))
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    customer_payment_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("customer_payments.id"), index=True)
    raw_payload: Mapped[Optional[str]] = mapped_column(Text)
    confirmation_email_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confirmation_email_recipient: Mapped[Optional[str]] = mapped_column(String(120))

    invoice: Mapped[Optional[Invoice]] = relationship()
    customer: Mapped[Optional[Contact]] = relationship()
    customer_payment: Mapped[Optional[CustomerPayment]] = relationship()
    bank_account: Mapped[Optional[BankAccount]] = relationship()


ExternalPaymentProof = ExternalPayment


def org_code_base(name: str) -> str:
    """Lower-case letters and digits from the name, joined by hyphens ("Rooman Tech" -> "rooman-tech")."""
    import re

    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:30].strip("-")
    return base or "org"


@event.listens_for(Organization, "before_insert")
def _assign_org_code(mapper, connection, target: Organization) -> None:  # noqa: ARG001
    if target.code:
        return
    base = org_code_base(target.name)
    taken = {
        row[0]
        for row in connection.execute(
            text("SELECT code FROM organizations WHERE code = :base OR code LIKE :pattern"),
            {"base": base, "pattern": f"{base}-%"},
        )
    }
    code, n = base, 1
    while code in taken:
        n += 1
        code = f"{base}-{n}"
    target.code = code


# --------------------------------------------------------------------------- #
# Connected apps: other Rooman apps (or a customer's own system) using Books
# features through the API with a scoped key, and receiving its events
# (services/integrations.py, docs/INTEGRATIONS.md)
# --------------------------------------------------------------------------- #


class AppConnection(TimestampMixin, OrgScopedMixin, Base):
    """One app connected to one organization's Books, created by a platform admin.

    The app calls the normal Books API with ``Authorization: Bearer rbk_...``.
    It acts as ``service_user`` (role ``integration``: never signs in, not
    listed with the organization's users), limited to ``scopes`` - feature
    keys of backend/features.py with ``:read`` or ``:write`` - and to the
    organization's plan. Only the SHA-256 of the key is stored.
    """

    __tablename__ = "app_connections"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    # JSON lists: ["invoices:write", "contacts:read"] and ["invoice.created", ...].
    scopes: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    events: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    webhook_url: Mapped[Optional[str]] = mapped_column(String(500))
    # Bumped on "rotate secret"; the signing secret is derived from it (never stored).
    secret_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    service_user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(120))
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    service_user: Mapped[User] = relationship()


class IntegrationEvent(Base):
    """Something that happened in Books (outbox), written in the same transaction as the change."""

    __tablename__ = "integration_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(32))
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class WebhookDelivery(Base):
    """One event to one connected app's webhook, retried with backoff until delivered or dead."""

    __tablename__ = "webhook_deliveries"
    __table_args__ = (Index("ix_webhook_deliveries_due", "status", "next_attempt_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(String(32), ForeignKey("integration_events.id", ondelete="CASCADE"), nullable=False, index=True)
    connection_id: Mapped[str] = mapped_column(String(32), ForeignKey("app_connections.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending | delivered | dead
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_status_code: Mapped[Optional[int]] = mapped_column(Integer)
    last_error: Mapped[Optional[str]] = mapped_column(String(500))
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    event: Mapped[IntegrationEvent] = relationship()


class IdempotencyRecord(Base):
    """The first response to a connected app's write with an ``Idempotency-Key``, replayed on a retry."""

    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("connection_id", "key", name="uq_idempotency_connection_key"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    connection_id: Mapped[str] = mapped_column(String(32), ForeignKey("app_connections.id", ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status_code: Mapped[Optional[int]] = mapped_column(Integer)  # NULL while the first request is running
    response_body: Mapped[Optional[str]] = mapped_column(Text)
    content_type: Mapped[Optional[str]] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


# --------------------------------------------------------------------------- #
# Sales and purchase documents around invoices and bills
# --------------------------------------------------------------------------- #
class DocumentTotalsMixin:
    """Priced like an invoice: lines, a document discount, GST and a total."""

    subtotal: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    subject: Mapped[Optional[str]] = mapped_column(String(250))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    terms: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))


class DocumentLineMixin:
    """The columns of an invoice line, shared by every document below."""

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("1"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)  # before tax
    tax_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    # Serial-tracked goods: the units on the line, comma separated.
    serial_numbers: Mapped[Optional[str]] = mapped_column(Text)

    @declared_attr
    def item_id(cls) -> Mapped[Optional[str]]:
        return mapped_column(String(32), ForeignKey("items.id"))

    @declared_attr
    def account_id(cls) -> Mapped[Optional[str]]:
        return mapped_column(String(32), ForeignKey("accounts.id"))

    @declared_attr
    def item(cls) -> Mapped[Optional[Item]]:
        return relationship("Item")


class Estimate(TimestampMixin, OrgScopedMixin, DocumentTotalsMixin, Base):
    """A quote: priced like an invoice, posts nothing until converted."""

    __tablename__ = "estimates"
    __table_args__ = (
        UniqueConstraint("organization_id", "estimate_number", name="uq_estimate_org_number"),
        UniqueConstraint("share_token", name="uq_estimates_share_token"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    estimate_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    # draft | sent | accepted | declined | invoiced  (expired is derived)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    salesperson: Mapped[Optional[str]] = mapped_column(String(120))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # What it was converted into.
    sales_order_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("sales_orders.id", ondelete="SET NULL"))
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id", ondelete="SET NULL"))
    # Customer portal link token (routers/portal); null = not shared.
    share_token: Mapped[Optional[str]] = mapped_column(String(64))
    # When the customer accepted / declined it through the portal link.
    customer_response_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Contact] = relationship()
    lines: Mapped[List[EstimateLine]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="EstimateLine.position"
    )


class EstimateLine(DocumentLineMixin, Base):
    __tablename__ = "estimate_lines"

    estimate_id: Mapped[str] = mapped_column(String(32), ForeignKey("estimates.id", ondelete="CASCADE"), index=True)
    document: Mapped[Estimate] = relationship(back_populates="lines")


class SalesOrder(TimestampMixin, OrgScopedMixin, DocumentTotalsMixin, Base):
    """A confirmed order from a customer, invoiced when delivered."""

    __tablename__ = "sales_orders"
    __table_args__ = (UniqueConstraint("organization_id", "sales_order_number", name="uq_sales_order_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    sales_order_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shipment_date: Mapped[Optional[date]] = mapped_column(Date)
    # draft | confirmed | invoiced | void
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    salesperson: Mapped[Optional[str]] = mapped_column(String(120))
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id", ondelete="SET NULL"))

    customer: Mapped[Contact] = relationship()
    lines: Mapped[List[SalesOrderLine]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="SalesOrderLine.position"
    )


class SalesOrderLine(DocumentLineMixin, Base):
    __tablename__ = "sales_order_lines"

    sales_order_id: Mapped[str] = mapped_column(String(32), ForeignKey("sales_orders.id", ondelete="CASCADE"), index=True)
    document: Mapped[SalesOrder] = relationship(back_populates="lines")


class DeliveryChallan(TimestampMixin, OrgScopedMixin, DocumentTotalsMixin, Base):
    """Goods sent without a sale yet (Rule 55, CGST Rules): on approval, for job
    work, between branches, or ahead of the invoice. Posts nothing; invoiced later."""

    __tablename__ = "delivery_challans"
    __table_args__ = (UniqueConstraint("organization_id", "challan_number", name="uq_delivery_challan_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    challan_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Why the goods move: supply on approval, job work, ... (printed on the challan).
    reason: Mapped[Optional[str]] = mapped_column(String(120))
    # draft | issued | invoiced | void
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id", ondelete="SET NULL"))

    customer: Mapped[Contact] = relationship()
    lines: Mapped[List[DeliveryChallanLine]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="DeliveryChallanLine.position"
    )


class DeliveryChallanLine(DocumentLineMixin, Base):
    __tablename__ = "delivery_challan_lines"

    delivery_challan_id: Mapped[str] = mapped_column(String(32), ForeignKey("delivery_challans.id", ondelete="CASCADE"), index=True)
    document: Mapped[DeliveryChallan] = relationship(back_populates="lines")


class CreditNote(TimestampMixin, OrgScopedMixin, DocumentTotalsMixin, Base):
    """Sales return or allowance: reverses income and GST and credits the customer."""

    __tablename__ = "credit_notes"
    __table_args__ = (UniqueConstraint("organization_id", "credit_note_number", name="uq_credit_note_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    credit_note_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    # The invoice it was raised against, when there is one (GST needs it).
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id", ondelete="SET NULL"), index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(120))
    # draft | open | closed | void  (closed = fully applied or refunded)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    amount_applied: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    amount_refunded: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    # Warehouse its stock moves from / into; null = the default warehouse.
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("warehouses.id", name="fk_credit_notes_warehouse_id"))

    customer: Mapped[Contact] = relationship()
    invoice: Mapped[Optional[Invoice]] = relationship()
    lines: Mapped[List[CreditNoteLine]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="CreditNoteLine.position"
    )

    @property
    def balance(self) -> Decimal:
        return (self.total or Decimal("0")) - (self.amount_applied or Decimal("0")) - (self.amount_refunded or Decimal("0"))


class CreditNoteLine(DocumentLineMixin, Base):
    __tablename__ = "credit_note_lines"

    credit_note_id: Mapped[str] = mapped_column(String(32), ForeignKey("credit_notes.id", ondelete="CASCADE"), index=True)
    document: Mapped[CreditNote] = relationship(back_populates="lines")


class PurchaseOrder(TimestampMixin, OrgScopedMixin, DocumentTotalsMixin, Base):
    """An order placed with a vendor; posts nothing until billed."""

    __tablename__ = "purchase_orders"
    __table_args__ = (UniqueConstraint("organization_id", "purchase_order_number", name="uq_purchase_order_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    purchase_order_number: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    delivery_date: Mapped[Optional[date]] = mapped_column(Date)
    # draft | issued | billed | cancelled
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    bill_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("bills.id", ondelete="SET NULL"))

    vendor: Mapped[Contact] = relationship()
    lines: Mapped[List[PurchaseOrderLine]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="PurchaseOrderLine.position"
    )


class PurchaseOrderLine(DocumentLineMixin, Base):
    __tablename__ = "purchase_order_lines"

    purchase_order_id: Mapped[str] = mapped_column(String(32), ForeignKey("purchase_orders.id", ondelete="CASCADE"), index=True)
    document: Mapped[PurchaseOrder] = relationship(back_populates="lines")


class VendorCredit(TimestampMixin, OrgScopedMixin, DocumentTotalsMixin, Base):
    """Purchase return or vendor allowance: reduces what is owed to the vendor."""

    __tablename__ = "vendor_credits"
    __table_args__ = (UniqueConstraint("organization_id", "vendor_credit_number", name="uq_vendor_credit_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    vendor_credit_number: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    bill_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("bills.id", ondelete="SET NULL"), index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(120))
    # draft | open | closed | void
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    amount_applied: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    amount_refunded: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    # Warehouse its stock moves from / into; null = the default warehouse.
    warehouse_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("warehouses.id", name="fk_vendor_credits_warehouse_id"))

    vendor: Mapped[Contact] = relationship()
    bill: Mapped[Optional[Bill]] = relationship()
    lines: Mapped[List[VendorCreditLine]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="VendorCreditLine.position"
    )

    @property
    def balance(self) -> Decimal:
        return (self.total or Decimal("0")) - (self.amount_applied or Decimal("0")) - (self.amount_refunded or Decimal("0"))


class VendorCreditLine(DocumentLineMixin, Base):
    __tablename__ = "vendor_credit_lines"

    vendor_credit_id: Mapped[str] = mapped_column(String(32), ForeignKey("vendor_credits.id", ondelete="CASCADE"), index=True)
    document: Mapped[VendorCredit] = relationship(back_populates="lines")


class CreditApplication(Base):
    """Part of a credit note used to settle an invoice, or of a vendor credit to settle a bill.

    Both sides sit in the same receivables (payables) account, so applying
    a credit posts nothing: it only moves the balance between documents.
    """

    __tablename__ = "credit_applications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    credit_note_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("credit_notes.id", ondelete="CASCADE"), index=True)
    invoice_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    vendor_credit_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("vendor_credits.id", ondelete="CASCADE"), index=True)
    bill_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("bills.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    credit_note: Mapped[Optional[CreditNote]] = relationship()
    vendor_credit: Mapped[Optional[VendorCredit]] = relationship()
    invoice: Mapped[Optional[Invoice]] = relationship()
    bill: Mapped[Optional[Bill]] = relationship()


class ContactRefund(TimestampMixin, OrgScopedMixin, Base):
    """Money paid back to a customer, or received back from a vendor.

    Its source is a credit note / vendor credit, or (when neither is set) the
    contact's unapplied advance.
    """

    __tablename__ = "contact_refunds"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    refund_number: Mapped[str] = mapped_column(String(30), nullable=False)
    party_type: Mapped[str] = mapped_column(String(10), nullable=False)  # customer | vendor
    contact_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    credit_note_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("credit_notes.id"), index=True)
    vendor_credit_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("vendor_credits.id"), index=True)
    bank_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="bank_transfer", nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    contact: Mapped[Contact] = relationship()
    credit_note: Mapped[Optional[CreditNote]] = relationship()
    vendor_credit: Mapped[Optional[VendorCredit]] = relationship()
    bank_account: Mapped[BankAccount] = relationship()


class RecurringProfile(TimestampMixin, OrgScopedMixin, Base):
    """Creates an invoice or bill from a saved template on a schedule."""

    __tablename__ = "recurring_profiles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # invoice | bill | journal
    # The customer / vendor; null for journals.
    contact_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("contacts.id"), index=True)
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)  # weekly | monthly | quarterly | yearly
    interval_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)  # every N frequencies
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    next_run_date: Mapped[Optional[date]] = mapped_column(Date, index=True)
    # active | paused | stopped | completed
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    # Generated invoices are sent (bills opened) at once, posting to the books;
    # otherwise they wait as drafts for someone to review.
    auto_issue: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # The InvoiceCreate / BillCreate body (camelCase JSON) without its dates.
    template: Mapped[str] = mapped_column(Text, nullable=False)
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    runs_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_run_date: Mapped[Optional[date]] = mapped_column(Date)
    last_error: Mapped[Optional[str]] = mapped_column(String(500))
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    contact: Mapped[Optional[Contact]] = relationship()


# --------------------------------------------------------------------------- #
# Currencies, fixed assets and budgets
# --------------------------------------------------------------------------- #
class OrgCurrency(TimestampMixin, OrgScopedMixin, Base):
    """A foreign currency the organization uses, with its current rate (base per unit)."""

    __tablename__ = "org_currencies"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_org_currency_code"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(3), nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    symbol: Mapped[str] = mapped_column(String(8), nullable=False)
    exchange_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 6))


class FixedAsset(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "fixed_assets"
    __table_args__ = (UniqueConstraint("organization_id", "asset_number", name="uq_fixed_asset_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    asset_number: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[Optional[str]] = mapped_column(String(60))
    asset_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("accounts.id"), nullable=False)
    # Null = the system defaults (6950 Depreciation Expense, 1590 Accumulated Depreciation).
    depreciation_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    accumulated_account_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("accounts.id"))
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    depreciation_start: Mapped[date] = mapped_column(Date, nullable=False)
    cost: Mapped[Decimal] = mapped_column(Money, nullable=False)
    salvage_value: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    method: Mapped[str] = mapped_column(String(20), default="straight_line", nullable=False)  # straight_line | declining
    useful_life_months: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=Decimal("0"), nullable=False)  # declining: % a year
    accumulated_depreciation: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    last_depreciation_date: Mapped[Optional[date]] = mapped_column(Date)
    # active | fully_depreciated | disposed
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    disposed_on: Mapped[Optional[date]] = mapped_column(Date)
    disposal_amount: Mapped[Optional[Decimal]] = mapped_column(Money)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))


class AssetDepreciation(Base):
    """One month of depreciation posted for an asset (its journal's source)."""

    __tablename__ = "asset_depreciations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id: Mapped[str] = mapped_column(String(32), ForeignKey("fixed_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Budget(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)  # first day of the 12-month budget year
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    lines: Mapped[List[BudgetLine]] = relationship(back_populates="budget", cascade="all, delete-orphan")


class BudgetLine(Base):
    __tablename__ = "budget_lines"
    __table_args__ = (UniqueConstraint("budget_id", "account_id", "month_index", name="uq_budget_line_month"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    budget_id: Mapped[str] = mapped_column(String(32), ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(32), ForeignKey("accounts.id"), nullable=False)
    month_index: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-11 from the budget start
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)

    budget: Mapped[Budget] = relationship(back_populates="lines")
    account: Mapped[Account] = relationship()


# --------------------------------------------------------------------------- #
# Warehouses, stock movements, transfers, composite items and price lists
# --------------------------------------------------------------------------- #
class Warehouse(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "warehouses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ItemStock(Base):
    """Stock of one item in one warehouse; the item's stock_on_hand is the sum."""

    __tablename__ = "item_stocks"
    __table_args__ = (UniqueConstraint("item_id", "warehouse_id", name="uq_item_stock_warehouse"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)


class StockBatch(Base):
    __tablename__ = "stock_batches"
    __table_args__ = (UniqueConstraint("item_id", "warehouse_id", "batch_number", name="uq_stock_batch"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False)
    batch_number: Mapped[str] = mapped_column(String(60), nullable=False)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    quantity: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)


class StockMovement(Base):
    """One movement of stock in or out (the stock ledger)."""

    __tablename__ = "stock_movements"
    __table_args__ = (Index("ix_stock_movements_item_date", "item_id", "date"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)  # + in, - out
    unit_cost: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    batch_number: Mapped[Optional[str]] = mapped_column(String(60))
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_id: Mapped[Optional[str]] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class TransferOrder(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "transfer_orders"
    __table_args__ = (UniqueConstraint("organization_id", "transfer_number", name="uq_transfer_order_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    transfer_number: Mapped[str] = mapped_column(String(30), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    from_warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id"), nullable=False)
    to_warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft | transferred
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    lines: Mapped[List[TransferOrderLine]] = relationship(back_populates="transfer", cascade="all, delete-orphan")


class TransferOrderLine(Base):
    __tablename__ = "transfer_order_lines"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    transfer_id: Mapped[str] = mapped_column(String(32), ForeignKey("transfer_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    batch_number: Mapped[Optional[str]] = mapped_column(String(60))
    serial_numbers: Mapped[Optional[str]] = mapped_column(Text)

    transfer: Mapped[TransferOrder] = relationship(back_populates="lines")
    item: Mapped[Item] = relationship()


class CompositeComponent(Base):
    """One line of a composite item's bill of materials."""

    __tablename__ = "composite_components"
    __table_args__ = (UniqueConstraint("composite_item_id", "component_item_id", name="uq_composite_component"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    composite_item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    component_item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)

    component: Mapped[Item] = relationship(foreign_keys=[component_item_id])


class Assembly(TimestampMixin, OrgScopedMixin, Base):
    """Composite units built from their components."""

    __tablename__ = "assemblies"
    __table_args__ = (UniqueConstraint("organization_id", "assembly_number", name="uq_assembly_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    assembly_number: Mapped[str] = mapped_column(String(30), nullable=False)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id"), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id"), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))

    item: Mapped[Item] = relationship()


class PriceList(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "price_lists"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), default="sales", nullable=False)  # sales | purchase
    method: Mapped[str] = mapped_column(String(10), default="markup", nullable=False)  # markup | per_item
    percentage: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"), nullable=False)
    rounding: Mapped[str] = mapped_column(String(12), default="none", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    items: Mapped[List[PriceListItem]] = relationship(back_populates="price_list", cascade="all, delete-orphan")


class PriceListItem(Base):
    __tablename__ = "price_list_items"
    __table_args__ = (UniqueConstraint("price_list_id", "item_id", name="uq_price_list_item"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    price_list_id: Mapped[str] = mapped_column(String(32), ForeignKey("price_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Money, nullable=False)

    price_list: Mapped[PriceList] = relationship(back_populates="items")


# --------------------------------------------------------------------------- #
# Automation: custom fields, workflow rules, scheduled reports
# --------------------------------------------------------------------------- #
class CustomField(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "custom_fields"
    __table_args__ = (UniqueConstraint("organization_id", "entity", "key", name="uq_custom_field_key"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    entity: Mapped[str] = mapped_column(String(30), nullable=False)  # invoice | bill | contact | item ...
    key: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), default="text", nullable=False)  # text | number | date | select | checkbox
    options: Mapped[Optional[str]] = mapped_column(Text)  # JSON list for select fields
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_on_pdf: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"
    __table_args__ = (UniqueConstraint("field_id", "entity_id", name="uq_custom_field_value"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id: Mapped[str] = mapped_column(String(32), ForeignKey("custom_fields.id", ondelete="CASCADE"), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class WorkflowRule(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "workflow_rules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    event: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # e.g. invoice.created
    conditions: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    actions: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    run_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[str]] = mapped_column(String(32))


class WorkflowRun(Base):
    """One firing of a rule: queued on the change, its actions run by the worker."""

    __tablename__ = "workflow_runs"
    __table_args__ = (Index("ix_workflow_runs_status", "status", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(32), ForeignKey("workflow_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[Optional[str]] = mapped_column(String(32))
    event: Mapped[str] = mapped_column(String(40), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # pending | done | failed | skipped
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ReportSchedule(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "report_schedules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    report: Mapped[str] = mapped_column(String(30), nullable=False)
    frequency: Mapped[str] = mapped_column(String(10), default="monthly", nullable=False)  # daily | weekly | monthly
    recipients: Mapped[str] = mapped_column(Text, nullable=False)  # comma separated
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    next_run_date: Mapped[Optional[date]] = mapped_column(Date)
    last_sent_at: Mapped[Optional[date]] = mapped_column(Date)
    created_by: Mapped[Optional[str]] = mapped_column(String(32))


# --------------------------------------------------------------------------- #
# Branches, serial numbers and bank statements
# --------------------------------------------------------------------------- #
class Branch(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(20))
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class StockSerial(Base):
    """One serial-numbered unit: where it is and whether it is still in stock."""

    __tablename__ = "stock_serials"
    __table_args__ = (UniqueConstraint("item_id", "serial_number", name="uq_stock_serial"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(String(32), ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(String(32), ForeignKey("warehouses.id"), nullable=False)
    serial_number: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="in_stock", nullable=False)  # in_stock | out
    last_source_type: Mapped[Optional[str]] = mapped_column(String(40))
    last_source_id: Mapped[Optional[str]] = mapped_column(String(32))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class BankStatementLine(Base):
    """A line imported from a bank statement, waiting to be matched or booked."""

    __tablename__ = "bank_statement_lines"
    __table_args__ = (Index("ix_bank_statement_lines_account_status", "bank_account_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    bank_account_id: Mapped[str] = mapped_column(String(32), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(10), nullable=False)  # deposit | withdrawal
    amount: Mapped[Decimal] = mapped_column(Money, nullable=False)
    # unmatched | matched | ignored
    status: Mapped[str] = mapped_column(String(20), default="unmatched", nullable=False)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(32))
    # What matching created (so Undo can remove it): transaction | customer_payment | vendor_payment;
    # null when the line was matched to something already in the books.
    created_kind: Mapped[Optional[str]] = mapped_column(String(20))
    import_batch: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# Kept from the Books that ran inside Rooman One (revisions e5b9d2f7a1c3 and
# f2a6c8e1d4b7) so its database upgrades here: one record per source per
# organization, and its event tables (unused by this Books).
# --------------------------------------------------------------------------- #
for _model in (Contact, Item, Invoice, CustomerPayment):
    Index(f"uq_{_model.__tablename__}_source", _model.organization_id, _model.source_app, _model.source_ref, unique=True)

outbox = Table(
    "outbox",
    Base.metadata,
    Column("id", String(40), primary_key=True),
    Column("org_id", String(36), nullable=False, index=True),
    Column("type", String(80), nullable=False),
    Column("version", Integer, nullable=False, default=1),
    Column("payload", JSON, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("published_at", DateTime(timezone=True), nullable=True, index=True),
    Column("attempts", Integer, nullable=False, default=0),
    Column("next_attempt_at", DateTime(timezone=True), nullable=True),
    Column("last_error", Text, nullable=True),
    Column("failed_at", DateTime(timezone=True), nullable=True, index=True),
    Column("delivered_to", JSON, nullable=True),
)

processed_events = Table(
    "processed_events",
    Base.metadata,
    Column("consumer", String(80), primary_key=True),
    Column("event_id", String(40), primary_key=True),
    Column("org_id", String(36), nullable=False, index=True),
    Column("processed_at", DateTime(timezone=True), nullable=False),
)
