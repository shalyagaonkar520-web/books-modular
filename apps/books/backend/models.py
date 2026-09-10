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
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base

Money = Numeric(14, 2)
Qty = Numeric(14, 3)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class OrgScopedMixin:
    organization_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )


# --------------------------------------------------------------------------- #
# Identity & tenancy
# --------------------------------------------------------------------------- #
class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
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

    users: Mapped[List[User]] = relationship(back_populates="organization")


class User(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="staff", nullable=False)  # admin | staff | viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    organization: Mapped[Organization] = relationship(back_populates="users")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255))


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

    lines: Mapped[List[JournalLine]] = relationship(
        back_populates="entry", cascade="all, delete-orphan", order_by="JournalLine.position"
    )


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
class Item(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("organization_id", "sku", name="uq_item_org_sku"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(10), default="goods", nullable=False)  # goods | service
    sku: Mapped[str] = mapped_column(String(50), nullable=False)
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
    opening_stock: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    opening_stock_rate: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"), nullable=False)
    stock_on_hand: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    reorder_level: Mapped[Decimal] = mapped_column(Qty, default=Decimal("0"), nullable=False)
    warehouse_location: Mapped[Optional[str]] = mapped_column(String(120))

    sales_account: Mapped[Optional[Account]] = relationship(foreign_keys=[sales_account_id])
    purchase_account: Mapped[Optional[Account]] = relationship(foreign_keys=[purchase_account_id])
    preferred_vendor: Mapped[Optional[Contact]] = relationship(foreign_keys=[preferred_vendor_id])


class Contact(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # customer | vendor
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_name: Mapped[Optional[str]] = mapped_column(String(200))
    contact_person: Mapped[Optional[str]] = mapped_column(String(120))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    gstin: Mapped[Optional[str]] = mapped_column(String(20))
    pan: Mapped[Optional[str]] = mapped_column(String(20))
    gst_treatment: Mapped[str] = mapped_column(String(30), default="unregistered", nullable=False)
    billing_address: Mapped[Optional[str]] = mapped_column(Text)
    shipping_address: Mapped[Optional[str]] = mapped_column(Text)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


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

    item: Mapped[Item] = relationship()


# --------------------------------------------------------------------------- #
# Sales
# --------------------------------------------------------------------------- #
class Invoice(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("organization_id", "invoice_number", name="uq_invoice_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    invoice_number: Mapped[str] = mapped_column(String(30), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(32), ForeignKey("contacts.id"), nullable=False, index=True)
    project_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("projects.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    # draft | sent | partially_paid | paid | void  (overdue is derived)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    reference: Mapped[Optional[str]] = mapped_column(String(120))
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

    customer: Mapped[Contact] = relationship()
    lines: Mapped[List[InvoiceLine]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLine.position"
    )
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

    invoice: Mapped[Invoice] = relationship(back_populates="lines")
    item: Mapped[Optional[Item]] = relationship()


class CustomerPayment(TimestampMixin, OrgScopedMixin, Base):
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

    customer: Mapped[Contact] = relationship()
    invoice: Mapped[Optional[Invoice]] = relationship(back_populates="payments")
    bank_account: Mapped[BankAccount] = relationship()


# --------------------------------------------------------------------------- #
# Purchases
# --------------------------------------------------------------------------- #
class Bill(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "bills"
    __table_args__ = (UniqueConstraint("organization_id", "bill_number", name="uq_bill_org_number"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    bill_number: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor_bill_number: Mapped[Optional[str]] = mapped_column(String(60))
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

    vendor: Mapped[Contact] = relationship()
    lines: Mapped[List[BillLine]] = relationship(
        back_populates="bill", cascade="all, delete-orphan", order_by="BillLine.position"
    )
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
    bank_account_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
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
    __table_args__ = (
        UniqueConstraint("razorpay_payment_id", name="uq_payments_razorpay_payment_id"),
    )

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
    payment_method: Mapped[str] = mapped_column(String(40), default="card", nullable=False)  # upi | card | netbanking | wallet | emi | other
    payment_status: Mapped[str] = mapped_column(String(30), default="captured", nullable=False, index=True)  # created | authorized | captured | failed | refunded | partially_refunded
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
    transaction_type: Mapped[str] = mapped_column(String(40), index=True, nullable=False)  # customer_payment | refund | gateway_fee | purchase | expense | settlement | manual
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
    status: Mapped[str] = mapped_column(String(30), default="pending_confirmation", nullable=False, index=True)  # pending_confirmation | approved | rejected
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


