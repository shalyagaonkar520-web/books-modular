"""Copy identity and platform data from Rooman Books into Core.

    python -m core_api.migrate_books --books-url postgresql+psycopg://reader@books-db/roomanbooks
    python -m core_api.migrate_books --books-url sqlite:///path/books.db --dry-run

Core's database comes from DATABASE_URL, as for the API.

What it copies, keeping every id and password hash:
organizations, users and their memberships, per-user module access,
platform admins, org admin-panel logins, panel content access, the Books
subscription of each organization, the Books module catalog (as a plan),
app content (shared and per organization) and the other platform settings.

Guarantees:
- Books is opened read-only and never written to.
- Idempotent: each record is inserted, updated or left alone to match
  Books, so running it twice gives the same result. Records Core owns
  that Books never had are not touched.
- Everything is written in one transaction; --dry-run rolls it back.
- The report lists, per entity, the counts and a SHA-256 of the records as
  Books says they should be and as Core holds them after the run. The run
  fails (exit 1) unless every pair matches.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import MetaData, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from core_api import models as m

APP = "books"
# Fixed namespace so derived ids are the same on every run and every database.
NS = uuid.UUID("2f8f4b8e-1d2a-4c55-9b63-8f0b3b8f5c21")
DEFAULT_PRICING = Path(__file__).resolve().parents[3] / "apps" / "books" / "backend" / "content" / "module_pricing.json"
BOOKS_TABLES = ["organizations", "users", "platform_admins", "org_panel_admins", "platform_settings"]
APP_CONTENT_KEY = "app_content"


def derived_id(*parts: object) -> uuid.UUID:
    return uuid.uuid5(NS, ":".join(str(p) for p in parts))


def as_uuid(value: str | uuid.UUID) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def as_json_list(value: Any) -> list[str] | None:
    """Books keeps lists as JSON text; NULL or anything unreadable means none."""
    if value is None:
        return None
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except ValueError:
        return None
    return [str(v) for v in parsed] if isinstance(parsed, list) else None


def as_json_obj(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:30] or "org"


# --------------------------------------------------------------------------- #
# Canonical form, for comparing and checksumming records
# --------------------------------------------------------------------------- #
def canonical(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return as_utc(value).isoformat()  # type: ignore[union-attr]
    if isinstance(value, Decimal):
        return str(value.quantize(Decimal("0.01")))
    if isinstance(value, dict):
        return {k: canonical(v) for k, v in sorted(value.items())}
    if isinstance(value, (list, tuple)):
        return [canonical(v) for v in value]
    return value


def checksum(records: Iterable[dict[str, Any]]) -> str:
    rows = sorted(json.dumps(canonical(r), sort_keys=True, separators=(",", ":")) for r in records)
    return hashlib.sha256("\n".join(rows).encode()).hexdigest()


# --------------------------------------------------------------------------- #
# Entities
# --------------------------------------------------------------------------- #
@dataclass
class Entity:
    """One Core table to bring in line with Books.

    ``fields`` are compared and kept in sync; ``insert_only`` are set when
    Core first creates the record and then left to Core. When ``owned`` is
    set, Core rows matching it that Books no longer has are removed (only
    for rows that exist purely as a copy of a Books field).
    """

    name: str
    model: type
    key: str
    fields: list[str]
    build: Callable[[dict[str, list[dict[str, Any]]], dict[str, Any]], list[dict[str, Any]]]
    insert_only: dict[str, Any] = field(default_factory=dict)
    owned: Callable[[Any], bool] | None = None


def build_orgs(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for o in src["organizations"]:
        if o["deleted_at"] is not None:
            status, reason = "archived", o.get("suspended_reason")
        elif o["is_suspended"]:
            status, reason = "suspended", o.get("suspended_reason")
        elif o["approval_status"] == "rejected":
            status, reason = "rejected", o.get("rejection_reason")
        elif o["approval_status"] == "pending":
            status, reason = "pending", None
        else:
            status, reason = "active", None
        out.append(
            {
                "id": as_uuid(o["id"]),
                "code": o["code"] or f"{slug(o['name'])}-{str(o['id'])[:6]}",
                "name": o["name"],
                "legal_name": o["legal_name"],
                "gstin": o["gstin"],
                "pan": o["pan"],
                "email": o["email"],
                "phone": o["phone"],
                "country": o["country"] or "India",
                "currency": o["currency"] or "INR",
                "status": status,
                "status_reason": reason,
                "approved_at": as_utc(o["approved_at"]),
                "trial_ends_at": as_utc(o["trial_ends_at"]),
                "created_at": as_utc(o["created_at"]),
            }
        )
    return out


def build_org_apps(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"id": derived_id("org_app", o["id"], APP), "org_id": as_uuid(o["id"]), "app_key": APP, "status": "active"}
        for o in src["organizations"]
    ]


def build_plans(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    p = ctx["pricing"]
    return [
        {
            "id": ctx["plan_id"],
            "app_key": APP,
            "code": "standard",
            "name": "Rooman Books",
            "currency": p.get("currency", "INR"),
            "base_monthly_price": Decimal(str(p.get("basePrice", 0))),
            "yearly_multiplier": Decimal(str(p.get("yearlyMultiplier", 10))),
            "details": {"period": p.get("period", "month"), "baseIncludes": p.get("baseIncludes", [])},
            "is_active": True,
        }
    ]


def build_plan_modules(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": derived_id("plan_module", APP, mod["key"]),
            "plan_id": ctx["plan_id"],
            "module_key": mod["key"],
            "label": mod["label"],
            "description": mod.get("description"),
            "monthly_price": Decimal(str(mod.get("price", 0))),
            "is_core": bool(mod.get("core", False)),
            "requires": list(mod.get("requires", [])),
            "sort_order": i,
        }
        for i, mod in enumerate(ctx["pricing"].get("modules", []))
    ]


def build_subscriptions(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for o in src["organizations"]:
        req = as_json_obj(o.get("pending_request"))
        pending = (
            {
                "modules": [str(x) for x in req.get("modules", [])],
                "cycle": req.get("billingCycle") or "monthly",
                "monthlyPrice": req.get("monthlyPrice"),
                "cyclePrice": req.get("planPrice"),
                "requestedAt": req.get("requestedAt"),
            }
            if req and isinstance(req.get("modules"), list)
            else None
        )
        out.append(
            {
                "id": derived_id("subscription", o["id"], APP),
                "org_id": as_uuid(o["id"]),
                "app_key": APP,
                "plan_id": ctx["plan_id"],
                "status": o["subscription_status"] or "active",
                "cycle": o["billing_cycle"],
                "modules": as_json_list(o["requested_modules"]),
                "monthly_price": o["monthly_price"],
                "cycle_price": o["plan_price"] if o["plan_price"] is not None else o["monthly_price"],
                "trial_ends_at": as_utc(o["trial_ends_at"]),
                "pending_request": pending,
                "decided_at": as_utc(o["subscription_decided_at"]),
                "note": o["subscription_note"],
            }
        )
    return out


def _user_status(u: dict[str, Any]) -> str:
    if not u["is_active"]:
        return "disabled"
    return "invited" if u["password_hash"] is None else "active"


def build_users(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": as_uuid(u["id"]),
            "email": u["email"].strip().lower(),
            "name": u["name"],
            "password_hash": u["password_hash"],
            "status": _user_status(u),
            "last_login_at": as_utc(u["last_login_at"]),
            "created_at": as_utc(u["created_at"]),
        }
        for u in src["users"]
    ]


def build_memberships(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": derived_id("membership", u["id"], u["organization_id"]),
            "user_id": as_uuid(u["id"]),
            "org_id": as_uuid(u["organization_id"]),
            "role": u["role"],
            "status": _user_status(u),
        }
        for u in src["users"]
    ]


def build_module_access(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for u in src["users"]:
        modules = as_json_list(u.get("module_access"))
        if modules is None:
            continue
        out.append(
            {
                "id": derived_id("module_access", u["id"], u["organization_id"], APP),
                "user_id": as_uuid(u["id"]),
                "org_id": as_uuid(u["organization_id"]),
                "app_key": APP,
                "modules": modules,
            }
        )
    return out


def build_platform_admins(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": as_uuid(a["id"]),
            "email": a["email"].strip().lower(),
            "name": a["name"],
            "password_hash": a["password_hash"],
            "status": "active" if a["is_active"] else "disabled",
            "last_login_at": as_utc(a["last_login_at"]),
            "created_at": as_utc(a["created_at"]),
        }
        for a in src["platform_admins"]
    ]


def build_panel_admins(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": as_uuid(a["id"]),
            "org_id": as_uuid(a["organization_id"]),
            "login_id": a["email"].strip().lower(),
            "name": a["name"],
            "password_hash": a["password_hash"],
            "status": "active" if a["is_active"] else "disabled",
            "must_change_credentials": bool(a["must_change_credentials"]),
            "reset_requested_at": as_utc(a["reset_requested_at"]),
            "created_by": a["created_by"],
            "last_login_at": as_utc(a["last_login_at"]),
            "created_at": as_utc(a["created_at"]),
        }
        for a in src["org_panel_admins"]
    ]


def build_panel_content_access(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"org_id": as_uuid(o["id"]), "parts": as_json_list(o["panel_content_access"])}
        for o in src["organizations"]
        if as_json_list(o.get("panel_content_access")) is not None
    ]


def build_app_content(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    org_ids = {str(o["id"]) for o in src["organizations"]}
    out = []
    for s in src["platform_settings"]:
        value = as_json_obj(s["value"])
        if value is None:
            continue
        if s["key"] == APP_CONTENT_KEY:
            out.append({"id": derived_id("app_content", "shared", APP), "org_id": None, "key": APP, "value": value})
        elif s["key"].startswith(f"{APP_CONTENT_KEY}:org:"):
            org_id = s["key"].rsplit(":", 1)[1]
            if org_id in org_ids:  # skip leftovers of deleted organizations
                out.append({"id": derived_id("app_content", org_id, APP), "org_id": as_uuid(org_id), "key": APP, "value": value})
    return out


def build_platform_settings(src: dict[str, list[dict[str, Any]]], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    return [{"key": s["key"], "value": s["value"]} for s in src["platform_settings"] if not s["key"].startswith(APP_CONTENT_KEY)]


ENTITIES: list[Entity] = [
    Entity(
        "organizations",
        m.Organization,
        "id",
        [
            "code",
            "name",
            "legal_name",
            "gstin",
            "pan",
            "email",
            "phone",
            "country",
            "currency",
            "status",
            "status_reason",
            "approved_at",
            "trial_ends_at",
        ],
        build_orgs,
        insert_only={"timezone": "Asia/Kolkata"},
    ),
    Entity("org_apps", m.OrgApp, "id", ["org_id", "app_key"], build_org_apps, insert_only={"status": "active"}),
    Entity(
        "plans",
        m.Plan,
        "id",
        ["app_key", "code", "name", "currency", "base_monthly_price", "yearly_multiplier", "details", "is_active"],
        build_plans,
    ),
    Entity(
        "plan_modules",
        m.PlanModule,
        "id",
        ["plan_id", "module_key", "label", "description", "monthly_price", "is_core", "requires", "sort_order"],
        build_plan_modules,
    ),
    Entity(
        "org_subscriptions",
        m.OrgSubscription,
        "id",
        [
            "org_id",
            "app_key",
            "plan_id",
            "status",
            "cycle",
            "modules",
            "monthly_price",
            "cycle_price",
            "trial_ends_at",
            "pending_request",
            "decided_at",
            "note",
        ],
        build_subscriptions,
    ),
    Entity(
        "users",
        m.User,
        "id",
        ["email", "name", "password_hash", "status", "last_login_at"],
        build_users,
        insert_only={"must_change_credentials": False, "mfa_enabled": False, "failed_logins": 0},
    ),
    Entity("memberships", m.Membership, "id", ["user_id", "org_id", "role", "status"], build_memberships),
    Entity(
        "user_module_access",
        m.UserModuleAccess,
        "id",
        ["user_id", "org_id", "app_key", "modules"],
        build_module_access,
        owned=lambda row: row.app_key == APP,
    ),
    Entity(
        "platform_admins",
        m.PlatformAdmin,
        "id",
        ["email", "name", "password_hash", "status", "last_login_at"],
        build_platform_admins,
        insert_only={"mfa_enabled": False, "failed_logins": 0},
    ),
    Entity(
        "panel_admins",
        m.PanelAdmin,
        "id",
        [
            "org_id",
            "login_id",
            "name",
            "password_hash",
            "status",
            "must_change_credentials",
            "reset_requested_at",
            "created_by",
            "last_login_at",
        ],
        build_panel_admins,
        insert_only={"mfa_enabled": False, "failed_logins": 0},
    ),
    Entity("panel_content_access", m.PanelContentAccess, "org_id", ["parts"], build_panel_content_access, owned=lambda row: True),
    Entity("app_content", m.AppContent, "id", ["org_id", "key", "value"], build_app_content, owned=lambda row: row.key == APP),
    Entity("platform_settings", m.PlatformSetting, "key", ["value"], build_platform_settings),
]


# --------------------------------------------------------------------------- #
# Running
# --------------------------------------------------------------------------- #
@dataclass
class EntityReport:
    name: str
    source: int
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0
    source_checksum: str = ""
    core_checksum: str = ""

    @property
    def consistent(self) -> bool:
        return self.source_checksum == self.core_checksum


def books_engine(url: str) -> Engine:
    """Open Books read-only, so this tool cannot change it even by mistake."""
    if url.startswith("sqlite"):
        path = url.split("///", 1)[1]
        return create_engine(f"sqlite:///file:{path}?mode=ro&uri=true")
    return create_engine(url, connect_args={"options": "-c default_transaction_read_only=on"})


def read_books(engine: Engine) -> dict[str, list[dict[str, Any]]]:
    meta = MetaData()
    meta.reflect(bind=engine, only=BOOKS_TABLES)
    with engine.connect() as conn:
        return {name: [dict(r._mapping) for r in conn.execute(select(meta.tables[name]))] for name in BOOKS_TABLES}


def _project(row: Any, entity: Entity) -> dict[str, Any]:
    return {entity.key: getattr(row, entity.key), **{f: getattr(row, f) for f in entity.fields}}


def _equal(a: Any, b: Any) -> bool:
    return canonical(a) == canonical(b)


def sync_entity(session: Session, entity: Entity, records: list[dict[str, Any]]) -> EntityReport:
    report = EntityReport(entity.name, len(records))
    key = getattr(entity.model, entity.key)
    current: list[Any] = list(session.scalars(select(entity.model)))
    existing: dict[Any, Any] = {getattr(row, entity.key): row for row in current}
    wanted_keys: set[Any] = set()
    for record in records:
        k = record[entity.key]
        wanted_keys.add(k)
        row = existing.get(k)
        if row is None:
            values = {**entity.insert_only, **record}
            session.add(entity.model(**values))
            report.inserted += 1
            continue
        changed = False
        for f in entity.fields:
            if not _equal(getattr(row, f), record.get(f)):
                setattr(row, f, record.get(f))
                changed = True
        if changed:
            report.updated += 1
        else:
            report.unchanged += 1
    if entity.owned is not None:
        for k, row in existing.items():
            if k not in wanted_keys and entity.owned(row):
                session.delete(row)
                report.removed += 1
    session.flush()
    expected = [{entity.key: r[entity.key], **{f: r.get(f) for f in entity.fields}} for r in records]
    report.source_checksum = checksum(expected)
    after: list[Any] = list(session.scalars(select(entity.model).where(key.in_(wanted_keys)))) if wanted_keys else []
    now_in_core = [_project(row, entity) for row in after]
    report.core_checksum = checksum(now_in_core)
    return report


def run(books: Engine, session: Session, pricing_path: Path = DEFAULT_PRICING, dry_run: bool = False) -> list[EntityReport]:
    source = read_books(books)
    ctx = {"pricing": json.loads(pricing_path.read_text(encoding="utf-8")), "plan_id": derived_id("plan", APP, "standard")}
    reports = []
    try:
        for entity in ENTITIES:
            reports.append(sync_entity(session, entity, entity.build(source, ctx)))
        session.add(
            m.AuditLog(
                actor_type="system",
                action="migration.books_to_core" + (".dry_run" if dry_run else ""),
                detail={r.name: {"source": r.source, "inserted": r.inserted, "updated": r.updated, "removed": r.removed} for r in reports},
            )
        )
        if dry_run:
            session.rollback()
        else:
            session.commit()
    except Exception:
        session.rollback()
        raise
    return reports


def format_report(reports: list[EntityReport], dry_run: bool) -> str:
    lines = [
        f"Books -> Core migration{' (DRY RUN, nothing saved)' if dry_run else ''}",
        f"{'entity':<22}{'books':>7}{'new':>6}{'updated':>9}{'same':>7}{'removed':>9}  checksum (books = core)",
    ]
    for r in reports:
        mark = "OK " if r.consistent else "MISMATCH"
        lines.append(
            f"{r.name:<22}{r.source:>7}{r.inserted:>6}{r.updated:>9}{r.unchanged:>7}{r.removed:>9}  {mark} {r.source_checksum[:16]}"
        )
    ok = all(r.consistent for r in reports)
    lines.append("All entities consistent." if ok else "Some entities do NOT match. Nothing should be trusted until this is fixed.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Copy identity and platform data from Rooman Books into Core.")
    parser.add_argument("--books-url", required=True, help="SQLAlchemy URL of the Books database (opened read-only)")
    parser.add_argument("--pricing", type=Path, default=DEFAULT_PRICING, help="Books module_pricing.json")
    parser.add_argument("--dry-run", action="store_true", help="Run everything, then roll back")
    parser.add_argument("--json", action="store_true", help="Print the report as JSON")
    args = parser.parse_args(argv)

    from core_api.db import SessionLocal  # Core's database, from DATABASE_URL

    with SessionLocal() as session:
        reports = run(books_engine(args.books_url), session, args.pricing, args.dry_run)
    if args.json:
        print(json.dumps([r.__dict__ | {"consistent": r.consistent} for r in reports], indent=2))
    else:
        print(format_report(reports, args.dry_run))
    return 0 if all(r.consistent for r in reports) else 1


if __name__ == "__main__":
    sys.exit(main())
