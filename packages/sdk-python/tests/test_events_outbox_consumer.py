from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from pydantic import ValidationError
from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.orm import Session

from rooman_sdk import consumer, outbox
from rooman_sdk.events import Actor, EventEnvelope, sign, verify
from rooman_sdk.ids import canonical_uuid, hex_uuid

ORG = uuid.uuid4()
USER = Actor(type="user", id="u1")


def test_books_hex_ids_and_canonical_ids_round_trip():
    assert canonical_uuid(ORG.hex) == str(ORG)
    assert hex_uuid(str(ORG)) == ORG.hex
    with pytest.raises(ValueError):
        canonical_uuid("not-a-uuid")


def test_envelope_normalises_org_id_and_rejects_bad_input():
    event = EventEnvelope(type="invoice.created", org_id=ORG.hex, actor=USER, source="books", data={"n": 1})
    assert event.org_id == str(ORG)
    assert event.id.startswith("evt_")
    with pytest.raises(ValidationError):
        EventEnvelope(type="InvoiceCreated", org_id=str(ORG), actor=USER, source="books", data={})
    with pytest.raises(ValidationError):
        EventEnvelope(type="invoice.created", org_id=str(ORG), actor=USER, source="books", data={}, occurred_at=datetime(2026, 1, 1))
    with pytest.raises(ValidationError):
        EventEnvelope(type="invoice.created", org_id=str(ORG), actor=USER, source="books", data={}, extra="x")


def test_signature_verifies_and_detects_tampering():
    body = EventEnvelope(type="invoice.created", org_id=str(ORG), actor=USER, source="books", data={"total": "10.00"}).to_json()
    signature = sign(body, "s1")
    assert verify(body, signature, ["s1"])
    assert verify(body, signature, ["new-secret", "s1"])  # during a rotation
    assert not verify(body.replace("10.00", "99.00"), signature, ["s1"])
    assert not verify(body, signature, ["other"])
    assert not verify(body, "", ["s1"])


@pytest.fixture
def db():
    metadata = MetaData()
    box = outbox.outbox_table(metadata)
    seen = consumer.processed_events_table(metadata)
    engine = create_engine("sqlite://")

    # pysqlite starts transactions lazily, which breaks SAVEPOINT; this is
    # SQLAlchemy's documented fix. Postgres needs nothing like it.
    @event.listens_for(engine, "connect")
    def _no_pysqlite_begin(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _emit_begin(connection):
        connection.exec_driver_sql("BEGIN")

    metadata.create_all(engine)
    with Session(engine) as session:
        yield session, box, seen


def test_outbox_event_is_kept_only_when_the_transaction_commits(db):
    session, box, _ = db
    outbox.enqueue(session, box, source="books", type="invoice.created", org_id=str(ORG), data={"id": "i1"}, actor=USER)
    session.rollback()
    assert outbox.pending(session, box) == []

    event = outbox.enqueue(session, box, source="books", type="invoice.created", org_id=str(ORG), data={"id": "i2"}, actor=USER)
    session.commit()
    assert [e.id for e in outbox.pending(session, box)] == [event.id]

    outbox.mark_published(session, box, [event.id])
    session.commit()
    assert outbox.pending(session, box) == []


def test_consumer_handles_a_duplicate_delivery_once(db):
    session, _, seen = db
    event = EventEnvelope(type="invoice.created", org_id=str(ORG), actor=USER, source="books", data={})
    calls: list[str] = []

    def handler(_session, evt):
        calls.append(evt.id)

    assert consumer.handle_once(session, seen, "analytics", event, handler) is True
    session.commit()
    assert consumer.handle_once(session, seen, "analytics", event, handler) is False
    # A different consumer gets its own copy.
    assert consumer.handle_once(session, seen, "workflow", event, handler) is True
    session.commit()
    assert calls == [event.id, event.id]


def test_consumer_failure_records_nothing(db):
    session, _, seen = db
    event = EventEnvelope(type="invoice.created", org_id=str(ORG), actor=USER, source="books", data={})

    def broken(_session, _evt):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        consumer.handle_once(session, seen, "analytics", event, broken)
    session.rollback()
    assert consumer.handle_once(session, seen, "analytics", event, lambda *_: None) is True
