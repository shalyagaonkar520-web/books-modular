"""Incoming events: ``POST /internal/events`` (private network only).

1. The ``X-Rooman-Signature`` must match the raw body with the current or the
   previous signing secret (during a rotation). Otherwise 401, and the body is
   never parsed.
2. The body must be a valid ``EventEnvelope`` and match its contract
   (contracts/events). Otherwise 422.
3. The handler runs inside ``handle_once`` (dedupe on the event id in
   ``processed_events``) in one transaction: 200 handled, 200 already handled,
   202 for a type Books does not handle.

Handlers register with ``@handles("type")``. A NATS consumer, when added, calls
``dispatch`` and so runs exactly the same handlers.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.integrations import contracts
from backend.integrations.tables import processed_events

logger = logging.getLogger("roomanbooks.integrations.inbound")

CONSUMER = "books"
MAX_BODY_BYTES = 1_000_000

router = APIRouter(prefix="/internal", tags=["Rooman One (internal)"], include_in_schema=False)

Handler = Callable[[Session, Any], None]
HANDLERS: dict[str, Handler] = {}


def handles(event_type: str) -> Callable[[Handler], Handler]:
    """Register the function that applies ``event_type`` to Books' data."""

    def register(fn: Handler) -> Handler:
        HANDLERS[event_type] = fn
        return fn

    return register


def dispatch(db: Session, event) -> str:
    """Run the handler once for this event (the caller commits). Returns handled | duplicate | ignored."""
    from rooman_sdk.consumer import handle_once

    handler = HANDLERS.get(event.type)
    if handler is None:
        return "ignored"
    if db.get_bind().dialect.name == "sqlite":
        # Python's sqlite3 driver opens a transaction only at the first write,
        # so handle_once's savepoint would otherwise run outside one and its
        # "processed" mark would survive a failing handler. A no-op write opens
        # the transaction first. (PostgreSQL needs nothing.)
        db.execute(delete(processed_events).where(processed_events.c.event_id == ""))
    return "handled" if handle_once(db, processed_events, CONSUMER, event, handler) else "duplicate"


def _secrets() -> list[str]:
    settings = get_settings()
    return [s for s in (settings.event_signing_secret, settings.event_signing_secret_previous) if s]


@router.post("/events")
async def receive_event(request: Request, db: Session = Depends(get_db)):
    from pydantic import ValidationError
    from rooman_sdk.events import EventEnvelope, verify

    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(413, "The event is too large.")
    signature = request.headers.get("x-rooman-signature", "")
    if not signature or not verify(body, signature, _secrets()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing event signature.")

    try:
        raw = json.loads(body)
        event = EventEnvelope.model_validate(raw)
    except (ValueError, ValidationError) as exc:
        raise HTTPException(422, "The body is not a valid event envelope.") from exc
    handled_here = event.type in HANDLERS
    if handled_here or contracts.has_contract(event.type, event.version):
        try:
            contracts.validate(raw)
        except contracts.ContractError as exc:
            raise HTTPException(422, f"The event does not match its contract: {exc}") from exc

    if not handled_here:
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"status": "ignored", "eventId": event.id})
    try:
        outcome = dispatch(db, event)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Handling event %s (%s) failed; the sender will retry", event.id, event.type)
        raise
    return {"status": outcome, "eventId": event.id}
