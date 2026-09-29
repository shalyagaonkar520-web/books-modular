"""Super-admin org settings: global defaults, per-org settings, archive/restore,
the tenant login block for suspended orgs and the tenant org defaults API."""

import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa

from backend.db import SessionLocal
from backend.models import Contact, Organization, PlatformAdmin, User
from backend.security import hash_password
from tests.conftest import auth, register_org

ROOT = Path(__file__).resolve().parent.parent


def _make_admin(password: str = "Sup3rPass!") -> tuple[str, str]:
    email = f"root-{uuid.uuid4().hex[:8]}@platform.example.com"
    with SessionLocal() as db:
        db.add(PlatformAdmin(name="Platform Root", email=email, password_hash=hash_password(password), is_active=True))
        db.commit()
    return email, password


@pytest.fixture
def super_admin(client):
    email, password = _make_admin()
    token = client.post("/api/platform/auth/login", json={"email": email, "password": password}).json()["accessToken"]
    return {"email": email, "h": auth(token)}


@pytest.fixture
def restore_defaults(client, super_admin):
    """Global defaults are shared by the whole session: put them back afterwards."""
    yield
    res = client.put(
        "/api/platform/settings",
        headers=super_admin["h"],
        json={"defaultTaxRate": 18, "defaultPaymentTermsDays": 30, "defaultCurrency": "INR"},
    )
    assert res.status_code == 200, res.text


def _create_org(client, h, **extra) -> dict:
    n = uuid.uuid4().hex[:8]
    body = {
        "name": f"Platform Org {n}",
        "adminName": "Org Owner",
        "adminEmail": f"owner-{n}@platform-org.example.com",
        "adminPassword": "Str0ngPass!",
        **extra,
    }
    res = client.post("/api/platform/organizations", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


# --------------------------------------------------------------------------- #
# Migration + model defaults
# --------------------------------------------------------------------------- #
def test_migration_backfills_defaults():
    """Upgrading an existing database gives old orgs 18% / 30 days / not archived."""
    tmp = tempfile.mkdtemp(prefix="rb-mig-")
    db_path = Path(tmp) / "mig.db"
    env = {
        **os.environ,
        "DATABASE_URL": f"sqlite:///{db_path.as_posix()}",
        "ENVIRONMENT": "test",
        "SECRET_KEY": "x",
        "DATA_DIR": tmp,
    }

    def alembic(*args):
        res = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "database/alembic.ini", *args],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
        )
        assert res.returncode == 0, res.stderr

    alembic("upgrade", "b8e2f4a6c1d9")
    engine = sa.create_engine(f"sqlite:///{db_path.as_posix()}")
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO organizations (id, name, country, currency, fiscal_year_start_month, is_suspended, created_at, updated_at) "
                "VALUES ('legacyorg', 'Legacy', 'India', 'INR', 4, 0, '2026-01-01', '2026-01-01')"
            )
        )
    alembic("upgrade", "head")
    with engine.connect() as conn:
        row = conn.execute(
            sa.text("SELECT default_tax_rate, default_payment_terms_days, deleted_at FROM organizations WHERE id = 'legacyorg'")
        ).one()
    engine.dispose()
    assert float(row[0]) == 18.0 and row[1] == 30 and row[2] is None


def test_model_defaults():
    with SessionLocal() as db:
        org = Organization(name="Model Default Org")
        db.add(org)
        db.commit()
        assert float(org.default_tax_rate) == 18.0
        assert org.default_payment_terms_days == 30
        assert org.deleted_at is None and org.is_archived is False
        db.delete(org)
        db.commit()


