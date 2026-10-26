"""Background loop that delivers Books events to connected apps' webhooks.

Each pending ``WebhookDelivery`` is POSTed as JSON to its app's webhook URL:

* ``X-Rooman-Event``: the event type, ``X-Rooman-Delivery``: the delivery id
  (the same on every retry - receivers de-duplicate on the event ``id``),
* ``X-Rooman-Signature: t=<unix>,v1=<hex>`` - HMAC-SHA256 of ``"<t>.<body>"``
  with the app's signing secret (integrations.sign).

A 2xx marks it delivered. Anything else is retried after 30 s, 2 min, 10 min,
1 h, 6 h, 12 h and 24 h; after the last attempt it is ``dead`` and a platform
admin can resend it. One app failing never holds up the others.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlalchemy import select, update

from backend.config import get_settings
from backend.db import SessionLocal
from backend.models import AppConnection, WebhookDelivery
from backend.services import idempotency, integrations

logger = logging.getLogger("roomanbooks.webhooks")

RETRY_DELAYS = (30, 120, 600, 3600, 6 * 3600, 12 * 3600, 24 * 3600)
MAX_ATTEMPTS = len(RETRY_DELAYS) + 1
TIMEOUT_SECONDS = 10
BATCH = 50
POLL_SECONDS = 5
# A claimed delivery is not picked up by another worker for this long (> TIMEOUT_SECONDS).
LEASE_SECONDS = 60

_task: asyncio.Task | None = None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A redirect could point a webhook at an internal address: treat it as a failure."""

    def redirect_request(self, *args, **kwargs):  # noqa: ARG002
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def _post(url: str, body: bytes, headers: dict) -> int:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with _opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def deliver(db, delivery: WebhookDelivery, now: Optional[datetime] = None) -> bool:
    """Attempt one delivery and record the outcome (not committed). True when delivered."""
    now = now or datetime.now(UTC)
    conn: Optional[AppConnection] = db.get(AppConnection, delivery.connection_id)
    delivery.attempts += 1
    status_code: Optional[int] = None
    error: Optional[str] = None
    if conn is None or not conn.is_active or not conn.webhook_url:
        error = "The app is disconnected or has no webhook URL."
        delivery.attempts = MAX_ATTEMPTS
    else:
        url_error = integrations.webhook_url_error(conn.webhook_url)
        if url_error:
            error = url_error
        else:
            body = json.dumps(integrations.envelope(delivery.event), separators=(",", ":")).encode("utf-8")
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "RoomanBooks-Webhooks/1",
                "X-Rooman-Event": delivery.event.type,
                "X-Rooman-Delivery": delivery.id,
                "X-Rooman-Signature": integrations.sign(integrations.signing_secret(conn), int(time.time()), body),
            }
            try:
                status_code = _post(conn.webhook_url, body, headers)
                if not 200 <= status_code < 300:
                    error = f"The app answered HTTP {status_code}."
            except Exception as exc:  # network errors, timeouts, TLS failures
                error = f"Could not reach the app: {type(exc).__name__}"
    delivery.last_status_code = status_code
    if error is None:
        delivery.status = "delivered"
        delivery.delivered_at = now
        delivery.last_error = None
        return True
    delivery.last_error = error[:500]
    if delivery.attempts >= MAX_ATTEMPTS:
        delivery.status = "dead"
        logger.warning(
            "Webhook %s to connection %s is dead after %d attempts: %s", delivery.id, delivery.connection_id, delivery.attempts, error
        )
    else:
        delivery.next_attempt_at = now + timedelta(seconds=RETRY_DELAYS[delivery.attempts - 1])
    return False


def _claim(db, delivery_id: str, now: datetime) -> bool:
    """Lease a due delivery to this worker (a conditional UPDATE, so with several
    API workers only one sends it); the lease lapses if the worker dies mid-send."""
    result = db.execute(
        update(WebhookDelivery)
        .where(WebhookDelivery.id == delivery_id, WebhookDelivery.status == "pending", WebhookDelivery.next_attempt_at <= now)
        .values(next_attempt_at=now + timedelta(seconds=LEASE_SECONDS))
    )
    db.commit()
    return result.rowcount == 1


def run_once(limit: int = BATCH) -> int:
    """Deliver what is due; returns how many deliveries this worker attempted."""
    now = datetime.now(UTC)
    attempted = 0
    with SessionLocal() as db:
        due_ids = (
            db.execute(
                select(WebhookDelivery.id)
                .where(WebhookDelivery.status == "pending", WebhookDelivery.next_attempt_at <= now)
                .order_by(WebhookDelivery.next_attempt_at)
                .limit(limit)
            )
            .scalars()
            .all()
        )
        for delivery_id in due_ids:
            try:
                if not _claim(db, delivery_id, now):
                    continue
                delivery = db.get(WebhookDelivery, delivery_id)
                attempted += 1
                deliver(db, delivery, now)
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("Webhook delivery %s crashed", delivery_id)
                _record_crash(db, delivery_id, now)
    return attempted


def _record_crash(db, delivery_id: str, now: datetime) -> None:
    """Count a crashed attempt like a failed one, so it backs off and ends as dead."""
    try:
        delivery = db.get(WebhookDelivery, delivery_id)
        if delivery is None or delivery.status != "pending":
            return
        delivery.attempts += 1
        delivery.last_error = "Books could not prepare this event."
        if delivery.attempts >= MAX_ATTEMPTS:
            delivery.status = "dead"
        else:
            delivery.next_attempt_at = now + timedelta(seconds=RETRY_DELAYS[delivery.attempts - 1])
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not record the crash of webhook delivery %s", delivery_id)


async def _loop() -> None:
    last_purge = 0.0
    while True:
        try:
            await asyncio.to_thread(run_once)
            if time.monotonic() - last_purge > 3600:
                await asyncio.to_thread(idempotency.purge_expired)
                last_purge = time.monotonic()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Webhook loop iteration failed")
        await asyncio.sleep(POLL_SECONDS)


def start() -> None:
    global _task
    settings = get_settings()
    if not settings.webhooks_enabled or settings.environment.lower() == "test" or _task is not None:
        return
    try:
        _task = asyncio.get_running_loop().create_task(_loop())
    except RuntimeError:
        _task = None


async def stop() -> None:
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):
        pass
    _task = None
