"""Safe retries for connected apps: the ``Idempotency-Key`` header.

A connected app that sends a write (POST/PUT/PATCH/DELETE) with an
``Idempotency-Key`` gets the first response replayed when it retries with the
same key - a timed-out "create invoice" retried does not create two invoices.

* Same key, same request, finished  -> the stored response, ``Idempotent-Replayed: true``.
* Same key, still running           -> 409, retry shortly.
* Same key, a different request     -> 422.
* A 5xx is not stored, so the retry runs again. Records expire after 24 hours
  (webhook_dispatcher clears them).

Only for API-key requests (people retry through the app's own forms).
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from backend.db import SessionLocal
from backend.models import IdempotencyRecord
from backend.services import integrations

HEADER = "idempotency-key"
_WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
MAX_KEY_LENGTH = 120
MAX_STORED_BODY = 1_000_000
TTL = timedelta(hours=24)


def _api_key(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or ""
    scheme, _, token = auth.partition(" ")
    token = token.strip()
    return token if scheme.lower() == "bearer" and integrations.is_api_key(token) else None


def _claim(token: str, key: str, request_hash: str):
    """("new", record id) | ("replay", record) | ("busy", None) | ("mismatch", None) | ("unknown", None)."""
    with SessionLocal() as db:
        conn = integrations.find_connection(db, token)
        if conn is None:
            return "unknown", None
        record = IdempotencyRecord(connection_id=conn.id, key=key, request_hash=request_hash)
        db.add(record)
        try:
            db.commit()
            return "new", record.id
        except IntegrityError:
            db.rollback()
        existing = db.execute(
            select(IdempotencyRecord).where(IdempotencyRecord.connection_id == conn.id, IdempotencyRecord.key == key)
        ).scalar_one_or_none()
        if existing is None:
            return "busy", None
        if existing.request_hash != request_hash:
            return "mismatch", None
        if existing.status_code is None:
            return "busy", None
        db.expunge(existing)
        return "replay", existing


def _finish(record_id: str, status_code: int, body: bytes, content_type: Optional[str]) -> None:
    with SessionLocal() as db:
        record = db.get(IdempotencyRecord, record_id)
        if record is None:
            return
        if status_code >= 500 or len(body) > MAX_STORED_BODY:
            db.delete(record)
        else:
            record.status_code = status_code
            record.response_body = body.decode("utf-8", errors="replace")
            record.content_type = content_type
        db.commit()


def purge_expired() -> int:
    with SessionLocal() as db:
        result = db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.created_at < datetime.now(UTC) - TTL))
        db.commit()
        return result.rowcount or 0


async def middleware(request: Request, call_next):
    key = request.headers.get(HEADER)
    token = _api_key(request) if key is not None else None
    if token is None or request.method not in _WRITE_METHODS:
        return await call_next(request)
    key = key.strip()
    if not key or len(key) > MAX_KEY_LENGTH or not key.isprintable():
        return JSONResponse(status_code=400, content={"detail": f"Idempotency-Key must be 1-{MAX_KEY_LENGTH} printable characters."})
    body = await request.body()
    fingerprint = hashlib.sha256(
        b"\n".join([request.method.encode(), str(request.url.path).encode(), request.url.query.encode(), body])
    ).hexdigest()
    outcome, value = await run_in_threadpool(_claim, token, key, fingerprint)
    if outcome == "unknown":
        return await call_next(request)  # authentication answers 401
    if outcome == "mismatch":
        return JSONResponse(status_code=422, content={"detail": "This Idempotency-Key was already used for a different request."})
    if outcome == "busy":
        return JSONResponse(
            status_code=409,
            content={"detail": "A request with this Idempotency-Key is still being processed. Retry shortly."},
            headers={"Retry-After": "2"},
        )
    if outcome == "replay":
        return Response(
            content=value.response_body or "",
            status_code=value.status_code,
            media_type=value.content_type,
            headers={"Idempotent-Replayed": "true"},
        )
    try:
        response = await call_next(request)
    except Exception:
        await run_in_threadpool(_finish, value, 500, b"", None)
        raise
    chunks = [chunk async for chunk in response.body_iterator]
    payload = b"".join(c if isinstance(c, bytes) else c.encode("utf-8") for c in chunks)
    await run_in_threadpool(_finish, value, response.status_code, payload, response.headers.get("content-type"))
    headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
    return Response(content=payload, status_code=response.status_code, headers=headers)
