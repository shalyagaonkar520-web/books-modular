"""Pytest fixtures: isolated SQLite database per test session, in-process API client."""
from __future__ import annotations

import datetime
import os
import shutil
import tempfile
from datetime import date

import pytest

if not hasattr(datetime, "UTC"):
    datetime.UTC = datetime.timezone.utc  # noqa: UP017

_TMP = tempfile.mkdtemp(prefix="roomanbooks-test-")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_TMP}/test.db"
os.environ["DATA_DIR"] = _TMP
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["LOGIN_RATE_LIMIT_PER_MINUTE"] = "1000"

from fastapi.testclient import TestClient  # noqa: E402

from backend.db import Base, engine  # noqa: E402
from backend.main import app  # noqa: E402

TODAY = date.today().isoformat()


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


def register_org(client: TestClient, name_hint: str = "Org") -> dict:
    _counter["n"] += 1
    n = _counter["n"]
    res = client.post(
        "/api/auth/register",
        json={
            "name": f"Admin {n}",
            "email": f"admin{n}@{name_hint.lower()}.example.com",
            "password": "Str0ngPass!",
            "organizationName": f"{name_hint} {n}",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    return {"token": body["accessToken"], "user": body["user"], "org": body["organization"], "email": f"admin{n}@{name_hint.lower()}.example.com", "password": "Str0ngPass!"}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def org(client):
    """A fully set up organization with a bank account, customer, vendor and tracked item."""
    ctx = register_org(client, "Rooman")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Operating Account", "type": "bank", "openingBalance": 500000, "openingBalanceDate": "2026-04-01", "isPrimary": True},
    ).json()
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Acme Ltd", "email": "ap@acme.example.com", "paymentTermsDays": 15}).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Dell India", "paymentTermsDays": 30}).json()
    item = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "27 inch Monitor", "sku": "MON-27", "type": "goods", "sellingPrice": 10000, "costPrice": 7000, "taxRate": 18,
            "trackInventory": True, "openingStock": 20, "openingStockRate": 7000, "reorderLevel": 5,
        },
    ).json()
    service = client.post("/api/items", headers=h, json={"name": "Consulting", "sku": "SRV-CON", "type": "service", "sellingPrice": 2500, "costPrice": 0, "taxRate": 18}).json()
    accounts = client.get("/api/accounting/accounts", headers=h).json()
    ctx.update({"h": h, "bank": bank, "customer": customer, "vendor": vendor, "item": item, "service": service, "accounts": {a["code"]: a for a in accounts}})
    return ctx


def trial_balance_ok(client: TestClient, h: dict) -> bool:
    tb = client.get("/api/accounting/trial-balance", headers=h).json()
    return abs(tb["totalDebit"] - tb["totalCredit"]) < 0.005
