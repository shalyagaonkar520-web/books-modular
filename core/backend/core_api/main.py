"""Rooman One Core API: identity and platform.

Phase 0 ships only the service skeleton (health, request IDs, error
handling). Identity, organizations and OIDC arrive in Phase 1.
"""

from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from core_api.config import get_settings
from core_api.db import SessionLocal

SERVICE_NAME = "Rooman One Core"

settings = get_settings()
logger = logging.getLogger("rooman.core")
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Rooman One Core API",
        description="Identity, organizations, plans and app access for Rooman One.",
        version="0.1.0",
        docs_url="/docs" if not settings.is_production or settings.debug else None,
        redoc_url=None,
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - started) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path.startswith("/api"):
            logger.info("%s %s -> %s (%.1f ms) rid=%s", request.method, request.url.path, response.status_code, duration_ms, request_id)
        return response

    def _request_id(request: Request) -> str:
        return getattr(request.state, "request_id", None) or uuid.uuid4().hex[:12]

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError):
        request_id = _request_id(request)
        logger.warning("Integrity error on %s %s rid=%s: %s", request.method, request.url.path, request_id, exc.orig)
        return JSONResponse(
            status_code=409,
            content={"detail": "The change conflicts with existing data and was not saved.", "requestId": request_id},
            headers={"X-Request-ID": request_id},
        )

    @app.exception_handler(OperationalError)
    async def database_unavailable(request: Request, exc: OperationalError):
        request_id = _request_id(request)
        logger.error("Database unavailable on %s %s rid=%s: %s", request.method, request.url.path, request_id, exc.orig)
        return JSONResponse(
            status_code=503,
            content={
                "detail": f"The service is busy right now. Please try again in a moment (reference {request_id}).",
                "requestId": request_id,
            },
            headers={"X-Request-ID": request_id, "Retry-After": "5"},
        )

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception):  # pragma: no cover - safety net
        request_id = _request_id(request)
        logger.exception("Unhandled error on %s %s rid=%s", request.method, request.url.path, request_id)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Something went wrong on our side. Please try again (reference {request_id}).", "requestId": request_id},
            headers={"X-Request-ID": request_id},
        )

    @app.get("/api/health", tags=["Health"])
    def health():
        db_status = "ok"
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
        except Exception as exc:
            logger.error("Health check DB failure: %s", exc)
            db_status = "error"
        return {
            "status": "healthy" if db_status == "ok" else "degraded",
            "service": SERVICE_NAME,
            "version": app.version,
            "database": db_status,
        }

    return app


app = create_app()
