"""connected apps: scoped API keys, event outbox, webhook deliveries, idempotency

Other Rooman apps (or a customer's own system) use Books features through the
normal API with a scoped key, and receive its events by signed webhook.

Revision ID: d3f8a1c6e9b2
Revises: c7a2e9d4b1f6
Create Date: 2026-10-09
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "d3f8a1c6e9b2"
down_revision = "c7a2e9d4b1f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_connections",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("key_prefix", sa.String(24), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("scopes", sa.Text(), nullable=False),
        sa.Column("events", sa.Text(), nullable=False),
        sa.Column("webhook_url", sa.String(500), nullable=True),
        sa.Column("secret_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("service_user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.String(120), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_app_connections_organization_id", "app_connections", ["organization_id"])
    op.create_index("ix_app_connections_key_hash", "app_connections", ["key_hash"], unique=True)

    op.create_table(
        "integration_events",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.String(32), nullable=True),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_integration_events_organization_id", "integration_events", ["organization_id"])

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("event_id", sa.String(32), sa.ForeignKey("integration_events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connection_id", sa.String(32), sa.ForeignKey("app_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_webhook_deliveries_event_id", "webhook_deliveries", ["event_id"])
    op.create_index("ix_webhook_deliveries_connection_id", "webhook_deliveries", ["connection_id"])
    op.create_index("ix_webhook_deliveries_due", "webhook_deliveries", ["status", "next_attempt_at"])

    op.create_table(
        "idempotency_records",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("connection_id", sa.String(32), sa.ForeignKey("app_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("response_body", sa.Text(), nullable=True),
        sa.Column("content_type", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("connection_id", "key", name="uq_idempotency_connection_key"),
    )
    op.create_index("ix_idempotency_records_created_at", "idempotency_records", ["created_at"])


def downgrade() -> None:
    op.drop_table("idempotency_records")
    op.drop_table("webhook_deliveries")
    op.drop_table("integration_events")
    op.drop_table("app_connections")
