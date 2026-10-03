"""add per-user module access

``users.module_access`` - JSON list of the module keys (module_pricing.json)
a user may edit, set by the organization admin panel. NULL (every existing
row) = every module of the organization's plan, so nothing changes until an
admin restricts someone. Admins are never restricted.

Revision ID: a8d4c1e6f2b9
Revises: f3b8d2a6c9e1
Create Date: 2026-10-01
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a8d4c1e6f2b9"
down_revision = "f3b8d2a6c9e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("module_access", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("module_access")
