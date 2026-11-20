"""AI employee workspace: workspaces, employees, chats, usage; item category and brand

Revision ID: 7a3c5e9b1d20
Revises: 1bdcad476529
Create Date: 2026-11-19 10:00:00
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7a3c5e9b1d20"
down_revision = "1bdcad476529"
branch_labels = None
depends_on = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def _org():
    return sa.Column("organization_id", sa.String(32), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)


def upgrade() -> None:
    op.add_column("items", sa.Column("category", sa.String(120), nullable=True))
    op.add_column("items", sa.Column("brand", sa.String(120), nullable=True))
    op.create_index("ix_items_category", "items", ["category"])
    op.add_column("org_roles", sa.Column("actions", sa.Text(), nullable=True))
    op.add_column("org_roles", sa.Column("workspace_id", sa.String(32), nullable=True))
    op.create_index("ix_org_roles_workspace_id", "org_roles", ["workspace_id"])

    op.create_table(
        "ai_workspaces",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("department", sa.String(80), nullable=False),
        sa.Column("description", sa.String(300)),
        sa.Column("permissions", sa.Text(), nullable=False),
        sa.Column("config", sa.Text(), nullable=False),
        sa.Column("role_id", sa.String(32)),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        _org(),
        *_ts(),
        sa.UniqueConstraint("organization_id", "name", name="uq_ai_workspace_org_name"),
    )
    op.create_index("ix_ai_workspaces_role_id", "ai_workspaces", ["role_id"])

    op.create_table(
        "ai_employees",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("workspace_id", sa.String(32), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="SET NULL"), index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, index=True),
        sa.Column("job_title", sa.String(80)),
        sa.Column("status", sa.String(10), nullable=False, index=True),
        sa.Column("invite_token_hash", sa.String(64), unique=True, index=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True)),
        sa.Column("invited_by", sa.String(32)),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("last_active_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("ai_enabled", sa.Boolean(), nullable=False),
        sa.Column("allow_auto", sa.Boolean(), nullable=False),
        sa.Column("allow_manual", sa.Boolean(), nullable=False),
        sa.Column("monthly_budget_usd", sa.Numeric(10, 4)),
        sa.Column("daily_call_limit", sa.Integer()),
        sa.Column("preferred_mode", sa.String(10), nullable=False),
        _org(),
        *_ts(),
        sa.UniqueConstraint("organization_id", "email", name="uq_ai_employee_org_email"),
    )

    op.create_table(
        "ai_chats",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("workspace_id", sa.String(32), sa.ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("summarized_upto", sa.Integer(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), nullable=False),
        _org(),
        *_ts(),
    )
    op.create_index("ix_ai_chats_user_updated", "ai_chats", ["user_id", "updated_at"])

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("chat_id", sa.String(32), sa.ForeignKey("ai_chats.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("organization_id", sa.String(32), nullable=False, index=True),
        sa.Column("user_id", sa.String(32), nullable=False, index=True),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("meta", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )

    op.create_table(
        "ai_pending_actions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False, index=True),
        sa.Column("workspace_id", sa.String(32), nullable=False),
        sa.Column("chat_id", sa.String(32), sa.ForeignKey("ai_chats.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.String(32), nullable=False, index=True),
        sa.Column("tool", sa.String(60), nullable=False),
        sa.Column("args", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, index=True),
        sa.Column("result", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ai_attachments",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False, index=True),
        sa.Column("user_id", sa.String(32), nullable=False, index=True),
        sa.Column("chat_id", sa.String(32), index=True),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(60), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False, index=True),
        sa.Column("path", sa.String(400), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ai_usage",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False, index=True),
        sa.Column("workspace_id", sa.String(32), index=True),
        sa.Column("user_id", sa.String(32), nullable=False, index=True),
        sa.Column("feature", sa.String(30), nullable=False),
        sa.Column("model", sa.String(60), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=False),
        sa.Column("ok", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )
    op.create_index("ix_ai_usage_org_created", "ai_usage", ["organization_id", "created_at"])

    op.create_table(
        "ai_cache",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False, index=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "ai_org_settings",
        sa.Column("organization_id", sa.String(32), sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("ai_enabled", sa.Boolean(), nullable=False),
        sa.Column("monthly_budget_usd", sa.Numeric(10, 2), nullable=False),
        sa.Column("default_employee_budget_usd", sa.Numeric(10, 2), nullable=False),
        sa.Column("default_daily_call_limit", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for table in (
        "ai_org_settings",
        "ai_cache",
        "ai_usage",
        "ai_attachments",
        "ai_pending_actions",
        "ai_messages",
        "ai_chats",
        "ai_employees",
        "ai_workspaces",
    ):
        op.drop_table(table)
    op.drop_index("ix_org_roles_workspace_id", table_name="org_roles")
    with op.batch_alter_table("org_roles") as batch:
        batch.drop_column("workspace_id")
        batch.drop_column("actions")
    op.drop_index("ix_items_category", table_name="items")
    with op.batch_alter_table("items") as batch:
        batch.drop_column("brand")
        batch.drop_column("category")
