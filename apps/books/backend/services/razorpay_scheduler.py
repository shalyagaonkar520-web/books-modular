"""Background loop that keeps Razorpay transactions up to date.

An organisation opts into automatic syncing by running its first sync from
Settings -> Integrations -> Razorpay. From then on this loop re-checks Razorpay
every ``RAZORPAY_SYNC_INTERVAL_MINUTES``.

The loop is intentionally forgiving: one organisation failing (bad credentials,
Razorpay down, a rate limit) is logged against that organisation's sync log and
does not stop the others or kill the task.
"""
from __future__ import annotations

import asyncio
import logging

from backend.config import get_settings
from backend.db import SessionLocal
from backend.services.razorpay_sync import organizations_to_sync, sync_organization

logger = logging.getLogger("roomanbooks.razorpay.scheduler")

_task: asyncio.Task | None = None


async def _run_once() -> None:
    def work() -> None:
        with SessionLocal() as db:
            org_ids = organizations_to_sync(db)
            if not org_ids:
                logger.debug("Razorpay auto-sync: no organisation has connected yet.")
                return
            for org_id in org_ids:
                try:
                    log = sync_organization(db, org_id, sync_type="scheduled")
                    logger.info(
                        "Razorpay auto-sync for %s: %s (created=%d updated=%d skipped=%d)",
                        org_id,
                        log.status,
                        log.records_created,
                        log.records_updated,
                        log.records_skipped,
                    )
                except Exception:
                    logger.exception("Razorpay auto-sync crashed for organisation %s", org_id)

    # The sync is blocking (SQLAlchemy + the Razorpay SDK), so keep it off the
    # event loop that is serving requests.
    await asyncio.to_thread(work)


async def _loop() -> None:
    settings = get_settings()
    interval = max(5, settings.razorpay_sync_interval_minutes) * 60
    # Let the application finish starting before the first run.
    await asyncio.sleep(min(60, interval))
    while True:
        try:
            await _run_once()
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - the loop must never die
            logger.exception("Razorpay auto-sync tick failed")
        await asyncio.sleep(interval)


def start() -> None:
    """Start the loop if automatic syncing is enabled and credentials exist."""
    global _task
    settings = get_settings()
    if not settings.razorpay_sync_enabled:
        logger.info("Razorpay auto-sync is disabled (RAZORPAY_SYNC_ENABLED=false).")
        return
    if not settings.razorpay_configured:
        logger.info("Razorpay auto-sync idle: no credentials configured.")
        return
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="razorpay-auto-sync")
    logger.info(
        "Razorpay auto-sync started (every %d minutes, mode=%s).",
        settings.razorpay_sync_interval_minutes,
        settings.razorpay_mode,
    )


async def stop() -> None:
    """Cancel the loop on shutdown and wait for it to unwind."""
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):  # noqa: B014 - shutdown must not raise
        pass
    _task = None
