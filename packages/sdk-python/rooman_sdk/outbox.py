"""Transactional outbox.

``enqueue`` adds the event to the same session as the business change, so the
event is stored if and only if the change commits. A publisher then reads
pending rows, sends them to the event hub and marks them published.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Column, DateTime, Integer, MetaData, String, Table, select, update
from sqlalchemy.orm import Session

from rooman_sdk.events import Actor, EventEnvelope


def outbox_table(metadata: MetaData, name: str = "outbox") -> Table:
    return Table(
        name,
        metadata,
        Column("id", String(40), primary_key=True),
        Column("org_id", String(36), nullable=False, index=True),
        Column("type", String(80), nullable=False),
        Column("version", Integer, nullable=False, default=1),
        Column("payload", JSON, nullable=False),
        Column("created_at", DateTime(timezone=True), nullable=False),
        Column("published_at", DateTime(timezone=True), nullable=True, index=True),
        Column("attempts", Integer, nullable=False, default=0),
    )


def enqueue(
    session: Session,
    table: Table,
    *,
    source: str,
    type: str,
    org_id: str,
    data: dict[str, Any],
    actor: Actor,
    version: int = 1,
) -> EventEnvelope:
    """Add an event to the outbox in the caller's transaction. Does not commit."""
    event = EventEnvelope(type=type, version=version, org_id=org_id, actor=actor, source=source, data=data)
    session.execute(
        table.insert().values(
            id=event.id,
            org_id=event.org_id,
            type=event.type,
            version=event.version,
            payload=event.model_dump(mode="json"),
            created_at=event.occurred_at,
            published_at=None,
            attempts=0,
        )
    )
    return event


def pending(session: Session, table: Table, limit: int = 100) -> list[EventEnvelope]:
    """Oldest unpublished events. On Postgres the rows are locked, so parallel publishers skip each other."""
    query = select(table.c.payload).where(table.c.published_at.is_(None)).order_by(table.c.created_at).limit(limit)
    if session.get_bind().dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    return [EventEnvelope.model_validate(row.payload) for row in session.execute(query)]


def mark_published(session: Session, table: Table, event_ids: list[str]) -> None:
    if event_ids:
        session.execute(update(table).where(table.c.id.in_(event_ids)).values(published_at=datetime.now(UTC)))


def mark_failed(session: Session, table: Table, event_id: str) -> None:
    session.execute(update(table).where(table.c.id == event_id).values(attempts=table.c.attempts + 1))
