"""Rooman One integration (backend/integrations): off by default, then with the
flag on - the customer link to Core (Core mocked), the outbox and relay, the
incoming /internal/events endpoint and the Core client."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from rooman_sdk.consumer import processed_events_table
from rooman_sdk.events import Actor, EventEnvelope, sign, verify
from rooman_sdk.outbox import outbox_table
from sqlalchemy import MetaData, delete, select

from backend.config import get_settings
from backend.db import SessionLocal
from backend.integrations import contracts, customers, inbound, relay
from backend.integrations import core_client as cc
from backend.integrations.tables import SDK_OUTBOX_COLUMNS, outbox, processed_events
from backend.main import create_app
from backend.models import Contact
from tests.conftest import auth, platform_admin_headers, register_org

SECRET = "test-event-signing-secret"
HOOK = "https://core.internal.test/internal/events"


class FakeCore:
    """Stands in for Core's service API."""

    def __init__(self):
        self.parties: dict[str, dict] = {}
        self.calls: list[tuple] = []
        self.down = False

    def find_or_create_party(self, org_id, name, email, phone, type, local_id=None):
        self.calls.append(("find_or_create", org_id, name, local_id))
        if self.down:
            raise cc.CoreUnavailable("Core is down")
        party_id = str(uuid.uuid4())
        self.parties[party_id] = {"org_id": org_id, "name": name, "email": email}
        return party_id

    def update_party(self, party_id, *, org_id, name, email, phone, type):
        self.calls.append(("update", party_id, name))
        if self.down:
            raise cc.CoreUnavailable("Core is down")
        self.parties[party_id].update(name=name, email=email)

    def get_entitlements(self, org_id):
        return {}


@pytest.fixture
def flag_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "integration_enabled", True)
    monkeypatch.setattr(settings, "event_signing_secret", SECRET)
    monkeypatch.setattr(settings, "event_signing_secret_previous", "previous-secret")
    monkeypatch.setattr(settings, "event_subscribers", [HOOK])
    monkeypatch.setattr(settings, "event_transport", "webhook")
    fake = FakeCore()
    monkeypatch.setattr(customers, "core", lambda: fake)
    with SessionLocal() as db:
        db.execute(delete(outbox))
        db.execute(delete(processed_events))
        db.commit()
    yield fake


@pytest.fixture
def on_client(flag_on) -> TestClient:
    return TestClient(create_app())


@pytest.fixture
def tenant(client):
    ctx = register_org(client, "Integ")
    return {"h": auth(ctx["token"]), "org_id": ctx["org"]["id"]}


def _events(type_: str | None = None) -> list[dict]:
    with SessionLocal() as db:
        rows = db.execute(select(outbox).order_by(outbox.c.created_at)).all()
    return [r.payload for r in rows if type_ is None or r.type == type_]


def _new_customer(c: TestClient, tenant, name="Ravi Traders", email="ravi@traders.example.com"):
    res = c.post("/api/contacts", headers=tenant["h"], json={"type": "customer", "displayName": name, "email": email})
    assert res.status_code == 201, res.text
    return res.json()


# --------------------------------------------------------------------------- #
# Off by default: Books behaves exactly as before
# --------------------------------------------------------------------------- #
def test_off_by_default(client, tenant, monkeypatch):
    assert get_settings().integration_enabled is False and get_settings().auth_mode == "local"
    called = []
    monkeypatch.setattr(customers, "core", lambda: called.append(1))
    contact = _new_customer(client, tenant, email="off@traders.example.com")
    assert called == [] and _events() == [] or all(e["data"].get("app_local_id") != contact["id"] for e in _events())
    with SessionLocal() as db:
        assert db.get(Contact, contact["id"]).party_id is None
    # The internal endpoints are not mounted at all.
    assert client.post("/internal/events", content=b"{}").status_code == 404
    assert client.get("/api/platform/integration/failed-events").status_code == 404


def test_tables_match_the_sdk():
    sdk_outbox = outbox_table(MetaData())
    assert [c.name for c in sdk_outbox.columns] == list(SDK_OUTBOX_COLUMNS)
    for name in SDK_OUTBOX_COLUMNS:
        assert type(outbox.c[name].type) is type(sdk_outbox.c[name].type), name
    sdk_processed = processed_events_table(MetaData())
    assert [c.name for c in processed_events.columns] == [c.name for c in sdk_processed.columns]


# --------------------------------------------------------------------------- #
# Customer link to Core
# --------------------------------------------------------------------------- #
def test_new_customer_is_linked_and_announced(on_client, tenant, flag_on):
    contact = _new_customer(on_client, tenant)
    with SessionLocal() as db:
        row = db.get(Contact, contact["id"])
        assert row.party_id and len(row.party_id) == 32 and row.party_sync_pending is False
    assert flag_on.calls[0][0] == "find_or_create" and flag_on.calls[0][3] == contact["id"]
    [event] = _events("customer.created")
    contracts.validate(event)  # matches contracts/events/customer.created.v1
    assert event["org_id"] == str(uuid.UUID(tenant["org_id"])) and event["data"]["party_id"] == str(uuid.UUID(row.party_id))
    assert event["data"]["app_local_id"] == str(uuid.UUID(contact["id"])) and event["source"] == "books"


