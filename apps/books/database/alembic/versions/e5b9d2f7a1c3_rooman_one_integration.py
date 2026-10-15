"""Rooman One integration: contacts.party_id, the event outbox and processed events

- ``contacts.party_id`` (nullable, 32-hex): the shared customer record in Core.
  ``contacts.party_sync_pending``: a change Core has not seen yet.
- ``outbox``: events written in the same transaction as the change, delivered
  by the relay (webhooks now, NATS later). Columns match rooman_sdk.outbox.
- ``processed_events``: ids of events Books already handled (consume once).

Nothing is backfilled; every existing row keeps working unchanged, and the new
tables stay empty while INTEGRATION_ENABLED is off.

Revision ID: e5b9d2f7a1c3
Revises: c7a2e9d4b1f6
Create Date: 2026-10-15
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "e5b9d2f7a1c3"
down_revision = "c7a2e9d4b1f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("contacts") as batch:
        batch.add_column(sa.Column("party_id", sa.String(32), nullable=True))
        batch.add_column(sa.Column("party_sync_pending", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.create_index("ix_contacts_party_id", ["party_id"])

    op.create_table(
        "outbox",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("org_id", sa.String(36), nullable=False),
        sa.Column("type", sa.String(80), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_to", sa.JSON(), nullable=True),
    )
    op.create_index("ix_outbox_org_id", "outbox", ["org_id"])
    op.create_index("ix_outbox_published_at", "outbox", ["published_at"])
    op.create_index("ix_outbox_failed_at", "outbox", ["failed_at"])

    op.create_table(
        "processed_events",
        sa.Column("consumer", sa.String(80), primary_key=True),
        sa.Column("event_id", sa.String(40), primary_key=True),
        sa.Column("org_id", sa.String(36), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_processed_events_org_id", "processed_events", ["org_id"])


def downgrade() -> None:
    op.drop_table("processed_events")
    op.drop_table("outbox")
    with op.batch_alter_table("contacts") as batch:
        batch.drop_index("ix_contacts_party_id")
        batch.drop_column("party_sync_pending")
        batch.drop_column("party_id")
