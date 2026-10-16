"""Records sent by other Rooman apps (Billing): source app and source id

``source_app`` / ``source_ref`` on contacts, items, invoices and customer
payments, with a unique index per organization so an event delivered twice
never creates a second copy. NULL (every existing row) = made in Books.

Revision ID: f2a6c8e1d4b7
Revises: e5b9d2f7a1c3
Create Date: 2026-10-16
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "f2a6c8e1d4b7"
down_revision = "e5b9d2f7a1c3"
branch_labels = None
depends_on = None

TABLES = ("contacts", "items", "invoices", "customer_payments")


def upgrade() -> None:
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("source_app", sa.String(20), nullable=True))
            batch.add_column(sa.Column("source_ref", sa.String(64), nullable=True))
        op.create_index(f"uq_{table}_source", table, ["organization_id", "source_app", "source_ref"], unique=True)


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"uq_{table}_source", table_name=table)
        with op.batch_alter_table(table) as batch:
            batch.drop_column("source_ref")
            batch.drop_column("source_app")
