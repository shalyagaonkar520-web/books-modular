"""Books -> Core migration: mapping, idempotency, safety and the report."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from core_api import migrate_books as mb
from core_api import models as m
from core_api.db import Base

BOOKS_DDL = """
CREATE TABLE organizations (
  id VARCHAR(32) PRIMARY KEY, name VARCHAR(200) NOT NULL, code VARCHAR(40), panel_content_access TEXT,
  legal_name VARCHAR(200), gstin VARCHAR(20), pan VARCHAR(20), email VARCHAR(200), phone VARCHAR(40),
  country VARCHAR(100) NOT NULL, currency VARCHAR(3) NOT NULL, is_suspended BOOLEAN NOT NULL, suspended_reason TEXT,
  deleted_at DATETIME, approval_status VARCHAR(20) NOT NULL, approved_at DATETIME, rejection_reason TEXT,
  trial_ends_at DATETIME, subscription_status VARCHAR(20) NOT NULL, pending_request TEXT, subscription_decided_at DATETIME,
  subscription_note TEXT, requested_modules TEXT, billing_cycle VARCHAR(10), monthly_price NUMERIC(12, 2),
  plan_price NUMERIC(12, 2), created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE users (
  id VARCHAR(32) PRIMARY KEY, organization_id VARCHAR(32) NOT NULL, name VARCHAR(120) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255), role VARCHAR(20) NOT NULL, is_active BOOLEAN NOT NULL, last_login_at DATETIME, module_access TEXT,
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE platform_admins (
  id VARCHAR(32) PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL, last_login_at DATETIME, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE org_panel_admins (
  id VARCHAR(32) PRIMARY KEY, organization_id VARCHAR(32) NOT NULL, name VARCHAR(120) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL, last_login_at DATETIME, created_by VARCHAR(255),
  must_change_credentials BOOLEAN NOT NULL, reset_requested_at DATETIME, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL);
CREATE TABLE platform_settings (id VARCHAR(32) PRIMARY KEY, key VARCHAR(80) NOT NULL UNIQUE, value TEXT NOT NULL, updated_at DATETIME NOT NULL);
"""

ORG_ACTIVE = uuid.uuid4().hex
ORG_ARCHIVED = uuid.uuid4().hex
ORG_SUSPENDED = uuid.uuid4().hex
ORG_PENDING = uuid.uuid4().hex
USER_ADMIN = uuid.uuid4().hex
USER_STAFF = uuid.uuid4().hex
USER_INVITED = uuid.uuid4().hex
USER_DISABLED = uuid.uuid4().hex
PANEL = uuid.uuid4().hex
PLATFORM = uuid.uuid4().hex
BCRYPT = "$2b$12$abcdefghijklmnopqrstuuJ0Zr7m0d2B1h8Qe1lYk2u9Q3m6X2a0e"
NOW = "2026-10-01 09:30:00.000000"


@pytest.fixture
def pricing(tmp_path: Path) -> Path:
    path = tmp_path / "module_pricing.json"
    path.write_text(
        json.dumps(
            {
                "currency": "INR",
                "period": "month",
                "basePrice": 499,
                "yearlyMultiplier": 10,
                "baseIncludes": ["Dashboard"],
                "modules": [
                    {"key": "customers", "label": "Customers", "price": 99, "requires": [], "core": True},
                    {"key": "invoices", "label": "Invoices", "price": 299, "requires": ["customers"], "core": True},
                    {"key": "payroll", "label": "Payroll", "price": 399, "requires": []},
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


@pytest.fixture
def books(tmp_path: Path):
    """A Books-shaped database with one record for every case the mapping handles."""
    path = tmp_path / "books.db"
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as c:
        for stmt in BOOKS_DDL.split(";"):
            if stmt.strip():
                c.execute(text(stmt))

        def org(id_, name, code, **kw):
            row = dict(
                id=id_, name=name, code=code, panel_content_access=None, legal_name=None, gstin=None, pan=None, email=None, phone=None,
                country="India", currency="INR", is_suspended=False, suspended_reason=None, deleted_at=None, approval_status="approved",
                approved_at=NOW, rejection_reason=None, trial_ends_at=None, subscription_status="active", pending_request=None,
                subscription_decided_at=None, subscription_note=None, requested_modules=None, billing_cycle=None, monthly_price=None,
                plan_price=None, created_at=NOW, updated_at=NOW,
            )  # fmt: skip
            row.update(kw)
            c.execute(text(f"INSERT INTO organizations ({','.join(row)}) VALUES ({','.join(':' + k for k in row)})"), row)

        org(ORG_ACTIVE, "Acme Traders", "acme", gstin="29ABCDE1234F1Z5", panel_content_access=json.dumps(["invoices", "branding"]),
            requested_modules=json.dumps(["customers", "invoices"]), billing_cycle="yearly", monthly_price="398.00", plan_price="3980.00",
            pending_request=json.dumps({"modules": ["customers", "invoices", "payroll"], "billingCycle": "monthly",
                                        "monthlyPrice": 797, "planPrice": 797, "requestedAt": "2026-10-02T10:00:00Z"}))  # fmt: skip
        org(ORG_ARCHIVED, "Old Shop", "old-shop", deleted_at=NOW, is_suspended=True, suspended_reason="Closed")
        org(ORG_SUSPENDED, "Late Payer", "late", is_suspended=True, suspended_reason="Unpaid")
        org(ORG_PENDING, "New Clinic", None, approval_status="pending", approved_at=None, subscription_status="trial")

        def user(id_, org_id, email, role, **kw):
            row = dict(id=id_, organization_id=org_id, name=email.split("@")[0].title(), email=email, password_hash=BCRYPT, role=role,
                       is_active=True, last_login_at=None, module_access=None, created_at=NOW, updated_at=NOW)  # fmt: skip
            row.update(kw)
            c.execute(text(f"INSERT INTO users ({','.join(row)}) VALUES ({','.join(':' + k for k in row)})"), row)

        user(USER_ADMIN, ORG_ACTIVE, "Owner@Acme.test", "admin", last_login_at=NOW)
        user(USER_STAFF, ORG_ACTIVE, "staff@acme.test", "staff", module_access=json.dumps(["invoices"]))
        user(USER_INVITED, ORG_ACTIVE, "new@acme.test", "viewer", password_hash=None)
        user(USER_DISABLED, ORG_SUSPENDED, "gone@late.test", "staff", is_active=False)

        c.execute(
            text("INSERT INTO platform_admins VALUES (:id,'Ops','OPS@rooman.test',:h,1,NULL,:n,:n)"),
            {"id": PLATFORM, "h": BCRYPT, "n": NOW},
        )
        c.execute(
            text("INSERT INTO org_panel_admins VALUES (:id,:org,'Admin','admin@acme',:h,1,NULL,'ops@rooman.test',1,NULL,:n,:n)"),
            {"id": PANEL, "org": ORG_ACTIVE, "h": BCRYPT, "n": NOW},
        )
        for key, value in [
            ("app_content", json.dumps({"branding": {"appName": "Rooman Books"}, "texts": {"a": "b"}})),
            (f"app_content:org:{ORG_ACTIVE}", json.dumps({"branding": {"appName": "Acme Books"}, "modules": {}, "texts": {}})),
            (f"app_content:org:{uuid.uuid4().hex}", json.dumps({"texts": {}})),  # org no longer exists: skipped
            ("trial_days", "3"),
            ("require_org_approval", "false"),
        ]:
            c.execute(text("INSERT INTO platform_settings VALUES (:id,:k,:v,:n)"), {"id": uuid.uuid4().hex, "k": key, "v": value, "n": NOW})
    engine.dispose()
    return path


@pytest.fixture
def core(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'core.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add_all([m.App(key="books", name="Rooman Books"), m.App(key="bookings", name="Rooman Bookings")])
        s.commit()
    with Session(engine, autoflush=False) as session:
        yield session
    engine.dispose()


def _run(books: Path, core: Session, pricing: Path, dry_run: bool = False):
    return {r.name: r for r in mb.run(mb.books_engine(f"sqlite:///{books}"), core, pricing, dry_run)}


def test_copies_everything_with_the_same_ids_and_hashes(books, core, pricing):
    reports = _run(books, core, pricing)
    assert all(r.consistent for r in reports.values()), mb.format_report(list(reports.values()), False)

    orgs = {o.code: o for o in core.scalars(select(m.Organization))}
    assert orgs["acme"].id == uuid.UUID(ORG_ACTIVE)
    assert orgs["acme"].gstin == "29ABCDE1234F1Z5"
    assert orgs["acme"].timezone == "Asia/Kolkata"
    assert orgs["old-shop"].status == "archived"
    assert orgs["late"].status == "suspended" and orgs["late"].status_reason == "Unpaid"
    pending = core.get(m.Organization, uuid.UUID(ORG_PENDING))
    assert pending.status == "pending" and pending.code.startswith("new-clinic-")

    owner = core.get(m.User, uuid.UUID(USER_ADMIN))
    assert owner.email == "owner@acme.test" and owner.password_hash == BCRYPT and owner.status == "active"
    assert core.get(m.User, uuid.UUID(USER_INVITED)).status == "invited"
    assert core.get(m.User, uuid.UUID(USER_DISABLED)).status == "disabled"

    roles = {(ms.user_id, ms.role) for ms in core.scalars(select(m.Membership))}
    assert (uuid.UUID(USER_STAFF), "staff") in roles and len(roles) == 4
    access = core.scalars(select(m.UserModuleAccess)).one()
    assert access.user_id == uuid.UUID(USER_STAFF) and access.modules == ["invoices"]

    sub = core.scalars(select(m.OrgSubscription).where(m.OrgSubscription.org_id == uuid.UUID(ORG_ACTIVE))).one()
    assert sub.status == "active" and sub.cycle == "yearly" and sub.modules == ["customers", "invoices"]
    assert str(sub.cycle_price) == "3980.00"
    assert sub.pending_request["modules"] == ["customers", "invoices", "payroll"] and sub.pending_request["cycle"] == "monthly"
    assert core.scalar(select(func.count()).select_from(m.PlanModule)) == 3
    assert core.scalar(select(func.count()).select_from(m.OrgApp)) == 4

    panel = core.get(m.PanelAdmin, uuid.UUID(PANEL))
    assert panel.login_id == "admin@acme" and panel.must_change_credentials and panel.org_id == uuid.UUID(ORG_ACTIVE)
    assert core.get(m.PlatformAdmin, uuid.UUID(PLATFORM)).email == "ops@rooman.test"
    assert core.get(m.PanelContentAccess, uuid.UUID(ORG_ACTIVE)).parts == ["invoices", "branding"]

    content = {(c.org_id, c.key): c.value for c in core.scalars(select(m.AppContent))}
    assert content[(None, "books")]["branding"]["appName"] == "Rooman Books"
    assert content[(uuid.UUID(ORG_ACTIVE), "books")]["branding"]["appName"] == "Acme Books"
    assert len(content) == 2  # the orphan is skipped
    settings = {s.key: s.value for s in core.scalars(select(m.PlatformSetting))}
    assert settings == {"trial_days": "3", "require_org_approval": "false"}

    audit = core.scalars(select(m.AuditLog)).one()
    assert audit.action == "migration.books_to_core" and audit.detail["users"]["inserted"] == 4


def test_second_run_changes_nothing_and_reports_the_same_checksums(books, core, pricing):
    first = _run(books, core, pricing)
    second = _run(books, core, pricing)
    for name, r in second.items():
        assert (r.inserted, r.updated, r.removed) == (0, 0, 0), name
        assert r.unchanged == r.source
        assert r.source_checksum == first[name].source_checksum
        assert r.consistent


def test_changes_in_books_flow_through_on_the_next_run(books, core, pricing):
    _run(books, core, pricing)
    engine = create_engine(f"sqlite:///{books}")
    with engine.begin() as c:
        c.execute(text("UPDATE users SET name='Renamed', module_access=NULL WHERE id=:id"), {"id": USER_STAFF})
        c.execute(text("UPDATE organizations SET is_suspended=1, suspended_reason='Fraud' WHERE id=:id"), {"id": ORG_ACTIVE})
    engine.dispose()
    reports = _run(books, core, pricing)
    assert reports["users"].updated == 1
    assert reports["user_module_access"].removed == 1
    assert reports["organizations"].updated == 1
    assert core.get(m.User, uuid.UUID(USER_STAFF)).name == "Renamed"
    assert core.get(m.Organization, uuid.UUID(ORG_ACTIVE)).status == "suspended"
    assert all(r.consistent for r in reports.values())


def test_core_only_records_are_left_alone(books, core, pricing):
    core_user = m.User(email="core-only@rooman.test", name="Core only", status="active")
    core.add(core_user)
    core.add(m.AppContent(key="bookings", value={"x": 1}))
    core.commit()
    _run(books, core, pricing)
    _run(books, core, pricing)
    assert core.get(m.User, core_user.id) is not None
    assert core.scalars(select(m.AppContent).where(m.AppContent.key == "bookings")).one().value == {"x": 1}


def test_dry_run_saves_nothing(books, core, pricing):
    reports = _run(books, core, pricing, dry_run=True)
    assert reports["users"].inserted == 4
    assert core.scalar(select(func.count()).select_from(m.User)) == 0
    assert core.scalar(select(func.count()).select_from(m.AuditLog)) == 0


def test_books_is_opened_read_only(books):
    engine = mb.books_engine(f"sqlite:///{books}")
    with pytest.raises(OperationalError, match="readonly"):
        with engine.begin() as c:
            c.execute(text("UPDATE users SET name='x'"))


def test_report_flags_a_mismatch():
    good = mb.EntityReport("users", 1, source_checksum="a", core_checksum="a")
    bad = mb.EntityReport("orgs", 1, source_checksum="a", core_checksum="b")
    assert "All entities consistent." in mb.format_report([good], False)
    text_out = mb.format_report([good, bad], True)
    assert "MISMATCH" in text_out and "DRY RUN" in text_out


def test_checksum_ignores_order_and_normalises_values():
    a = [{"id": uuid.UUID(int=1), "at": datetime(2026, 1, 1, tzinfo=UTC)}, {"id": uuid.UUID(int=2), "at": None}]
    b = [{"id": uuid.UUID(int=2), "at": None}, {"id": uuid.UUID(int=1), "at": datetime(2026, 1, 1)}]  # naive = UTC
    assert mb.checksum(a) == mb.checksum(b)


def test_copies_from_an_older_books_version(books, core, pricing):
    """Production Books can be older than this tool: columns and tables it has not got yet read as empty."""
    engine = create_engine(f"sqlite:///{books}")
    with engine.begin() as c:
        c.execute(text("DROP TABLE org_panel_admins"))
        c.execute(text("DROP TABLE platform_admins"))
        c.execute(text("ALTER TABLE organizations DROP COLUMN code"))
        c.execute(text("ALTER TABLE organizations DROP COLUMN panel_content_access"))
        c.execute(text("ALTER TABLE users DROP COLUMN module_access"))
    engine.dispose()

    reports = _run(books, core, pricing)
    assert all(r.consistent for r in reports.values()), mb.format_report(list(reports.values()), False)
    assert reports["organizations"].source == 4 and reports["users"].source == 4
    assert reports["panel_admins"].source == 0 and reports["platform_admins"].source == 0
    # Without a Books code, each organization gets "<name-slug>-<first 6 of id>".
    assert core.scalar(select(m.Organization.code).where(m.Organization.id == uuid.UUID(ORG_ACTIVE))) == f"acme-traders-{ORG_ACTIVE[:6]}"
