"""add invoice reminder tracking columns

Adds ``last_reminder_at`` and ``reminder_count`` to ``invoices``, used by the
overdue-reminder flow to avoid re-sending a chase email too soon and to cap
how many reminders a single invoice receives. These columns already existed
on the ``Invoice`` model but were never added by a migration, so ``alembic
check`` flagged a schema drift on PostgreSQL.

Revision ID: e870ff1383f4
Revises: f92d61ac0e37
Create Date: 2026-09-11
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "e870ff1383f4"
down_revision = "f92d61ac0e37"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column("last_reminder_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(
            sa.Column("reminder_count", sa.Integer(), nullable=False, server_default="0")
        )
    # The server-side default only exists to backfill existing rows; new rows
    # get their default from the ORM model.
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.alter_column("reminder_count", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_column("reminder_count")
        batch_op.drop_column("last_reminder_at")
