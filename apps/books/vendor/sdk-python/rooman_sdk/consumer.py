"""Process each event once. Delivery is at least once, so consumers record the
ids they have handled in ``processed_events`` and skip repeats."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, MetaData, String, Table
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from rooman_sdk.events import EventEnvelope


def processed_events_table(metadata: MetaData, name: str = "processed_events") -> Table:
    return Table(
        name,
        metadata,
        Column("consumer", String(80), primary_key=True),
        Column("event_id", String(40), primary_key=True),
        Column("org_id", String(36), nullable=False, index=True),
        Column("processed_at", DateTime(timezone=True), nullable=False),
    )


def handle_once(
    session: Session,
    table: Table,
    consumer: str,
    event: EventEnvelope,
    handler: Callable[[Session, EventEnvelope], None],
) -> bool:
    """Run ``handler`` and record the event in the caller's transaction.

    Returns False, without calling the handler, when this consumer already
    processed the event. The caller commits; if the handler raises, the caller
    rolls back, nothing is recorded and the event is retried.
    """
    savepoint = session.begin_nested()
    try:
        session.execute(table.insert().values(consumer=consumer, event_id=event.id, org_id=event.org_id, processed_at=datetime.now(UTC)))
        savepoint.commit()
    except IntegrityError:
        savepoint.rollback()
        return False
    handler(session, event)
    return True
