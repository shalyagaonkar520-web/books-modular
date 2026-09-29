"""add platform (super-admin) tables and org suspension

Introduces the cross-tenant platform operator:
  * ``platform_admins`` - super-admin accounts, separate from tenant users;
  * ``platform_refresh_tokens`` - their rotating refresh tokens;
  * ``organizations.is_suspended`` / ``suspended_at`` / ``suspended_reason`` -
    a super-admin can lock an org without deleting its data.

Revision ID: a2f5c9d1e3b7
Revises: e4a19c7b58d2
Create Date: 2026-09-29
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a2f5c9d1e3b7"
down_revision = "e4a19c7b58d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("is_suspended", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("organizations", sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("suspended_reason", sa.Text(), nullable=True))

    op.create_table(
        "platform_admins",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_admins_email", "platform_admins", ["email"], unique=True)

    op.create_table(
        "platform_refresh_tokens",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("admin_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["admin_id"], ["platform_admins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_refresh_tokens_admin_id", "platform_refresh_tokens", ["admin_id"])
    op.create_index("ix_platform_refresh_tokens_token_hash", "platform_refresh_tokens", ["token_hash"], unique=True)

    # Drop the server defaults now that existing rows are backfilled; the ORM
    # supplies these values on insert.
    with op.batch_alter_table("organizations") as batch:
        batch.alter_column("is_suspended", server_default=None)
    with op.batch_alter_table("platform_admins") as batch:
        batch.alter_column("is_active", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_platform_refresh_tokens_token_hash", table_name="platform_refresh_tokens")
    op.drop_index("ix_platform_refresh_tokens_admin_id", table_name="platform_refresh_tokens")
    op.drop_table("platform_refresh_tokens")
    op.drop_index("ix_platform_admins_email", table_name="platform_admins")
    op.drop_table("platform_admins")
    op.drop_column("organizations", "suspended_reason")
    op.drop_column("organizations", "suspended_at")
    op.drop_column("organizations", "is_suspended")
