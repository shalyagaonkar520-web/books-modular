"""SQLAlchemy ORM models for Rooman Books.

All business tables are scoped by ``organization_id`` (multi-tenant) and use
string UUID primary keys so that the schema is portable between SQLite and
PostgreSQL.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
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
    return datetime.now(timezone.utc)


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