# --------------------------------------------------------------------------- #
# Global defaults
# --------------------------------------------------------------------------- #
def test_settings_defaults_and_validation(client, super_admin, restore_defaults):
    g = client.get("/api/platform/settings", headers=super_admin["h"])
    assert g.status_code == 200
    body = g.json()
    assert body["defaultTaxRate"] == 18 and body["defaultPaymentTermsDays"] == 30 and body["defaultCurrency"] == "INR"
    assert {"allowPublicSignup", "environment", "razorpayConfigured", "smtpConfigured"} <= body.keys()

    for bad in (
        {"defaultTaxRate": -1},
        {"defaultTaxRate": 100.5},
        {"defaultTaxRate": None},
        {"defaultPaymentTermsDays": 366},
        {"defaultPaymentTermsDays": -1},
        {"defaultCurrency": "usd"},
        {"defaultCurrency": "USDX"},
        {"defaultCurrency": None},
    ):
        assert client.put("/api/platform/settings", headers=super_admin["h"], json=bad).status_code == 422, bad

    put = client.put(
        "/api/platform/settings",
        headers=super_admin["h"],
        json={"defaultTaxRate": 12.5, "defaultPaymentTermsDays": 45, "defaultCurrency": "USD"},
    )
    assert put.status_code == 200, put.text
    assert put.json()["defaultTaxRate"] == 12.5 and put.json()["defaultPaymentTermsDays"] == 45 and put.json()["defaultCurrency"] == "USD"
    again = client.get("/api/platform/settings", headers=super_admin["h"]).json()
    assert again["defaultTaxRate"] == 12.5 and again["defaultCurrency"] == "USD"


def test_new_orgs_inherit_global_defaults(client, super_admin, restore_defaults):
    assert client.put(
        "/api/platform/settings",
        headers=super_admin["h"],
        json={"defaultTaxRate": 5, "defaultPaymentTermsDays": 7, "defaultCurrency": "AED"},
    ).status_code == 200

    # Platform-created org, currency omitted -> global default currency.
    created = _create_org(client, super_admin["h"])["organization"]
    assert created["currency"] == "AED" and created["defaultTaxRate"] == 5 and created["defaultPaymentTermsDays"] == 7
    # An explicit currency still wins.
    explicit = _create_org(client, super_admin["h"], currency="GBP")["organization"]
    assert explicit["currency"] == "GBP" and explicit["defaultTaxRate"] == 5
    assert client.post(
        "/api/platform/organizations",
        headers=super_admin["h"],
        json={"name": "Bad Cur", "currency": "gb", "adminName": "X Y", "adminEmail": "badcur@platform-org.example.com", "adminPassword": "Str0ngPass!"},
    ).status_code == 422

    # Tenant self-registration.
    ctx = register_org(client, "Inherit")
    assert ctx["org"]["currency"] == "AED"
    assert ctx["org"]["defaultTaxRate"] == 5 and ctx["org"]["defaultPaymentTermsDays"] == 7


# --------------------------------------------------------------------------- #
# Per-org settings
# --------------------------------------------------------------------------- #
def test_patch_org_settings_round_trip_and_validation(client, super_admin):
    ctx = register_org(client, "Settable")
    org_id = ctx["org"]["id"]
    url = f"/api/platform/organizations/{org_id}"
    payload = {
        "name": "Settable Renamed",
        "legalName": "Settable Pvt Ltd",
        "gstin": "29ABCDE1234F1Z5",
        "email": "accounts@settable.example.com",
        "phone": "+91 98765 43210",
        "currency": "USD",
        "fiscalYearStartMonth": 1,
        "defaultTaxRate": 12,
        "defaultPaymentTermsDays": 60,
        "invoiceTerms": "Net 60",
        "invoiceNotes": "Thanks for your business",
    }
    res = client.patch(url, headers=super_admin["h"], json=payload)
    assert res.status_code == 200, res.text
    body = client.get(url, headers=super_admin["h"]).json()
    assert body["name"] == "Settable Renamed" and body["legalName"] == "Settable Pvt Ltd"
    assert body["gstin"] == "29ABCDE1234F1Z5" and body["email"] == "accounts@settable.example.com"
    assert body["phone"] == "9876543210" and body["currency"] == "USD"
    assert body["fiscalYearStartMonth"] == 1 and body["defaultTaxRate"] == 12 and body["defaultPaymentTermsDays"] == 60
    assert body["invoiceTerms"] == "Net 60" and body["invoiceNotes"] == "Thanks for your business"
    assert body["isArchived"] is False and body["deletedAt"] is None
    assert body["lastLoginAt"] is not None  # register stamps the admin's login

    # Clearing an optional text field is allowed.
    cleared = client.patch(url, headers=super_admin["h"], json={"legalName": "", "invoiceNotes": None})
    assert cleared.status_code == 200 and cleared.json()["legalName"] is None and cleared.json()["invoiceNotes"] is None

    # Explicit null on a required field -> 422.
    for field in ("name", "currency", "fiscalYearStartMonth", "defaultTaxRate", "defaultPaymentTermsDays", "isSuspended"):
        assert client.patch(url, headers=super_admin["h"], json={field: None}).status_code == 422, field
    # Out of range / malformed -> 422.
    for bad in (
        {"defaultTaxRate": 101},
        {"defaultTaxRate": -0.5},
        {"defaultPaymentTermsDays": 400},
        {"fiscalYearStartMonth": 13},
        {"fiscalYearStartMonth": 0},
        {"currency": "usd"},
        {"gstin": "not-a-gstin"},
        {"email": "nope"},
    ):
        assert client.patch(url, headers=super_admin["h"], json=bad).status_code == 422, bad

    # The tenant sees what the platform admin set.
    tenant = client.get("/api/organization", headers=auth(ctx["token"])).json()
    assert tenant["defaultTaxRate"] == 12 and tenant["defaultPaymentTermsDays"] == 60 and tenant["currency"] == "USD"


