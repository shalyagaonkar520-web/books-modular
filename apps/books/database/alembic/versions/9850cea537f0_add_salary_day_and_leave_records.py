"""add salary_day and leave_records

Adds ``employees.salary_day`` (the day of the month salary is paid; null
means "the last day of the month", so existing rows need no backfill) and a
new ``leave_records`` table - one row per day an employee was on leave, used
to auto-fill loss-of-pay when a pay run is created for that period.

Revision ID: 9850cea537f0
Revises: 0f83be8b6e76
Create Date: 2026-09-12
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "9850cea537f0"
down_revision = "0f83be8b6e76"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("employees", schema=None) as batch_op:
        batch_op.add_column(sa.Column("salary_day", sa.Integer(), nullable=True))

    op.create_table(
        "leave_records",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("employee_id", sa.String(length=32), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("leave_type", sa.String(length=20), nullable=False, server_default="unpaid"),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("created_by", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("employee_id", "date", name="uq_leave_employee_date"),
    )
    with op.batch_alter_table("leave_records", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_leave_records_organization_id"), ["organization_id"])
        batch_op.create_index(batch_op.f("ix_leave_records_employee_id"), ["employee_id"])
        batch_op.create_index(batch_op.f("ix_leave_records_date"), ["date"])


def downgrade() -> None:
    op.drop_table("leave_records")
    with op.batch_alter_table("employees", schema=None) as batch_op:
        batch_op.drop_column("salary_day")
