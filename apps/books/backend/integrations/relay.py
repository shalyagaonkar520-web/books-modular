"""The relay: delivers outbox events, separately from the requests that wrote them.

EVENT_TRANSPORT=webhook  POST the signed JSON envelope to every URL in
                         EVENT_SUBSCRIBERS. An event is published once every
                         subscriber has answered 2xx; one that already
                         accepted it is not sent it again on a retry.
EVENT_TRANSPORT=nats     publish to JetStream subject ``rooman.<event type>``
                         (``Nats-Msg-Id`` = event id, so JetStream drops repeats).

Anything else is retried with exponential backoff (30 s, 1, 2, 4 ... min, at
most 1 h) and, after EVENT_MAX_ATTEMPTS, marked failed: it then waits on the
failed-events list (``failed_events`` / ``retry_failed``) for a person.

Several API workers can run the relay at once: each event is leased with a
conditional UPDATE before it is sent, so only one worker sends it.
"""

from __future__ import annotations

import asyncio
import logging
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import SessionLocal
from backend.integrations.tables import outbox

logger = logging.getLogger("roomanbooks.integrations.relay")

LEASE_SECONDS = 60
WEBHOOK_TIMEOUT_SECONDS = 10
BATCH = 100
CUSTOMER_RETRY_EVERY_SECONDS = 60

_task: Optional[asyncio.Task] = None


def backoff(attempts: int) -> timedelta:
    """30 s after the first failure, then doubling: 1, 2, 4 ... minutes, at most an hour."""
    return timedelta(seconds=min(3600, 30 * 2 ** max(0, attempts - 1)))


# --------------------------------------------------------------------------- #
# Transports: each returns {target: error or None}
# --------------------------------------------------------------------------- #
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: ARG002
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def _post(url: str, body: bytes, headers: dict) -> int:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with _opener.open(request, timeout=WEBHOOK_TIMEOUT_SECONDS) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def send_webhooks(event, body: bytes, signature: str, skip: set) -> dict[str, Optional[str]]:
    results: dict[str, Optional[str]] = {}
    for url in get_settings().event_subscribers:
        if url in skip:
            continue
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "RoomanBooks-Events/1",
            "X-Rooman-Signature": signature,
            "X-Rooman-Event-Id": event.id,
            "X-Rooman-Event-Type": event.type,
        }
        try:
            status = _post(url, body, headers)
            results[url] = None if 200 <= status < 300 else f"HTTP {status}"
        except Exception as exc:  # network error, timeout, TLS
            results[url] = f"{type(exc).__name__}"
    return results


def send_nats(event, body: bytes, signature: str, skip: set) -> dict[str, Optional[str]]:
    target = "nats"
    if target in skip:
        return {}
    url = get_settings().nats_url
    if not url:
        return {target: "NATS_URL is not set"}

    async def publish() -> None:
        import nats  # nats-py; installed with requirements-integration.txt

        client = await nats.connect(url, connect_timeout=5)
        try:
            js = client.jetstream()
            await js.publish(f"rooman.{event.type}", body, headers={"Nats-Msg-Id": event.id, "X-Rooman-Signature": signature})
        finally:
            await client.drain()

    try:
        asyncio.run(publish())
        return {target: None}
    except Exception as exc:
        return {target: f"{type(exc).__name__}"}


def _transport():
    return send_nats if get_settings().event_transport == "nats" else send_webhooks


# --------------------------------------------------------------------------- #
# Delivery
# --------------------------------------------------------------------------- #
def _due(now: datetime):
    return and_(
        outbox.c.published_at.is_(None),
        outbox.c.failed_at.is_(None),
        or_(outbox.c.next_attempt_at.is_(None), outbox.c.next_attempt_at <= now),
    )


def _claim(db: Session, event_id: str, now: datetime) -> bool:
    result = db.execute(
        update(outbox).where(outbox.c.id == event_id, _due(now)).values(next_attempt_at=now + timedelta(seconds=LEASE_SECONDS))
    )
    db.commit()
    return result.rowcount == 1