def test_core_down_never_blocks_the_user_and_is_retried(on_client, tenant, flag_on):
    flag_on.down = True
    contact = _new_customer(on_client, tenant, name="Offline Ltd", email="offline@example.com")
    with SessionLocal() as db:
        row = db.get(Contact, contact["id"])
        assert row.party_id is None and row.party_sync_pending is True
    assert _events("customer.created") == []
    flag_on.down = False
    with SessionLocal() as db:
        # Each round links up to 50 waiting contacts (other tests leave many); keep going like the relay does.
        for _ in range(200):
            if customers.retry_pending(db) == 0 or db.get(Contact, contact["id"]).party_id is not None:
                break
            db.expire_all()
        assert db.get(Contact, contact["id"]).party_id is not None
    assert any(e["data"]["app_local_id"] == str(uuid.UUID(contact["id"])) for e in _events("customer.created"))


def test_edits_update_core_only_when_shared_fields_change(on_client, tenant, flag_on):
    contact = _new_customer(on_client, tenant, name="Edit Me", email="edit@example.com")
    flag_on.calls.clear()
    on_client.put(f"/api/contacts/{contact['id']}", headers=tenant["h"], json={"notes": "Books-only note"})
    assert flag_on.calls == []
    on_client.put(f"/api/contacts/{contact['id']}", headers=tenant["h"], json={"displayName": "Edited Ltd"})
    assert flag_on.calls and flag_on.calls[0][0] == "update"
    [event] = _events("customer.updated")
    contracts.validate(event)
    assert event["data"]["changed"] == ["display_name"] and event["data"]["display_name"] == "Edited Ltd"


# --------------------------------------------------------------------------- #
# Relay: webhook delivery, retries, failed-events list
# --------------------------------------------------------------------------- #
def test_relay_delivers_signed_events(on_client, tenant, flag_on):
    _new_customer(on_client, tenant, name="Relay Ltd", email="relay@example.com")
    sent = []

    def fake_post(url, body, headers):
        sent.append((url, body, headers))
        return 202

    with patch.object(relay, "_post", fake_post), SessionLocal() as db:
        assert relay.deliver_due(db) == 1
        assert relay.deliver_due(db) == 0  # nothing left
        row = db.execute(select(outbox)).first()
        assert row.published_at is not None and row.delivered_to == [HOOK]
    url, body, headers = sent[0]
    assert url == HOOK and verify(body, headers["X-Rooman-Signature"], [SECRET])
    assert headers["X-Rooman-Event-Id"] == json.loads(body)["id"]


def test_relay_retries_with_backoff_then_marks_failed(on_client, tenant, flag_on, monkeypatch):
    monkeypatch.setattr(get_settings(), "event_max_attempts", 2)
    _new_customer(on_client, tenant, name="Flaky Ltd", email="flaky@example.com")
    with patch.object(relay, "_post", lambda *a: 503), SessionLocal() as db:
        relay.deliver_due(db)
        row = db.execute(select(outbox)).first()
        assert row.attempts == 1 and row.published_at is None and row.failed_at is None and "503" in row.last_error
        db.execute(outbox.update().values(next_attempt_at=datetime.now(UTC) - timedelta(seconds=1)))
        db.commit()
        relay.deliver_due(db)
        row = db.execute(select(outbox)).first()
        assert row.attempts == 2 and row.failed_at is not None
        assert relay.deliver_due(db) == 0  # failed events wait for a person
    ph = platform_admin_headers(on_client)
    failed = on_client.get("/api/platform/integration/failed-events", headers=ph).json()
    assert failed[0]["id"] == row.id and failed[0]["type"] == "customer.created"
    assert on_client.get("/api/platform/integration/failed-events", headers=tenant["h"]).status_code == 401
    assert on_client.post(f"/api/platform/integration/failed-events/{row.id}/retry", headers=ph).status_code == 200
    with patch.object(relay, "_post", lambda *a: 200), SessionLocal() as db:
        assert relay.deliver_due(db) == 1


def test_one_subscriber_failing_does_not_resend_to_the_others(on_client, tenant, flag_on, monkeypatch):
    other = "https://bookings.internal.test/internal/events"
    monkeypatch.setattr(get_settings(), "event_subscribers", [HOOK, other])
    _new_customer(on_client, tenant, name="Two Hooks", email="two@example.com")
    sent = []

    def post(url, body, headers):
        sent.append(url)
        return 200 if url == HOOK else 500

    with patch.object(relay, "_post", post), SessionLocal() as db:
        relay.deliver_due(db)
        db.execute(outbox.update().values(next_attempt_at=datetime.now(UTC) - timedelta(seconds=1)))
        db.commit()
        relay.deliver_due(db)
    assert sent.count(HOOK) == 1 and sent.count(other) == 2


