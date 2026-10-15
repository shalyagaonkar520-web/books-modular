"""Books' outbox and processed-events tables.

The columns are exactly those of ``rooman_sdk.outbox.outbox_table`` and
``rooman_sdk.consumer.processed_events_table`` (tests/test_integration_events.py
checks they stay equal), so the SDK functions work on them. They are declared
here rather than built by the SDK so Books imports no SDK code while
INTEGRATION_ENABLED is off.

The outbox adds four delivery columns the SDK does not touch: when to try
next, the last error, when delivery gave up, and which webhook subscribers
already accepted the event (so a retry does not resend to them).
"""

from __future__ import annotations

from sqlalchemy import JSON, Column, DateTime, Integer, String, Table, Text

from backend.db import Base

outbox = Table(
    "outbox",
    Base.metadata,
    Column("id", String(40), primary_key=True),
    Column("org_id", String(36), nullable=False, index=True),
    Column("type", String(80), nullable=False),
    Column("version", Integer, nullable=False, default=1),
    Column("payload", JSON, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("published_at", DateTime(timezone=True), nullable=True, index=True),
    Column("attempts", Integer, nullable=False, default=0),
    # Books' delivery bookkeeping
    Column("next_attempt_at", DateTime(timezone=True), nullable=True),
    Column("last_error", Text, nullable=True),
    Column("failed_at", DateTime(timezone=True), nullable=True, index=True),
    Column("delivered_to", JSON, nullable=True),
)

processed_events = Table(
    "processed_events",
    Base.metadata,
    Column("consumer", String(80), primary_key=True),
    Column("event_id", String(40), primary_key=True),
    Column("org_id", String(36), nullable=False, index=True),
    Column("processed_at", DateTime(timezone=True), nullable=False),
)

SDK_OUTBOX_COLUMNS = ("id", "org_id", "type", "version", "payload", "created_at", "published_at", "attempts")