def deliver_one(db: Session, row: Any, now: Optional[datetime] = None) -> bool:
    """Send one outbox row and record the outcome (commits). True when published."""
    from rooman_sdk.events import EventEnvelope, sign
    from rooman_sdk.outbox import mark_failed, mark_published

    settings = get_settings()
    now = now or datetime.now(UTC)
    event = EventEnvelope.model_validate(row.payload)
    body = event.to_json().encode("utf-8")
    delivered = set(row.delivered_to or [])
    results = _transport()(event, body, sign(body, settings.event_signing_secret), delivered)
    delivered |= {target for target, error in results.items() if error is None}
    errors = {target: error for target, error in results.items() if error is not None}

    if not errors:
        mark_published(db, outbox, [event.id])
        db.execute(update(outbox).where(outbox.c.id == event.id).values(delivered_to=sorted(delivered), last_error=None))
        db.commit()
        return True

    mark_failed(db, outbox, event.id)  # attempts + 1
    attempts = (row.attempts or 0) + 1
    values: dict[str, Any] = {
        "delivered_to": sorted(delivered),
        "last_error": "; ".join(f"{t}: {e}" for t, e in errors.items())[:2000],
        "next_attempt_at": now + backoff(attempts),
    }
    if attempts >= settings.event_max_attempts:
        values["failed_at"] = now
        logger.error("Event %s (%s) failed after %d attempts: %s", event.id, event.type, attempts, values["last_error"])
    db.execute(update(outbox).where(outbox.c.id == event.id).values(**values))
    db.commit()
    return False


def deliver_due(db: Session, limit: int = BATCH) -> int:
    """Deliver what is due now; returns how many events this worker attempted."""
    now = datetime.now(UTC)
    ids = db.execute(select(outbox.c.id).where(_due(now)).order_by(outbox.c.created_at).limit(limit)).scalars().all()
    attempted = 0
    for event_id in ids:
        try:
            if not _claim(db, event_id, now):
                continue  # another worker took it
            row = db.execute(select(outbox).where(outbox.c.id == event_id)).first()
            attempted += 1
            deliver_one(db, row, now)
        except Exception:
            db.rollback()
            logger.exception("Delivering event %s crashed; it will be retried", event_id)
    return attempted


def failed_events(db: Session, limit: int = 100) -> list[dict]:
    rows = db.execute(select(outbox).where(outbox.c.failed_at.is_not(None)).order_by(outbox.c.failed_at.desc()).limit(limit)).all()
    return [
        {
            "id": r.id,
            "type": r.type,
            "orgId": r.org_id,
            "attempts": r.attempts,
            "lastError": r.last_error,
            "failedAt": r.failed_at,
            "createdAt": r.created_at,
        }
        for r in rows
    ]


def retry_failed(db: Session, event_id: str) -> bool:
    """Put a failed event back in the queue (attempts reset). False when no such failed event."""
    result = db.execute(
        update(outbox)
        .where(outbox.c.id == event_id, outbox.c.failed_at.is_not(None), outbox.c.published_at.is_(None))
        .values(failed_at=None, attempts=0, next_attempt_at=None, last_error=None)
    )
    db.commit()
    return result.rowcount == 1


# --------------------------------------------------------------------------- #
# Background loop (started by main.py only when INTEGRATION_ENABLED=true)
# --------------------------------------------------------------------------- #
def run_once(include_customers: bool = True) -> None:
    from backend.integrations import customers

    with SessionLocal() as db:
        deliver_due(db)
        if include_customers:
            customers.retry_pending(db)


async def _loop() -> None:
    interval = get_settings().event_relay_interval_seconds
    last_customers = 0.0
    while True:
        try:
            due_customers = time.monotonic() - last_customers >= CUSTOMER_RETRY_EVERY_SECONDS
            await asyncio.to_thread(run_once, due_customers)
            if due_customers:
                last_customers = time.monotonic()
        except asyncio.CancelledError:
            raise
        except Exception:  # the loop must never die
            logger.exception("Event relay tick failed")
        await asyncio.sleep(interval)


def start() -> None:
    global _task
    settings = get_settings()
    if not settings.integration_enabled or settings.environment.lower() == "test" or _task is not None:
        return
    _task = asyncio.get_running_loop().create_task(_loop(), name="rooman-event-relay")
    logger.info("Event relay started (transport=%s)", settings.event_transport)


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):  # noqa: B014 - shutdown must not raise
        pass
    _task = None
