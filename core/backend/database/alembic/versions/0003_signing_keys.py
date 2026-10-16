"""Token-signing keys: RSA key pairs, private half stored encrypted.

Revision ID: 0003_signing_keys
Revises: 0002_core_identity
Create Date: 2026-10-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_signing_keys"
down_revision = "0002_core_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signing_keys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kid", sa.String(length=64), nullable=False),
        sa.Column("algorithm", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("public_jwk", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), nullable=False),
        sa.Column("private_key_encrypted", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retiring_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kid"),
    )
    op.create_index(op.f("ix_signing_keys_status"), "signing_keys", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_signing_keys_status"), table_name="signing_keys")
    op.drop_table("signing_keys")
