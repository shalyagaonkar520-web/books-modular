"""Rooman Billing -> Rooman Books connector.

Reads Billing's database (read-only) and sends each new or changed customer,
plan, invoice and payment to Books as a signed event (docs/billing-to-books.md).
Billing's own code is not changed, so Billing's deploys never undo this.

What it remembers (STATE_PATH, a small SQLite file): what was sent, a hash of
it, and Books' answer. So:
- nothing is sent twice (and Books ignores a re-send anyway);
- a changed customer or plan is sent again (customer.updated / plan.upserted);
- 409 from Books (something it depends on has not arrived): retried next round;
- 422 (can never apply as sent): kept as failed with Books' reason, and only
  sent again if the record changes in Billing;
- 5xx / no answer: retried next round.

Run: python connector.py            (loop)
     python connector.py once       (one round, then exit)
     python connector.py status     (what was sent / waiting / failed)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable, Iterable

from rooman_sdk.events import Actor, EventEnvelope, sign
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

UTC = timezone.utc

log = logging.getLogger("billing-connector")

SOURCE = "billing"
SENT, WAITING, FAILED = "sent", "waiting", "failed"
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Billing's payment statuses where the money was actually received.
RECEIVED_STATUSES = {"succeeded", "partially_refunded", "refunded"}
BOOKS_METHODS = {"cash", "bank_transfer", "upi", "card", "cheque"}


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #
@dataclass
class Settings:
    billing_db_url: str
    books_events_url: str
    secret: str
    org_map: dict[str, str]  # Billing organization id -> Books organization id
    state_path: str = "/data/state.db"
    poll_seconds: int = 30
    sync_from: date | None = None  # only invoices and payments created on/after this day (customers and plans always go)
    unallocated_wait_hours: int = 24  # a payment not yet matched to an invoice waits this long, then goes as an advance
    timeout_seconds: float = 15.0

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> "Settings":
        env = dict(os.environ if env is None else env)
        missing = [k for k in ("BILLING_DATABASE_URL", "BOOKS_EVENTS_URL", "EVENT_SIGNING_SECRET", "ORG_MAP") if not env.get(k, "").strip()]
        if missing:
            raise SystemExit(f"Missing settings: {', '.join(missing)}")
        return cls(
            billing_db_url=env["BILLING_DATABASE_URL"].strip(),
            books_events_url=env["BOOKS_EVENTS_URL"].strip(),
            secret=env["EVENT_SIGNING_SECRET"].strip(),
            org_map=parse_org_map(env["ORG_MAP"]),
            state_path=env.get("STATE_PATH", "/data/state.db"),
            poll_seconds=int(env.get("POLL_SECONDS", "30")),
            sync_from=date.fromisoformat(env["SYNC_FROM"]) if env.get("SYNC_FROM", "").strip() else None,
            unallocated_wait_hours=int(env.get("UNALLOCATED_WAIT_HOURS", "24")),
        )


def parse_org_map(value: str) -> dict[str, str]:
    """'billingOrgId=booksOrgId,billingOrgId2=booksOrgId2' -> dict. Books ids become UUID strings."""
    result: dict[str, str] = {}
    for pair in filter(None, (p.strip() for p in value.split(","))):
        billing_id, _, books_id = pair.partition("=")
        if not billing_id.strip() or not books_id.strip():
            raise SystemExit(f"ORG_MAP entry {pair!r} must look like <billing org id>=<books org id>")
        result[billing_id.strip()] = str(uuid.UUID(books_id.strip()))
    if not result:
        raise SystemExit("ORG_MAP is empty")
    return result


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #
def money(value: Any) -> str:
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def rate(value: Any) -> str:
    return str(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def qty(value: Any) -> str:
    return str(Decimal(str(value or 1)).quantize(Decimal("0.001")).normalize()) if value is not None else "1"


def day(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def low(value: Any) -> str:
    """Billing stores enum names ('SENT'); compare in lower case."""
    return str(getattr(value, "value", value) or "").lower()


def clip(value: Any, n: int) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s[:n] if s else None


def digest(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


# --------------------------------------------------------------------------- #
# State
# --------------------------------------------------------------------------- #
class State:
    def __init__(self, path: str):
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute(
            """create table if not exists synced (
                kind text not null, ref text not null, hash text not null, payload text not null,
                status text not null, detail text, attempts integer not null default 0, updated_at text not null,
                primary key (kind, ref))"""
        )
        self.db.commit()

    def get(self, kind: str, ref: str) -> dict | None:
        row = self.db.execute("select hash, payload, status, detail, attempts from synced where kind=? and ref=?", (kind, ref)).fetchone()
        if row is None:
            return None
        return {"hash": row[0], "payload": json.loads(row[1]), "status": row[2], "detail": row[3], "attempts": row[4]}

    def put(self, kind: str, ref: str, data: dict, status: str, detail: str | None) -> None:
        previous = self.get(kind, ref)
        attempts = 0 if status == SENT else ((previous or {}).get("attempts", 0) + 1)
        self.db.execute(
            """insert into synced (kind, ref, hash, payload, status, detail, attempts, updated_at) values (?,?,?,?,?,?,?,?)
               on conflict(kind, ref) do update set hash=excluded.hash, payload=excluded.payload, status=excluded.status,
               detail=excluded.detail, attempts=excluded.attempts, updated_at=excluded.updated_at""",
            (kind, ref, digest(data), json.dumps(data, default=str), status, detail, attempts, datetime.now(UTC).isoformat()),
        )
        self.db.commit()

    def summary(self) -> list[tuple]:
        return self.db.execute("select kind, status, count(*) from synced group by 1, 2 order by 1, 2").fetchall()

    def failures(self, limit: int = 50) -> list[tuple]:
        return self.db.execute(
            "select kind, ref, status, detail, updated_at from synced where status != ? order by updated_at desc limit ?", (SENT, limit)
        ).fetchall()


# --------------------------------------------------------------------------- #
# Sending
# --------------------------------------------------------------------------- #
@dataclass
class Answer:
    status: str  # SENT / WAITING / FAILED, or "" for "try again later" (5xx, network)
    detail: str | None = None


Sender = Callable[[bytes, dict], tuple[int, str]]


def http_sender(url: str, timeout: float) -> Sender:
    def send(body: bytes, headers: dict) -> tuple[int, str]:
        request = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode("utf-8", "replace")

    return send


class Unauthorized(RuntimeError):
    """Books refused the signature: the shared secret differs. Stop the round."""


def deliver(settings: Settings, sender: Sender, books_org: str, event_type: str, data: dict) -> Answer:
    event = EventEnvelope(type=event_type, org_id=books_org, actor=Actor(type="service", id=SOURCE), source=SOURCE, data=data)
    body = event.to_json().encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "RoomanBillingConnector/1", "X-Rooman-Signature": sign(body, settings.secret)}
    try:
        code, reply = sender(body, headers)
    except Exception as exc:  # network trouble: try again next round
        return Answer("", f"{type(exc).__name__}: {exc}")
    if code in (200, 202):
        return Answer(SENT)
    detail = reply
    try:
        detail = json.loads(reply).get("detail", reply)
    except (ValueError, AttributeError):
        pass
    detail = str(detail)[:1000]
    if code == 401:
        raise Unauthorized(detail)
    if code == 409:
        return Answer(WAITING, detail)
    if code in (400, 404, 413, 422):
        return Answer(FAILED, detail)
    return Answer("", f"HTTP {code}: {detail}")


# --------------------------------------------------------------------------- #
# Reading Billing
# --------------------------------------------------------------------------- #
def _since(settings: Settings) -> str:
    return "" if settings.sync_from is None else " and {t}.created_at >= :since"


def _params(settings: Settings, org: str) -> dict:
    p: dict[str, Any] = {"org": org}
    if settings.sync_from is not None:
        p["since"] = datetime.combine(settings.sync_from, datetime.min.time())
    return p


def customers(conn: Connection, settings: Settings, org: str) -> Iterable[tuple[str, dict]]:
    rows = conn.execute(
        text(
            "select id, display_name, company_name, email, phone, gstin, billing_address_line1, billing_address_line2,"
            " billing_city, billing_state, billing_postal_code from customers c where c.organization_id = :org"
            " order by c.created_at, c.id"
        ),
        {"org": org},
    ).mappings()
    for r in rows:
        city_line = " ".join(p for p in (r["billing_city"], r["billing_postal_code"]) if p)
        address = ", ".join(p for p in (r["billing_address_line1"], r["billing_address_line2"], city_line, r["billing_state"]) if p)
        email = (r["email"] or "").strip()
        yield r["id"], {
            "app_local_id": r["id"],
            "display_name": clip(r["display_name"], 200) or "Billing customer",
            "company_name": clip(r["company_name"], 200),
            "email": email if EMAIL.match(email) else None,
            "phone": clip(r["phone"], 32),
            "gstin": clip(r["gstin"], 20),
            "billing_address": clip(address, 1000),
            "type": "customer",
        }


def plans(conn: Connection, settings: Settings, org: str) -> Iterable[tuple[str, dict]]:
    rows = conn.execute(
        text(
            "select p.id, p.name, p.description, p.unit_amount, p.currency, p.is_active, pr.tax_rate_pct, pr.hsn_sac_code, pr.name as product"
            " from plans p left join products pr on pr.id = p.product_id where p.organization_id = :org"
            " order by p.created_at, p.id"
        ),
        {"org": org},
    ).mappings()
    for r in rows:
        name = r["name"] if not r["product"] or r["product"] in r["name"] else f"{r['product']} - {r['name']}"
        yield r["id"], {
            "plan_id": r["id"],
            "name": clip(name, 200),
            "description": clip(r["description"], 500),
            "price": money(r["unit_amount"]),
            "currency": (r["currency"] or "INR").upper(),
            "tax_rate": rate(18 if r["tax_rate_pct"] is None else r["tax_rate_pct"]),
            "hsn_sac": clip(r["hsn_sac_code"], 20),
            "is_active": bool(r["is_active"]),
        }


def invoices(conn: Connection, settings: Settings, org: str) -> Iterable[tuple[str, dict]]:
    rows = conn.execute(
        text(
            "select id, invoice_number, customer_id, status, issue_date, due_date, currency, subtotal, discount_amount, tax_amount, total,"
            " sent_at from invoices i where i.organization_id = :org"
            + _since(settings).format(t="i")
            + " order by i.issue_date, i.created_at, i.id"
        ),
        _params(settings, org),
    ).mappings()
    rows = list(rows)
    lines_by_invoice: dict[str, list[dict]] = {}
    if rows:
        for line in conn.execute(
            text(
                "select invoice_id, description, plan_id, quantity, unit_price, tax_rate_pct, hsn_sac_code, position"
                " from invoice_items where organization_id = :org order by invoice_id, position"
            ),
            {"org": org},
        ).mappings():
            lines_by_invoice.setdefault(line["invoice_id"], []).append(
                {
                    "description": clip(line["description"], 500) or "Subscription",
                    "plan_id": line["plan_id"],
                    "quantity": qty(line["quantity"]),
                    "rate": money(line["unit_price"]),
                    "tax_rate": rate(line["tax_rate_pct"]),
                    "hsn_sac": clip(line["hsn_sac_code"], 20),
                }
            )
    for r in rows:
        status = low(r["status"])
        if status == "draft" or (status == "void" and r["sent_at"] is None):
            continue  # never issued
        data = {
            "invoice_id": r["id"],
            "number": r["invoice_number"],
            "customer_id": r["customer_id"],
            "date": day(r["issue_date"]),
            "currency": (r["currency"] or "INR").upper(),
            "subtotal": money(r["subtotal"]),
            "discount_total": money(r["discount_amount"]),
            "tax_total": money(r["tax_amount"]),
            "total": money(r["total"]),
            "lines": lines_by_invoice.get(r["id"], []),
        }
        if r["due_date"] is not None:
            data["due_date"] = day(r["due_date"])
        yield r["id"], data


def payments(conn: Connection, settings: Settings, org: str, now: datetime) -> Iterable[tuple[str, dict]]:
    rows = list(
        conn.execute(
            text(
                "select id, customer_id, amount, currency, method, status, reference, gateway_payment_id, paid_at, created_at"
                " from payments p where p.organization_id = :org and p.customer_id is not null"
                + _since(settings).format(t="p")
                + " order by p.created_at, p.id"
            ),
            _params(settings, org),
        ).mappings()
    )
    allocations: dict[str, list[dict]] = {}
    if rows:
        for a in conn.execute(
            text("select payment_id, invoice_id, amount from payment_allocations where organization_id = :org order by created_at"),
            {"org": org},
        ).mappings():
            allocations.setdefault(a["payment_id"], []).append({"invoice_id": a["invoice_id"], "amount": money(a["amount"])})
    wait = timedelta(hours=settings.unallocated_wait_hours)
    for r in rows:
        if low(r["status"]) not in RECEIVED_STATUSES:
            continue
        applied = allocations.get(r["id"], [])
        if not applied:
            created = r["created_at"]
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            if created is not None and created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            if created is not None and now - created < wait:
                continue  # may still be matched to an invoice in Billing
        method = low(r["method"])
        yield r["id"], {
            "payment_id": r["id"],
            "customer_id": r["customer_id"],
            "amount": money(r["amount"]),
            "currency": (r["currency"] or "INR").upper(),
            "method": method if method in BOOKS_METHODS else "other",
            "received_on": day(r["paid_at"] or r["created_at"]),
            "reference": clip(r["reference"] or r["gateway_payment_id"], 120),
            "applied_to": applied,
        }


# --------------------------------------------------------------------------- #
# One round
# --------------------------------------------------------------------------- #
@dataclass
class Round:
    sent: int = 0
    waiting: int = 0
    failed: int = 0
    retry: int = 0


def _sync_kind(state: State, settings: Settings, sender: Sender, books_org: str, kind: str, records, result: Round) -> None:
    for ref, data in records:
        known = state.get(kind, ref)
        if known is not None and known["hash"] == digest(data) and known["status"] in (SENT, FAILED):
            continue  # unchanged since it was sent (or refused)
        if kind in ("invoice", "payment") and known is not None and known["status"] == SENT:
            continue  # Books keeps invoices and payments as first received
        event_type = {"customer": "customer.created", "plan": "plan.upserted", "invoice": "invoice.created", "payment": "payment.received"}[kind]
        if kind == "customer" and known is not None and known["status"] == SENT:
            event_type = "customer.updated"
            data = {**data, "changed": sorted(k for k in data if data.get(k) != known["payload"].get(k))}
        answer = deliver(settings, sender, books_org, event_type, data)
        if not answer.status:
            result.retry += 1
            log.warning("%s %s: will retry (%s)", kind, ref, answer.detail)
            continue
        data.pop("changed", None)
        state.put(kind, ref, data, answer.status, answer.detail)
        if answer.status == SENT:
            result.sent += 1
            log.info("%s %s -> Books (%s)", kind, ref, event_type)
        elif answer.status == WAITING:
            result.waiting += 1
        else:
            result.failed += 1
            log.error("%s %s refused by Books: %s", kind, ref, answer.detail)


def run_once(engine: Engine, state: State, settings: Settings, sender: Sender, now: datetime | None = None) -> Round:
    now = now or datetime.now(UTC)
    result = Round()
    with engine.connect() as conn:
        for billing_org, books_org in settings.org_map.items():
            if conn.dialect.name == "postgresql":
                # Billing's row-level security shows a session only the organization it names.
                conn.execute(text("select set_config('app.current_organization_id', :org, false)"), {"org": billing_org})
            _sync_kind(state, settings, sender, books_org, "customer", customers(conn, settings, billing_org), result)
            _sync_kind(state, settings, sender, books_org, "plan", plans(conn, settings, billing_org), result)
            _sync_kind(state, settings, sender, books_org, "invoice", invoices(conn, settings, billing_org), result)
            _sync_kind(state, settings, sender, books_org, "payment", payments(conn, settings, billing_org, now), result)
        conn.rollback()  # read-only
    return result


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    command = argv[1] if len(argv) > 1 else "run"
    if command == "status":
        state = State(os.environ.get("STATE_PATH", "/data/state.db"))
        for kind, status, count in state.summary():
            print(f"{kind:9} {status:8} {count}")
        for row in state.failures():
            print(" | ".join(str(x) for x in row))
        return 0
    settings = Settings.from_env()
    engine = create_engine(settings.billing_db_url, pool_pre_ping=True)
    state = State(settings.state_path)
    sender = http_sender(settings.books_events_url, settings.timeout_seconds)
    log.info("Billing -> Books connector: %d organization(s), every %ds", len(settings.org_map), settings.poll_seconds)
    while True:
        try:
            result = run_once(engine, state, settings, sender)
            if result.sent or result.failed or result.retry:
                log.info("round: %d sent, %d waiting, %d refused, %d to retry", result.sent, result.waiting, result.failed, result.retry)
            with open(os.path.join(os.path.dirname(os.path.abspath(settings.state_path)), "heartbeat"), "w") as fh:
                fh.write(datetime.now(UTC).isoformat())
        except Unauthorized as exc:
            log.error("Books refused the signature (EVENT_SIGNING_SECRET differs from Books'): %s", exc)
        except Exception:
            log.exception("round failed; trying again next round")
        if command == "once":
            return 0
        time.sleep(settings.poll_seconds)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
