"""add organization defaults (tax rate, payment terms) and archive timestamp

  * ``organizations.default_tax_rate`` / ``default_payment_terms_days`` -
    org-wide defaults for new documents, seeded from the platform's global
    defaults when an org is created;
  * ``organizations.deleted_at`` - soft delete ("archive") by a super-admin.

Revision ID: c5d9e2b7f4a1
Revises: b8e2f4a6c1d9
Create Date: 2026-09-29
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c5d9e2b7f4a1"
down_revision = "b8e2f4a6c1d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("default_tax_rate", sa.Numeric(precision=5, scale=2), nullable=False, server_default="18"),
    )
    op.add_column(
        "organizations",
        sa.Column("default_payment_terms_days", sa.Integer(), nullable=False, server_default="30"),
    )
    op.add_column("organizations", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))

    # Drop the server defaults now that existing rows are backfilled; the ORM
    # supplies these values on insert.
    with op.batch_alter_table("organizations") as batch:
        batch.alter_column("default_tax_rate", server_default=None)
        batch.alter_column("default_payment_terms_days", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.drop_column("deleted_at")
        batch.drop_column("default_payment_terms_days")
        batch.drop_column("default_tax_rate")
