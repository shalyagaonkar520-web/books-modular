"""Rooman Books API application."""
from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.config import get_settings
from backend.db import SessionLocal, create_all
from backend.services import razorpay_scheduler

settings = get_settings()
logger = logging.getLogger("roomanbooks")
logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    if settings.auto_create_tables:
        create_all()
    logger.info("Rooman Books API started (env=%s, db=%s)", settings.environment, "sqlite" if settings.is_sqlite else "postgresql")
    razorpay_scheduler.start()
    try:
        yield
    finally:
        await razorpay_scheduler.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Rooman Books API",
        description="Accounting, invoicing, purchases, banking, payroll and reporting API for Rooman Books.",
        version="2.0.0",
        lifespan=lifespan,
        docs_url="/docs" if not settings.is_production or settings.debug else None,
        redoc_url="/redoc" if not settings.is_production or settings.debug else None,
    )

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

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, exc: Exception):  # pragma: no cover - safety net
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    from backend.deps import require_full_app_access
    from backend.routers import (
        accounting,
        auth,
        banking,
        bills,
        contacts,
        dashboard,
        documents,
        employee_portal,
        expenses,
        invoices,
        items,
        organization,
        payments,
        payroll,
        projects,
        razorpay,
        reports,
    )

    # auth (login, /me, change-password, sessions) and the employee portal
    # stay reachable by every role, including the restricted "employee"
    # portal-only login. Most other routers require require_full_app_access
    # (admin/staff/viewer) at the router level, so a new endpoint that only
    # checks get_current_user is safe by default rather than accidentally
    # exposing company data to that role.
    #
    # payments and razorpay are excluded from that blanket gate because each
    # mixes in a handful of endpoints that must stay reachable with no user
    # session at all - the Razorpay webhook (server-to-server, signature
    # verified) and the external-payment email confirmation links a customer
    # clicks without ever logging in. Their other, authenticated endpoints
    # are individually guarded in those files instead. email is excluded
    # because every endpoint in it is already unauthenticated by design
    # (pre-existing behaviour, unrelated to this change).
    app.include_router(auth.router)
    app.include_router(employee_portal.router)
    for module in (
        organization,
        items,
        contacts,
        invoices,
        bills,
        expenses,
        banking,
        accounting,
        projects,
        documents,
        payroll,
        reports,
        dashboard,
    ):
        app.include_router(module.router, dependencies=[Depends(require_full_app_access)])
    app.include_router(payments.router)
    app.include_router(razorpay.router)
    from backend.routes import email
    app.include_router(email.router)
    app.include_router(items.adjustments_router, dependencies=[Depends(require_full_app_access)])

    @app.get("/api/health", tags=["Health"])
    def health():
        db_status = "ok"
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
        except Exception as exc:  # pragma: no cover - only when DB is down
            logger.error("Health check DB failure: %s", exc)
            db_status = "error"
        payload = {
            "status": "healthy" if db_status == "ok" else "degraded",
            "service": "Rooman Books API",
            "version": app.version,
            "database": db_status,
            "engine": "sqlite" if settings.is_sqlite else "postgresql",
        }
        return JSONResponse(status_code=200 if db_status == "ok" else 503, content=payload)

    @app.get("/", include_in_schema=False)
    def root():
        return {"service": "Rooman Books API", "docs": "/docs", "health": "/api/health"}

    return app


app = create_app()
