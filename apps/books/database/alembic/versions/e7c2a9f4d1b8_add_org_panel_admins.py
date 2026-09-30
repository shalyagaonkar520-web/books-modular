"""add organization admin-panel logins

Separate logins for each organization's admin panel (``/api/org-admin``),
created only by a platform admin:
  * ``org_panel_admins`` - panel accounts, scoped to one organization and
    removed with it (ON DELETE CASCADE);
  * ``org_panel_refresh_tokens`` - their rotating refresh tokens.

Revision ID: e7c2a9f4d1b8
Revises: d4e8a1f6b2c3
Create Date: 2026-09-30
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "e7c2a9f4d1b8"
down_revision = "d4e8a1f6b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_panel_admins",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("organization_id", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_org_panel_admins_email", "org_panel_admins", ["email"], unique=True)
    op.create_index("ix_org_panel_admins_organization_id", "org_panel_admins", ["organization_id"])

    op.create_table(
        "org_panel_refresh_tokens",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("admin_id", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["admin_id"], ["org_panel_admins.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_org_panel_refresh_tokens_admin_id", "org_panel_refresh_tokens", ["admin_id"])
    op.create_index("ix_org_panel_refresh_tokens_token_hash", "org_panel_refresh_tokens", ["token_hash"], unique=True)

    # The ORM supplies is_active on insert; the server default only existed so
    # the column could be declared NOT NULL.
    with op.batch_alter_table("org_panel_admins") as batch:
        batch.alter_column("is_active", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_org_panel_refresh_tokens_token_hash", table_name="org_panel_refresh_tokens")
    op.drop_index("ix_org_panel_refresh_tokens_admin_id", table_name="org_panel_refresh_tokens")
    op.drop_table("org_panel_refresh_tokens")
    op.drop_index("ix_org_panel_admins_organization_id", table_name="org_panel_admins")
    op.drop_index("ix_org_panel_admins_email", table_name="org_panel_admins")
    op.drop_table("org_panel_admins")