# --------------------------------------------------------------------------- #
# Archive / restore / permanent delete
# --------------------------------------------------------------------------- #
def test_archive_locks_out_and_restore_brings_back(client, super_admin):
    ctx = register_org(client, "Archivable")
    org_id = ctx["org"]["id"]
    th = auth(ctx["token"])
    creds = {"email": ctx["email"], "password": ctx["password"]}
    assert client.get("/api/items", headers=th).status_code == 200

    arch = client.post(f"/api/platform/organizations/{org_id}/archive", headers=super_admin["h"])
    assert arch.status_code == 200, arch.text
    a = arch.json()
    assert a["isArchived"] is True and a["deletedAt"] is not None
    assert a["isSuspended"] is True and a["suspendedReason"] == "Archived by platform admin"

    # Locked out: existing token and fresh login.
    assert client.get("/api/items", headers=th).status_code == 403
    login = client.post("/api/auth/login", json=creds)
    assert login.status_code == 403 and "suspended" in login.json()["detail"].lower()

    # Hidden by default and from "suspended"/"active"; visible with archived/all.
    def listed(status=None):
        params = {"search": ctx["org"]["name"], "pageSize": 100}
        if status:
            params["status"] = status
        res = client.get("/api/platform/organizations", headers=super_admin["h"], params=params)
        assert res.status_code == 200
        return {o["id"]: o for o in res.json()["items"]}

    assert org_id not in listed()
    assert org_id not in listed("active")
    assert org_id not in listed("suspended")
    assert listed("archived")[org_id]["isArchived"] is True
    assert org_id in listed("all")

    csv_default = client.get("/api/platform/organizations/export", headers=super_admin["h"], params={"search": ctx["org"]["name"]}).text
    assert ctx["org"]["name"] not in csv_default
    csv_archived = client.get(
        "/api/platform/organizations/export", headers=super_admin["h"], params={"search": ctx["org"]["name"], "status": "archived"}
    ).text
    assert ctx["org"]["name"] in csv_archived

    # Global search still finds it, flagged.
    found = client.get("/api/platform/search", headers=super_admin["h"], params={"q": ctx["org"]["name"]}).json()
    assert any(o["id"] == org_id and o["isArchived"] for o in found["organizations"])

    # Plain unsuspend is refused for an archived org.
    assert client.patch(f"/api/platform/organizations/{org_id}", headers=super_admin["h"], json={"isSuspended": False}).status_code == 400

    # Restore.
    rest = client.post(f"/api/platform/organizations/{org_id}/restore", headers=super_admin["h"])
    assert rest.status_code == 200, rest.text
    r = rest.json()
    assert r["isArchived"] is False and r["deletedAt"] is None
    assert r["isSuspended"] is False and r["suspendedAt"] is None and r["suspendedReason"] is None
    assert org_id in listed() and org_id in listed("active")
    assert client.post("/api/auth/login", json=creds).status_code == 200
    assert client.get("/api/items", headers=th).status_code == 200

    # Both actions are audited.
    logs = client.get("/api/platform/audit-logs", headers=super_admin["h"], params={"organizationId": org_id}).json()["items"]
    actions = {entry["action"] for entry in logs}
    assert {"archive", "restore"} <= actions

    assert client.post("/api/platform/organizations/nope/archive", headers=super_admin["h"]).status_code == 404
    assert client.post("/api/platform/organizations/nope/restore", headers=super_admin["h"]).status_code == 404


