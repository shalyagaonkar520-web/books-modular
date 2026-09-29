"""add platform_settings runtime configuration table

A single-row-per-key store the platform operator uses to toggle runtime
behaviour (e.g. ``allow_public_signup``) without an environment change or a
redeploy. Values are held as text and coerced by the ``platform_settings``
service.

Revision ID: b8e2f4a6c1d9
Revises: a2f5c9d1e3b7
Create Date: 2026-09-29
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "b8e2f4a6c1d9"
down_revision = "a2f5c9d1e3b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_settings_key", "platform_settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_platform_settings_key", table_name="platform_settings")
    op.drop_table("platform_settings")
