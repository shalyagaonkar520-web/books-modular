"""add ip_address to refresh_tokens

Adds an ``ip_address`` column to ``refresh_tokens`` so each signed-in device
can be shown to the user (Settings > Active Sessions) instead of only the
current browser. Captured from the client IP at login/refresh time, same as
the value already used by the login rate limiter.

Revision ID: a1c4d8e2f6b0
Revises: e870ff1383f4
Create Date: 2026-09-11
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a1c4d8e2f6b0"
down_revision = "e870ff1383f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("refresh_tokens", schema=None) as batch_op:
        batch_op.add_column(sa.Column("ip_address", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("refresh_tokens", schema=None) as batch_op:
        batch_op.drop_column("ip_address")