# --------------------------------------------------------------------------- #
# Incoming events
# --------------------------------------------------------------------------- #
def _envelope(type_="org.created", data=None, org_id=None) -> EventEnvelope:
    return EventEnvelope(
        type=type_,
        org_id=org_id or str(uuid.uuid4()),
        actor=Actor(type="system"),
        source="core",
        data=data if data is not None else {"code": "acme", "name": "Acme Traders", "status": "active"},
    )


def _post(c: TestClient, body: bytes, secret: str | None = SECRET):
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Rooman-Signature"] = sign(body, secret)
    return c.post("/internal/events", content=body, headers=headers)


def test_incoming_signature_is_checked_before_anything_else(on_client, flag_on):
    body = _envelope().to_json().encode()
    assert _post(on_client, body, secret=None).status_code == 401
    assert _post(on_client, body, secret="wrong").status_code == 401
    assert _post(on_client, b"not json at all", secret="wrong").status_code == 401  # never parsed
    assert _post(on_client, b"not json at all").status_code == 422


def test_incoming_unknown_type_is_accepted_and_ignored(on_client, flag_on):
    example = json.loads(contracts.contracts_dir().joinpath("examples", "org.created.v1.json").read_text(encoding="utf-8"))
    res = _post(on_client, json.dumps(example).encode())
    assert res.status_code == 202 and res.json()["status"] == "ignored"
    assert _post(on_client, json.dumps(example).encode(), secret="previous-secret").status_code == 202  # rotation


def test_incoming_handled_once_and_contract_checked(on_client, flag_on, monkeypatch):
    seen = []
    monkeypatch.setitem(inbound.HANDLERS, "org.created", lambda db, event: seen.append(event.id))
    example = json.loads(contracts.contracts_dir().joinpath("examples", "org.created.v1.json").read_text(encoding="utf-8"))
    example["id"] = f"evt_{uuid.uuid4().hex}"
    body = json.dumps(example).encode()
    first, second = _post(on_client, body), _post(on_client, body)
    assert first.status_code == 200 and first.json()["status"] == "handled"
    assert second.status_code == 200 and second.json()["status"] == "duplicate"
    assert seen == [example["id"]]
    broken = {**example, "id": f"evt_{uuid.uuid4().hex}", "data": {**example["data"], "unexpected": 1}}
    res = _post(on_client, json.dumps(broken).encode())
    assert res.status_code == 422 and "contract" in res.json()["detail"]


def test_a_failing_handler_records_nothing_so_the_event_is_retried(on_client, flag_on, monkeypatch):
    def boom(db, event):
        raise RuntimeError("handler bug")

    monkeypatch.setitem(inbound.HANDLERS, "org.created", boom)
    example = json.loads(contracts.contracts_dir().joinpath("examples", "org.created.v1.json").read_text(encoding="utf-8"))
    example["id"] = f"evt_{uuid.uuid4().hex}"
    res = TestClient(on_client.app, raise_server_exceptions=False).post(
        "/internal/events", content=json.dumps(example).encode(), headers={"X-Rooman-Signature": sign(json.dumps(example).encode(), SECRET)}
    )
    assert res.status_code == 500
    with SessionLocal() as db:
        assert db.execute(select(processed_events).where(processed_events.c.event_id == example["id"])).first() is None


# --------------------------------------------------------------------------- #
# Core client
# --------------------------------------------------------------------------- #
def test_core_client_caches_its_token_and_retries_only_on_5xx(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "core_api_url", "http://core.internal.test")
    monkeypatch.setattr(cc, "RETRY_PAUSE_SECONDS", 0)
    calls = []
    answers = iter([(200, {"access_token": "t1", "expires_in": 900}), (503, None), (200, {"party_id": "p1"}), (409, {"detail": "nope"})])

    def send(method, url, body, headers):
        calls.append((method, url))
        return next(answers)

    client = cc.CoreClient()
    monkeypatch.setattr(client, "_send", send)
    assert client.find_or_create_party("o", "n", None, None, "customer") == "p1"
    with pytest.raises(cc.CoreError) as err:
        client.update_party("p1", org_id="o", name="n", email=None, phone=None, type="customer")
    assert err.value.status == 409
    assert [u for _, u in calls].count("http://core.internal.test/token") == 1  # token reused


def test_core_client_reports_unreachable(monkeypatch):
    monkeypatch.setattr(get_settings(), "core_api_url", "")
    with pytest.raises(cc.CoreUnavailable):
        cc.CoreClient().get_entitlements("o")
