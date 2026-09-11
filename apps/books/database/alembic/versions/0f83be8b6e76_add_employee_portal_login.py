"""add employee portal login link

Adds ``employees.user_id``, a nullable, unique link to ``users.id``. Set once
an employee has been invited to the self-service portal (role ``employee``)
and accepted - lets them sign in and see only their own payslips and profile,
without touching any other data.

Revision ID: 0f83be8b6e76
Revises: 540ce640f6cb
Create Date: 2026-09-11
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0f83be8b6e76"
down_revision = "540ce640f6cb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("employees", schema=None) as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.String(length=32), nullable=True))
    with op.batch_alter_table("employees", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_employees_user_id"), ["user_id"], unique=True)
        batch_op.create_foreign_key(
            "fk_employees_user_id_users", "users", ["user_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("employees", schema=None) as batch_op:
        batch_op.drop_constraint("fk_employees_user_id_users", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_employees_user_id"))
        batch_op.drop_column("user_id")
