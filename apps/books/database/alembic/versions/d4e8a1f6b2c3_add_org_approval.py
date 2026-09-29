"""add organization approval workflow

  * ``organizations.approval_status`` - approved | pending | rejected. Existing
    rows backfill to ``approved`` through the server default, so nobody is
    locked out by the upgrade;
  * ``organizations.approved_at`` - when a super-admin approved the org;
  * ``organizations.rejection_reason`` - optional note shown on a declined
    registration.

Revision ID: d4e8a1f6b2c3
Revises: c5d9e2b7f4a1
Create Date: 2026-09-29
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "d4e8a1f6b2c3"
down_revision = "c5d9e2b7f4a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("approval_status", sa.String(length=20), nullable=False, server_default="approved"),
    )
    op.add_column("organizations", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("rejection_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.drop_column("rejection_reason")
        batch.drop_column("approved_at")
        batch.drop_column("approval_status")
