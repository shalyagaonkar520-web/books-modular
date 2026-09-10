"""restore the Razorpay gateway tables

Recreates the tables dropped by d7b3e1c95a24, this time including the
transaction-sync columns from the outset: the sanitised payload kept for audit,
the categorisation fields, the reconciliation state, and the unique constraint
on ``razorpay_payment_id`` that makes importing a payment twice impossible.

Revision ID: f92d61ac0e37
Revises: e58c2f4a71b9
Create Date: 2026-09-10
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "f92d61ac0e37"
down_revision = "e58c2f4a71b9"
branch_labels = None
depends_on = None

# Children last so the drop in downgrade() never trips a foreign key.
CREATE_ORDER = (
    "payments",
    "payment_events",
    "refunds",
    "settlements",
    "reconciliation_records",
    "financial_transactions",
    "razorpay_sync_logs",
    "razorpay_category_rules",
)


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=64), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(length=64), nullable=False),
        sa.Column("razorpay_invoice_id", sa.String(length=64), nullable=True),
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
        # Synchronisation and bookkeeping metadata.
        sa.Column("customer_name", sa.String(length=200), nullable=True),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("customer_contact", sa.String(length=40), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("method_detail", sa.String(length=160), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False, server_default="checkout"),
        sa.Column("category", sa.String(length=60), nullable=True),
        sa.Column("category_source", sa.String(length=20), nullable=True),
        sa.Column("category_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("category_status", sa.String(length=20), nullable=False, server_default="suggested"),
        sa.Column("ledger_account_id", sa.String(length=32), nullable=True),
        sa.Column("reconciliation_status", sa.String(length=20), nullable=False, server_default="unmatched"),
        sa.Column("invoice_match_confidence", sa.Numeric(precision=4, scale=3), nullable=True),
        sa.Column("posted_entry_id", sa.String(length=32), nullable=True),
        sa.Column("raw_reference", sa.Text(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.ForeignKeyConstraint(["customer_payment_id"], ["customer_payments.id"]),
        sa.ForeignKeyConstraint(["ledger_account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        # The same Razorpay payment can never be imported twice.
        sa.UniqueConstraint("razorpay_payment_id", name="uq_payments_razorpay_payment_id"),
    )
    with op.batch_alter_table("payments", schema=None) as batch_op:
        for column in (
            "organization_id", "razorpay_order_id", "razorpay_payment_id", "razorpay_invoice_id",
            "customer_id", "sales_order_id", "invoice_id", "customer_payment_id",
            "payment_status", "settlement_id", "transaction_date", "category", "reconciliation_status",
        ):
            batch_op.create_index(batch_op.f(f"ix_payments_{column}"), [column], unique=False)

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
    )
    with op.batch_alter_table("payment_events", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_payment_events_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_payment_events_event_id"), ["event_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_payment_events_event_type"), ["event_type"], unique=False)
        batch_op.create_index(batch_op.f("ix_payment_events_entity_id"), ["entity_id"], unique=False)

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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("refunds", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_refunds_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_refunds_payment_id"), ["payment_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_refunds_razorpay_payment_id"), ["razorpay_payment_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_refunds_razorpay_refund_id"), ["razorpay_refund_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_refunds_invoice_id"), ["invoice_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_refunds_refund_date"), ["refund_date"], unique=False)

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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("settlements", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_settlements_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_settlements_settlement_id"), ["settlement_id"], unique=True)
        batch_op.create_index(batch_op.f("ix_settlements_settlement_date"), ["settlement_date"], unique=False)

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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("reconciliation_records", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_reconciliation_records_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_reconciliation_records_reconciliation_date"), ["reconciliation_date"], unique=False)
        batch_op.create_index(batch_op.f("ix_reconciliation_records_settlement_id"), ["settlement_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_reconciliation_records_internal_payment_id"), ["internal_payment_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_reconciliation_records_razorpay_payment_id"), ["razorpay_payment_id"], unique=False)

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
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("financial_transactions", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_financial_transactions_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_financial_transactions_transaction_id"), ["transaction_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_financial_transactions_transaction_type"), ["transaction_type"], unique=False)
        batch_op.create_index(batch_op.f("ix_financial_transactions_reference_id"), ["reference_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_financial_transactions_date"), ["date"], unique=False)

    op.create_table(
        "razorpay_sync_logs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("sync_type", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("records_fetched", sa.Integer(), nullable=False),
        sa.Column("records_created", sa.Integer(), nullable=False),
        sa.Column("records_updated", sa.Integer(), nullable=False),
        sa.Column("records_skipped", sa.Integer(), nullable=False),
        sa.Column("records_failed", sa.Integer(), nullable=False),
        sa.Column("refunds_synced", sa.Integer(), nullable=False),
        sa.Column("pages_fetched", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=10), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("razorpay_sync_logs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_razorpay_sync_logs_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_razorpay_sync_logs_sync_type"), ["sync_type"], unique=False)
        batch_op.create_index(batch_op.f("ix_razorpay_sync_logs_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_razorpay_sync_logs_started_at"), ["started_at"], unique=False)

    op.create_table(
        "razorpay_category_rules",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("match_type", sa.String(length=30), nullable=False),
        sa.Column("match_value", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("ledger_account_id", sa.String(length=32), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ledger_account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("razorpay_category_rules", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_razorpay_category_rules_organization_id"), ["organization_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_razorpay_category_rules_priority"), ["priority"], unique=False)


def downgrade() -> None:
    for table in reversed(CREATE_ORDER):
        op.drop_table(table)
