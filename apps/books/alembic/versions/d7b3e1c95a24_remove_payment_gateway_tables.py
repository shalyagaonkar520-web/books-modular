"""remove the payment gateway integration tables

Drops the tables that existed only to support the payment gateway integration:
payments, payment_events, refunds, settlements, reconciliation_records and
financial_transactions.

``external_payments`` is deliberately kept: it backs the universal payment
intake and the email confirmation flow, which are independent of any gateway.

Revision ID: d7b3e1c95a24
Revises: 9f391213a8bf
Create Date: 2026-09-10
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "d7b3e1c95a24"
down_revision = "9f391213a8bf"
branch_labels = None
depends_on = None

# Dropped children first so foreign keys never block the drop.
DROP_ORDER = (
    "reconciliation_records",
    "financial_transactions",
    "settlements",
    "refunds",
    "payment_events",
    "payments",
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = set(inspector.get_table_names())
    for table in DROP_ORDER:
        if table in existing:
            op.drop_table(table)


def downgrade() -> None:
    """Recreate the gateway tables.

    Structure only -- the rows are gone for good. This exists so the migration
    chain stays reversible, not to restore any data.
    """
    op.create_table(
        "payments",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=64), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(length=64), nullable=False),
        sa.Column("razorpay_signature", sa.String(length=255), nullable=True),
        sa.Column("customer_id", sa.String(length=32), nullable=True),
        sa.Column("sales_order_id", sa.String(length=64), nullable=True),
        sa.Column("invoice_id", sa.String(length=32), nullable=True),
        sa.Column("customer_payment_id", sa.String(length=32), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("payment_method", sa.String(length=40), nullable=False),
        sa.Column("payment_status", sa.String(length=30), nullable=False),
        sa.Column("mode", sa.String(length=10), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refund_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("razorpay_fee", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("tax_on_fee", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("net_settlement", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("settlement_id", sa.String(length=64), nullable=True),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("error_description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "payment_events",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=True),
        sa.Column("event_id", sa.String(length=100), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_table(
        "refunds",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("payment_id", sa.String(length=32), nullable=False),
        sa.Column("razorpay_payment_id", sa.String(length=64), nullable=False),
        sa.Column("razorpay_refund_id", sa.String(length=64), nullable=False),
        sa.Column("invoice_id", sa.String(length=32), nullable=True),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("refund_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("speed", sa.String(length=20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("razorpay_refund_id"),
    )
    op.create_table(
        "settlements",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("settlement_id", sa.String(length=64), nullable=False),
        sa.Column("settlement_date", sa.Date(), nullable=False),
        sa.Column("gross_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("fee_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("adjustments", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("refunds", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("net_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("bank_reference", sa.String(length=100), nullable=True),
        sa.Column("reconciled", sa.Boolean(), nullable=False),
        sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("settlement_id"),
    )
    op.create_table(
        "reconciliation_records",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("reconciliation_date", sa.Date(), nullable=False),
        sa.Column("settlement_id", sa.String(length=64), nullable=True),
        sa.Column("internal_payment_id", sa.String(length=32), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("discrepancy_note", sa.Text(), nullable=True),
        sa.Column("amount_expected", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("amount_actual", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("difference", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("resolved", sa.Boolean(), nullable=False),
        sa.Column("resolved_by", sa.String(length=32), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "financial_transactions",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("transaction_type", sa.String(length=40), nullable=False),
        sa.Column("reference_type", sa.String(length=40), nullable=False),
        sa.Column("reference_id", sa.String(length=64), nullable=True),
        sa.Column("debit", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("credit", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("account", sa.String(length=120), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
