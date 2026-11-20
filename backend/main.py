"""Rooman Books API application."""

from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.config import get_settings
from backend.db import SessionLocal, create_all
from backend.services import idempotency, razorpay_scheduler, recurring, webhook_dispatcher, workflows

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
    webhook_dispatcher.start()
    recurring.start()
    workflows.start()
    try:
        yield
    finally:
        await workflows.stop()
        await recurring.stop()
        await webhook_dispatcher.stop()
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
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Idempotency-Key"],
    )

    # Connected apps' retried writes (Idempotency-Key) answer with the first response.
    app.middleware("http")(idempotency.middleware)

    @app.middleware("http")
    async def hide_cost_from_workspace_staff(request: Request, call_next):
        """An AI-workspace employee without the Financial data switch never receives cost prices
        (flagged by deps._workspace_error on the request; no other request is touched)."""
        response = await call_next(request)
        if not getattr(request.state, "hide_cost", False) or "application/json" not in response.headers.get("content-type", ""):
            return response
        import json as _json

        from backend.services.workspace import perms as workspace_perms

        body = b"".join([chunk async for chunk in response.body_iterator])
        try:
            body = _json.dumps(workspace_perms.strip_cost(_json.loads(body))).encode("utf-8")
        except ValueError:
            pass
        headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
        return Response(content=body, status_code=response.status_code, headers=headers, media_type="application/json")

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
        # A unique / foreign-key rule in the database refused the write (e.g. a
        # duplicate number, or a record still in use). The endpoint did not
        # check it first; answer 409 with a readable message instead of a 500.
        request_id = _request_id(request)
        logger.warning("Integrity error on %s %s rid=%s: %s", request.method, request.url.path, request_id, exc.orig)
        message = str(exc.orig).lower()
        if "unique" in message or "duplicate" in message:
            detail = "This would create a duplicate of an existing record. Change the number, name or email and try again."
        elif "foreign key" in message:
            detail = "This record is linked to other records, so it cannot be changed or removed this way."
        else:
            detail = "The change conflicts with existing data and was not saved."
        return JSONResponse(status_code=409, content={"detail": detail, "requestId": request_id}, headers={"X-Request-ID": request_id})

    @app.exception_handler(OperationalError)
    async def database_unavailable(request: Request, exc: OperationalError):
        # Locked, restarting or unreachable database: worth retrying, not a bug in the request.
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
        # The reference matches the server log line above, so a reported error can be traced.
        return JSONResponse(
            status_code=500,
            content={"detail": f"Something went wrong on our side. Please try again (reference {request_id}).", "requestId": request_id},
            headers={"X-Request-ID": request_id},
        )

    from backend.deps import require_full_app_access, require_module, require_subscription
    from backend.routers import admin_console, auth, employee_portal, payments, razorpay, reviews, subscription, support

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
    #
    # Every role guard (require_full_app_access, require_write, ...) also
    # enforces the subscription lock: once an organization's free trial is over
    # without an active plan it answers HTTP 402 subscription_required. auth,
    # app content, the public site and the subscription router (where the
    # organization's admin chooses a plan) stay reachable while locked; the
    # employee portal is locked as well.
    app.include_router(auth.router)
    app.include_router(subscription.router)
    # Support is open to every role, even while the plan has run out.
    app.include_router(support.router)
    # The Admin console (the organization's admins) and reviews; guarded per route.
    app.include_router(admin_console.router)
    app.include_router(reviews.router)
    app.include_router(employee_portal.router, dependencies=[Depends(require_subscription)])
    # AI Employee Workspace: owner admin, employee chat, and the public invitation pages.
    # Each route guards itself (admin / signed-in workspace employee / invitation token).
    from backend.routers import workspace as workspace_routes

    app.include_router(workspace_routes.public_router)
    app.include_router(workspace_routes.admin_router)
    app.include_router(workspace_routes.router)
    app.include_router(workspace_routes.buddy_router)
    # Every feature is declared once in backend/features.py: mounted here behind
    # require_full_app_access, plus require_module when it is sold in a plan
    # (writes outside the organization's accepted plan answer 403).
    from backend import features

    for feature in features.FEATURES:
        guards = [Depends(require_full_app_access)]
        if feature.plan_keys:
            guards.append(Depends(require_module(*feature.plan_keys)))
        for router in feature.load_routers():
            app.include_router(router, dependencies=guards)
    app.include_router(payments.router)
    app.include_router(razorpay.router)
    from backend.routes import email

    app.include_router(email.router)

    # Super-admin (platform operator) console. Its auth endpoints are open so an
    # admin can log in; every other platform route is cross-tenant and guarded
    # by require_superuser, so a tenant token can never reach it.
    from backend.deps import require_superuser
    from backend.routers import platform_admin

    app.include_router(platform_admin.auth_router)
    app.include_router(platform_admin.router, dependencies=[Depends(require_superuser)])

    # Connected apps: managed by the platform admin; an app calls
    # /api/connect/v1 with its key, and the rest of the API within its scopes.
    from backend.routers import connected_apps

    app.include_router(connected_apps.platform_router, dependencies=[Depends(require_superuser)])
    from backend.routers import platform_email

    app.include_router(platform_email.router, dependencies=[Depends(require_superuser)])
    app.include_router(connected_apps.connect_router)

    # Editable public-website content: read openly by the landing page, edited
    # only through the guarded platform router.
    from backend.routers import platform_site, public_site

    app.include_router(public_site.router)
    # Customer portal: opened from a shared link with no login (token-guarded).
    from backend.routers import portal

    app.include_router(portal.public_router)
    # The phone scanner of a Point of Sale counter: opened from its QR code, no login (key-guarded).
    from backend.routers import pos as pos_router

    app.include_router(pos_router.public_router)
    app.include_router(public_site.tenant_router)
    app.include_router(platform_site.router, dependencies=[Depends(require_superuser)])

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