def test_suspended_org_login_blocked(client, super_admin):
    ctx = register_org(client, "SuspLogin")
    org_id = ctx["org"]["id"]
    client.patch(f"/api/platform/organizations/{org_id}", headers=super_admin["h"], json={"isSuspended": True})
    res = client.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]})
    assert res.status_code == 403
    assert res.json()["detail"] == "This organization has been suspended. Contact support."
    # Wrong password on a suspended org still reads as bad credentials.
    assert client.post("/api/auth/login", json={"email": ctx["email"], "password": "WrongPass9!"}).status_code == 401
    client.patch(f"/api/platform/organizations/{org_id}", headers=super_admin["h"], json={"isSuspended": False})
    assert client.post("/api/auth/login", json={"email": ctx["email"], "password": ctx["password"]}).status_code == 200


def test_permanent_delete_still_cascades(client, super_admin):
    ctx = register_org(client, "Purgeable")
    org_id = ctx["org"]["id"]
    h = auth(ctx["token"])
    assert client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Doomed Customer"}).status_code in (200, 201)
    # Archive first, then purge: an archived org can still be permanently deleted.
    assert client.post(f"/api/platform/organizations/{org_id}/archive", headers=super_admin["h"]).status_code == 200
    assert client.delete(f"/api/platform/organizations/{org_id}", headers=super_admin["h"]).status_code == 200
    assert client.get(f"/api/platform/organizations/{org_id}", headers=super_admin["h"]).status_code == 404
    with SessionLocal() as db:
        assert db.get(Organization, org_id) is None
        assert db.scalar(sa.select(sa.func.count()).select_from(User).where(User.organization_id == org_id)) == 0
        assert db.scalar(sa.select(sa.func.count()).select_from(Contact).where(Contact.organization_id == org_id)) == 0


# --------------------------------------------------------------------------- #
# Tenant org API
# --------------------------------------------------------------------------- #
def test_tenant_org_defaults_read_and_update(client):
    ctx = register_org(client, "TenantDefaults")
    h = auth(ctx["token"])
    got = client.get("/api/organization", headers=h)
    assert got.status_code == 200
    assert "defaultTaxRate" in got.json() and "defaultPaymentTermsDays" in got.json()

    put = client.put("/api/organization", headers=h, json={"defaultTaxRate": 28, "defaultPaymentTermsDays": 90})
    assert put.status_code == 200, put.text
    assert put.json()["defaultTaxRate"] == 28 and put.json()["defaultPaymentTermsDays"] == 90
    assert client.get("/api/organization", headers=h).json()["defaultTaxRate"] == 28

    for bad in ({"defaultTaxRate": 150}, {"defaultPaymentTermsDays": 366}, {"defaultTaxRate": None}, {"defaultPaymentTermsDays": None}):
        assert client.put("/api/organization", headers=h, json=bad).status_code == 422, bad


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
def test_dashboard_counts_archived(client, super_admin):
    def counts():
        d = client.get("/api/platform/dashboard", headers=super_admin["h"]).json()
        return d["totalOrganizations"], d["activeOrganizations"], d["suspendedOrganizations"], d["archivedOrganizations"]

    ctx = register_org(client, "DashArchive")
    org_id = ctx["org"]["id"]
    total0, active0, susp0, arch0 = counts()

    client.post(f"/api/platform/organizations/{org_id}/archive", headers=super_admin["h"])
    total1, active1, susp1, arch1 = counts()
    assert total1 == total0 and arch1 == arch0 + 1 and active1 == active0 - 1 and susp1 == susp0
    # Orgs awaiting (or declined) sign-up approval are not "active" either.
    d = client.get("/api/platform/dashboard", headers=super_admin["h"]).json()
    assert active1 + susp1 + arch1 + d["pendingOrganizations"] + d["rejectedOrganizations"] == total1

    client.post(f"/api/platform/organizations/{org_id}/restore", headers=super_admin["h"])
    assert counts() == (total0, active0, susp0, arch0)
