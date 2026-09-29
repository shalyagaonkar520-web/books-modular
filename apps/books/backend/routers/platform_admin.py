"""Super-admin (platform operator) API: cross-tenant dashboard and controls.

Every route here is guarded by ``require_superuser`` (registered in main.py for
``router``; the auth endpoints on ``auth_router`` are deliberately open so an
admin can log in). These endpoints intentionally query across all
organizations - that is the whole point of the platform console - so they must
never be reachable by a tenant token.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import UTC, date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_superuser
from backend.models import (
    AuditLog,
    BankAccount,
    Bill,
    Contact,
    CustomerPayment,
    Invoice,
    Organization,
    PlatformAdmin,
    PlatformRefreshToken,
    RefreshToken,
    User,
    VendorPayment,
)
from backend.schemas.common import Page
from backend.schemas.platform import (
    ChangePlatformPasswordRequest,
    CreateOrganizationRequest,
    CreateOrgResponse,
    CreatePlatformAdminRequest,
    CreatePlatformUserRequest,
    ImpersonateOrg,
    ImpersonateResponse,
    OrgDetail,
    OrgSummary,
    PlatformAdminOut,
    PlatformAuditOut,
    PlatformDashboard,
    PlatformInvoiceOut,
    PlatformLoginRequest,
    PlatformSearchResults,
    PlatformSettingsOut,
    PlatformTokenResponse,
    PlatformUserOut,
    RejectOrganizationRequest,
    ResetUserPasswordRequest,
    TimePoint,
    UpdateOrganizationRequest,
    UpdatePlatformAdminRequest,
    UpdatePlatformSettingsRequest,
    UpdatePlatformUserRequest,
)
from backend.security import (
    create_access_token,
    create_platform_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from backend.services import audit, platform_settings
from backend.services.chart_of_accounts import bootstrap_accounts
from backend.services.email_service import send_custom_message_email, smtp_configured
from backend.services.ratelimit import RateLimiter, client_ip
from backend.services.tenancy import Pagination

# Runtime setting key for the public tenant-signup gate (see auth.register).
ALLOW_PUBLIC_SIGNUP_KEY = "allow_public_signup"

# Suspension reason stamped on an org when it is archived (soft deleted).
ARCHIVED_REASON = "Archived by platform admin"

# Org profile/settings columns a platform admin may edit via PATCH.
_ORG_PROFILE_FIELDS = (
    "name",
    "legal_name",
    "gstin",
    "pan",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "postal_code",
    "country",
    "currency",
    "fiscal_year_start_month",
    "default_tax_rate",
    "default_payment_terms_days",
    "invoice_terms",
    "invoice_notes",
)


def _csv_cell(value) -> str:
    """Neutralise CSV/formula injection: a cell a spreadsheet would treat as a
    formula (leading = + - @ tab or CR) is prefixed with a single quote."""
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def _csv_response(header: List[str], rows: List[List], filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    for row in rows:
        writer.writerow([_csv_cell(c) for c in row])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

settings = get_settings()
logger = logging.getLogger("roomanbooks.platform")

auth_router = APIRouter(prefix="/api/platform/auth", tags=["Platform Auth"])
router = APIRouter(prefix="/api/platform", tags=["Platform"])

PLATFORM_REFRESH_COOKIE = "rb_platform_refresh"
_login_limiter = RateLimiter(settings.login_rate_limit_per_minute)

# Posted (non-draft, non-void) invoice statuses count toward revenue metrics.
_LIVE_INVOICE_STATUSES = ("sent", "partially_paid", "paid", "overdue")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _admin_out(admin: PlatformAdmin) -> PlatformAdminOut:
    return PlatformAdminOut.model_validate(admin)


def _issue_platform_tokens(db: Session, admin: PlatformAdmin, response: Response, request: Request) -> str:
    access = create_platform_access_token(admin.id)
    raw_refresh = generate_refresh_token()
    db.add(
        PlatformRefreshToken(
            admin_id=admin.id,
            token_hash=hash_token(raw_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            user_agent=(request.headers.get("user-agent") or "")[:255],
            ip_address=client_ip(request)[:64],
        )
    )
    response.set_cookie(
        key=PLATFORM_REFRESH_COOKIE,
        value=raw_refresh,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/platform/auth",
        domain=settings.cookie_domain,
    )
    return access


def _float(value) -> float:
    return float(value or 0)


def _org_name_map(db: Session, org_ids: List[str]) -> dict:
    if not org_ids:
        return {}
    rows = db.execute(select(Organization.id, Organization.name).where(Organization.id.in_(org_ids))).all()
    return {r[0]: r[1] for r in rows}


def _user_out(u: User, org_name: Optional[str]) -> PlatformUserOut:
    return PlatformUserOut(
        id=u.id,
        name=u.name,
        email=u.email,
        role=u.role,
        is_active=u.is_active,
        organization_id=u.organization_id,
        organization_name=org_name,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
    )


def _apply_org_status(stmt, status_filter: Optional[str]):
    """Filter an Organization select by lifecycle status.

    ``active`` = approved, not suspended and not archived; ``suspended`` =
    suspended but not archived; ``pending`` / ``rejected`` = awaiting or
    declined sign-up approval, not archived; ``archived`` = soft-deleted;
    ``all`` = everything. Anything else (including omitted) hides archived orgs
    (pending ones are included).
    """
    if status_filter == "all":
        return stmt
    if status_filter == "archived":
        return stmt.where(Organization.deleted_at.is_not(None))
    stmt = stmt.where(Organization.deleted_at.is_(None))
    if status_filter == "suspended":
        stmt = stmt.where(Organization.is_suspended.is_(True))
    elif status_filter == "active":
        stmt = stmt.where(Organization.is_suspended.is_(False), Organization.approval_status == "approved")
    elif status_filter in ("pending", "rejected"):
        stmt = stmt.where(Organization.approval_status == status_filter)
    return stmt


def _admin_email_map(db: Session, org_ids: List[str]) -> dict:
    """Each org's first admin user's email (the account that signed it up)."""
    if not org_ids:
        return {}
    rows = db.execute(
        select(User.organization_id, User.email)
        .where(User.organization_id.in_(org_ids), User.role == "admin")
        .order_by(User.created_at)
    ).all()
    out: dict = {}
    for org_id, email in rows:
        out.setdefault(org_id, email)
    return out


def _last_login_map(db: Session, org_ids: List[str]) -> dict:
    if not org_ids:
        return {}
    rows = db.execute(
        select(User.organization_id, func.max(User.last_login_at)).where(User.organization_id.in_(org_ids)).group_by(User.organization_id)
    ).all()
    return {r[0]: r[1] for r in rows}


def _org_summaries(db: Session, orgs: List[Organization]) -> List[OrgSummary]:
    ids = [o.id for o in orgs]
    users_by_org = dict(
        db.execute(select(User.organization_id, func.count()).where(User.organization_id.in_(ids)).group_by(User.organization_id)).all()
    ) if ids else {}
    inv_by_org = dict(
        db.execute(
            select(Invoice.organization_id, func.count())
            .where(Invoice.organization_id.in_(ids), Invoice.status.in_(_LIVE_INVOICE_STATUSES))
            .group_by(Invoice.organization_id)
        ).all()
    ) if ids else {}
    invoiced_by_org = dict(
        db.execute(
            select(Invoice.organization_id, func.coalesce(func.sum(Invoice.total), 0))
            .where(Invoice.organization_id.in_(ids), Invoice.status.in_(_LIVE_INVOICE_STATUSES))
            .group_by(Invoice.organization_id)
        ).all()
    ) if ids else {}
    collected_by_org = dict(
        db.execute(
            select(CustomerPayment.organization_id, func.coalesce(func.sum(CustomerPayment.amount), 0))
            .where(CustomerPayment.organization_id.in_(ids))
            .group_by(CustomerPayment.organization_id)
        ).all()
    ) if ids else {}
    last_login = _last_login_map(db, ids)
    admin_emails = _admin_email_map(db, ids)
    return [
        OrgSummary(
            id=o.id,
            name=o.name,
            is_suspended=o.is_suspended,
            is_archived=o.is_archived,
            deleted_at=o.deleted_at,
            approval_status=o.approval_status,
            approved_at=o.approved_at,
            rejection_reason=o.rejection_reason,
            admin_email=admin_emails.get(o.id),
            last_login_at=last_login.get(o.id),
            user_count=int(users_by_org.get(o.id, 0)),
            invoice_count=int(inv_by_org.get(o.id, 0)),
            invoiced_amount=_float(invoiced_by_org.get(o.id, 0)),
            collected_amount=_float(collected_by_org.get(o.id, 0)),
            created_at=o.created_at,
        )
        for o in orgs
    ]


def _org_detail(db: Session, org: Organization) -> OrgDetail:
    user_count = db.scalar(select(func.count()).select_from(User).where(User.organization_id == org.id)) or 0
    invoice_count = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.organization_id == org.id, Invoice.status.in_(_LIVE_INVOICE_STATUSES))
    ) or 0
    bill_count = db.scalar(select(func.count()).select_from(Bill).where(Bill.organization_id == org.id)) or 0
    contact_count = db.scalar(select(func.count()).select_from(Contact).where(Contact.organization_id == org.id)) or 0
    invoiced = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.organization_id == org.id, Invoice.status.in_(_LIVE_INVOICE_STATUSES)
        )
    )
    collected = db.scalar(select(func.coalesce(func.sum(CustomerPayment.amount), 0)).where(CustomerPayment.organization_id == org.id))
    outstanding = db.scalar(
        select(func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)).where(
            Invoice.organization_id == org.id, Invoice.status.in_(_LIVE_INVOICE_STATUSES)
        )
    )
    admins = db.execute(
        select(User).where(User.organization_id == org.id, User.role == "admin").order_by(User.created_at)
    ).scalars().all()
    return OrgDetail(
        id=org.id,
        name=org.name,
        legal_name=org.legal_name,
        gstin=org.gstin,
        email=org.email,
        phone=org.phone,
        country=org.country,
        currency=org.currency,
        fiscal_year_start_month=org.fiscal_year_start_month,
        default_tax_rate=_float(org.default_tax_rate),
        default_payment_terms_days=org.default_payment_terms_days,
        invoice_terms=org.invoice_terms,
        invoice_notes=org.invoice_notes,
        pan=org.pan,
        address=org.address,
        city=org.city,
        state=org.state,
        postal_code=org.postal_code,
        is_suspended=org.is_suspended,
        suspended_at=org.suspended_at,
        suspended_reason=org.suspended_reason,
        deleted_at=org.deleted_at,
        is_archived=org.is_archived,
        approval_status=org.approval_status,
        approved_at=org.approved_at,
        rejection_reason=org.rejection_reason,
        last_login_at=_last_login_map(db, [org.id]).get(org.id),
        created_at=org.created_at,
        user_count=user_count,
        invoice_count=invoice_count,
        bill_count=bill_count,
        contact_count=contact_count,
        invoiced_amount=_float(invoiced),
        collected_amount=_float(collected),
        outstanding_receivables=_float(outstanding),
        admins=[_user_out(a, org.name) for a in admins],
    )


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
@auth_router.post("/login", response_model=PlatformTokenResponse)
def platform_login(payload: PlatformLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    _login_limiter.check(f"platform-login:{client_ip(request)}")
    email = payload.email.lower().strip()
    admin = db.execute(select(PlatformAdmin).where(PlatformAdmin.email == email)).scalar_one_or_none()
    # Constant-ish work whether or not the account exists, to blunt enumeration.
    ok = bool(admin) and admin.is_active and verify_password(payload.password, admin.password_hash)
    if not ok:
        # Burn a hash even on unknown email so timing does not leak existence.
        if not admin:
            verify_password(payload.password, hash_password("dummy-not-a-real-hash"))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    admin.last_login_at = datetime.now(UTC)
    access = _issue_platform_tokens(db, admin, response, request)
    db.commit()
    return PlatformTokenResponse(access_token=access, admin=_admin_out(admin))


@auth_router.post("/refresh", response_model=PlatformTokenResponse)
def platform_refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(PLATFORM_REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    token = db.execute(select(PlatformRefreshToken).where(PlatformRefreshToken.token_hash == hash_token(raw))).scalar_one_or_none()
    now = datetime.now(UTC)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    exp = token.expires_at.replace(tzinfo=UTC) if token.expires_at.tzinfo is None else token.expires_at
    if token.revoked_at is not None or exp < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")
    admin = db.get(PlatformAdmin, token.admin_id)
    if not admin or not admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Administrator is inactive")
    token.revoked_at = now  # rotate
    access = _issue_platform_tokens(db, admin, response, request)
    db.commit()
    return PlatformTokenResponse(access_token=access, admin=_admin_out(admin))


@auth_router.post("/logout")
def platform_logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(PLATFORM_REFRESH_COOKIE)
    if raw:
        token = db.execute(select(PlatformRefreshToken).where(PlatformRefreshToken.token_hash == hash_token(raw))).scalar_one_or_none()
        if token and token.revoked_at is None:
            token.revoked_at = datetime.now(UTC)
            db.commit()
    response.delete_cookie(PLATFORM_REFRESH_COOKIE, path="/api/platform/auth", domain=settings.cookie_domain)
    return {"message": "Signed out"}


@auth_router.post("/change-password")
def platform_change_password(
    payload: ChangePlatformPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
):
    if not verify_password(payload.current_password, admin.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    admin.password_hash = hash_password(payload.new_password)
    # Sign out every other session by revoking their refresh tokens, but keep
    # the one tied to the current cookie so this admin stays logged in here.
    keep_hash = None
    raw = request.cookies.get(PLATFORM_REFRESH_COOKIE)
    if raw:
        keep_hash = hash_token(raw)
    stmt = select(PlatformRefreshToken).where(
        PlatformRefreshToken.admin_id == admin.id, PlatformRefreshToken.revoked_at.is_(None)
    )
    now = datetime.now(UTC)
    for tok in db.execute(stmt).scalars().all():
        if keep_hash and tok.token_hash == keep_hash:
            continue
        tok.revoked_at = now
    db.commit()
    return {"message": "Password changed"}


@router.get("/me", response_model=PlatformAdminOut)
def platform_me(admin: PlatformAdmin = Depends(get_current_superuser)):
    return _admin_out(admin)


# --------------------------------------------------------------------------- #
# Platform admin management (manage other super-admins)
# --------------------------------------------------------------------------- #
@router.get("/admins", response_model=Page[PlatformAdminOut])
def list_admins(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    pagination: Pagination = Depends(),
    search: Optional[str] = Query(None, max_length=200),
):
    stmt = select(PlatformAdmin)
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(PlatformAdmin.name.ilike(s) | PlatformAdmin.email.ilike(s))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.order_by(PlatformAdmin.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    return Page(items=[_admin_out(a) for a in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/admins", response_model=PlatformAdminOut, status_code=status.HTTP_201_CREATED)
def create_admin(payload: CreatePlatformAdminRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    email = payload.email.lower().strip()
    if db.execute(select(PlatformAdmin.id).where(PlatformAdmin.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A platform admin with this email already exists")
    new_admin = PlatformAdmin(name=payload.name, email=email, password_hash=hash_password(payload.password), is_active=True)
    db.add(new_admin)
    db.flush()
    audit.record(db, None, "create", "platform_admin", new_admin.id, f"Platform admin {email} created by {admin.email}")
    db.commit()
    db.refresh(new_admin)
    return _admin_out(new_admin)


@router.patch("/admins/{admin_id}", response_model=PlatformAdminOut)
def update_admin(admin_id: str, payload: UpdatePlatformAdminRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    target = db.get(PlatformAdmin, admin_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Platform admin not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        target.name = data["name"]
    if "is_active" in data and data["is_active"] is not None:
        if data["is_active"] is False and target.is_active:
            if target.id == admin.id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account")
            active_count = db.scalar(select(func.count()).select_from(PlatformAdmin).where(PlatformAdmin.is_active.is_(True))) or 0
            if active_count <= 1:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate the last active platform admin")
        target.is_active = data["is_active"]
    audit.record(db, None, "update", "platform_admin", target.id, f"Platform admin {target.email} updated by {admin.email}")
    db.commit()
    db.refresh(target)
    return _admin_out(target)


@router.delete("/admins/{admin_id}")
def delete_admin(admin_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    target = db.get(PlatformAdmin, admin_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Platform admin not found")
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    total = db.scalar(select(func.count()).select_from(PlatformAdmin)) or 0
    if total <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the last platform admin")
    email = target.email
    db.execute(sa_delete(PlatformRefreshToken).where(PlatformRefreshToken.admin_id == target.id))
    db.delete(target)
    audit.record(db, None, "delete", "platform_admin", admin_id, f"Platform admin {email} deleted by {admin.email}")
    db.commit()
    return {"message": f"Platform admin {email} deleted"}


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
@router.get("/dashboard", response_model=PlatformDashboard)
def platform_dashboard(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    total_orgs = db.scalar(select(func.count()).select_from(Organization)) or 0
    archived = db.scalar(select(func.count()).select_from(Organization).where(Organization.deleted_at.is_not(None))) or 0
    suspended = db.scalar(
        select(func.count()).select_from(Organization).where(Organization.is_suspended.is_(True), Organization.deleted_at.is_(None))
    ) or 0
    active_orgs = db.scalar(
        select(func.count())
        .select_from(Organization)
        .where(Organization.is_suspended.is_(False), Organization.deleted_at.is_(None), Organization.approval_status == "approved")
    ) or 0
    pending_filter = (Organization.approval_status == "pending", Organization.deleted_at.is_(None))
    pending_count = db.scalar(select(func.count()).select_from(Organization).where(*pending_filter)) or 0
    rejected_count = db.scalar(
        select(func.count()).select_from(Organization).where(Organization.approval_status == "rejected", Organization.deleted_at.is_(None))
    ) or 0
    pending_orgs = db.execute(
        select(Organization).where(*pending_filter).order_by(Organization.created_at.desc()).limit(10)
    ).scalars().all()
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    active_users = db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))) or 0
    total_invoices = db.scalar(
        select(func.count()).select_from(Invoice).where(Invoice.status.in_(_LIVE_INVOICE_STATUSES))
    ) or 0
    invoiced = db.scalar(select(func.coalesce(func.sum(Invoice.total), 0)).where(Invoice.status.in_(_LIVE_INVOICE_STATUSES)))
    collected = db.scalar(select(func.coalesce(func.sum(CustomerPayment.amount), 0)))
    total_bills = db.scalar(select(func.count()).select_from(Bill)) or 0
    paid_vendors = db.scalar(select(func.coalesce(func.sum(VendorPayment.amount), 0)))

    today = date.today()
    month_start = today.replace(day=1)
    new_this_month = db.scalar(
        select(func.count()).select_from(Organization).where(Organization.created_at >= datetime(month_start.year, month_start.month, 1, tzinfo=UTC))
    ) or 0

    # Last 6 months of org sign-ups and collected revenue.
    growth: List[TimePoint] = []
    revenue: List[TimePoint] = []
    for i in range(5, -1, -1):
        y = month_start.year
        m = month_start.month - i
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=UTC)
        end = datetime(y + (m // 12), (m % 12) + 1, 1, tzinfo=UTC)
        label = start.strftime("%b %Y")
        oc = db.scalar(
            select(func.count()).select_from(Organization).where(Organization.created_at >= start, Organization.created_at < end)
        ) or 0
        rv = db.scalar(
            select(func.coalesce(func.sum(CustomerPayment.amount), 0)).where(
                CustomerPayment.created_at >= start, CustomerPayment.created_at < end
            )
        )
        growth.append(TimePoint(label=label, value=float(oc)))
        revenue.append(TimePoint(label=label, value=_float(rv)))

    # Top organizations by collected revenue.
    top_rows = db.execute(
        select(CustomerPayment.organization_id, func.coalesce(func.sum(CustomerPayment.amount), 0).label("amt"))
        .group_by(CustomerPayment.organization_id)
        .order_by(func.sum(CustomerPayment.amount).desc())
        .limit(5)
    ).all()
    top_ids = [r[0] for r in top_rows]
    top_orgs: List[OrgSummary] = []
    if top_ids:
        orgs = {o.id: o for o in db.execute(select(Organization).where(Organization.id.in_(top_ids))).scalars()}
        last_login = _last_login_map(db, top_ids)
        for org_id, amt in top_rows:
            org = orgs.get(org_id)
            if not org:
                continue
            uc = db.scalar(select(func.count()).select_from(User).where(User.organization_id == org_id)) or 0
            ic = db.scalar(
                select(func.count()).select_from(Invoice).where(Invoice.organization_id == org_id, Invoice.status.in_(_LIVE_INVOICE_STATUSES))
            ) or 0
            inv = db.scalar(
                select(func.coalesce(func.sum(Invoice.total), 0)).where(Invoice.organization_id == org_id, Invoice.status.in_(_LIVE_INVOICE_STATUSES))
            )
            top_orgs.append(
                OrgSummary(
                    id=org.id,
                    name=org.name,
                    is_suspended=org.is_suspended,
                    is_archived=org.is_archived,
                    deleted_at=org.deleted_at,
                    approval_status=org.approval_status,
                    approved_at=org.approved_at,
                    rejection_reason=org.rejection_reason,
                    last_login_at=last_login.get(org_id),
                    user_count=uc,
                    invoice_count=ic,
                    invoiced_amount=_float(inv),
                    collected_amount=_float(amt),
                    created_at=org.created_at,
                )
            )

    recent = db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(12)).scalars().all()
    names = _org_name_map(db, [a.organization_id for a in recent if a.organization_id])
    recent_out = [
        PlatformAuditOut(
            id=a.id,
            organization_id=a.organization_id,
            organization_name=names.get(a.organization_id),
            user_name=a.user_name,
            action=a.action,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            summary=a.summary,
            created_at=a.created_at,
        )
        for a in recent
    ]

    return PlatformDashboard(
        total_organizations=total_orgs,
        active_organizations=active_orgs,
        suspended_organizations=suspended,
        archived_organizations=archived,
        total_users=total_users,
        active_users=active_users,
        total_invoices=total_invoices,
        total_invoiced_amount=_float(invoiced),
        total_collected_amount=_float(collected),
        total_bills=total_bills,
        total_paid_to_vendors=_float(paid_vendors),
        new_organizations_this_month=new_this_month,
        pending_organizations=pending_count,
        rejected_organizations=rejected_count,
        pending_approvals=_org_summaries(db, pending_orgs),
        organization_growth=growth,
        revenue_by_month=revenue,
        top_organizations=top_orgs,
        recent_activity=recent_out,
    )


# --------------------------------------------------------------------------- #
# Organizations
# --------------------------------------------------------------------------- #
@router.get("/organizations", response_model=Page[OrgSummary])
def list_organizations(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    pagination: Pagination = Depends(),
    search: Optional[str] = Query(None, max_length=200),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    stmt = select(Organization)
    if search:
        stmt = stmt.where(Organization.name.ilike(f"%{search.strip()}%"))
    stmt = _apply_org_status(stmt, status_filter)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    orgs = db.execute(
        stmt.order_by(Organization.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)
    ).scalars().all()
    return Page(items=_org_summaries(db, orgs), total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/organizations/export")
def export_organizations(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    search: Optional[str] = Query(None, max_length=200),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    # Same query/filters as list_organizations, without pagination.
    stmt = select(Organization)
    if search:
        stmt = stmt.where(Organization.name.ilike(f"%{search.strip()}%"))
    stmt = _apply_org_status(stmt, status_filter)
    orgs = db.execute(stmt.order_by(Organization.created_at.desc())).scalars().all()
    rows = [
        [
            o.name,
            "Yes" if o.is_suspended else "No",
            o.user_count,
            o.invoice_count,
            o.invoiced_amount,
            o.collected_amount,
            o.created_at.isoformat() if o.created_at else "",
        ]
        for o in _org_summaries(db, orgs)
    ]
    return _csv_response(["Name", "Suspended", "Users", "Invoices", "Invoiced", "Collected", "Created"], rows, "organizations.csv")


@router.get("/organizations/{org_id}", response_model=OrgDetail)
def get_organization(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return _org_detail(db, org)


@router.get("/organizations/{org_id}/users", response_model=Page[PlatformUserOut])
def organization_users(
    org_id: str,
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    pagination: Pagination = Depends(),
):
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    stmt = select(User).where(User.organization_id == org_id)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    users = db.execute(stmt.order_by(User.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    items = [_user_out(u, org.name) for u in users]
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/organizations/{org_id}/invoices", response_model=Page[PlatformInvoiceOut])
def organization_invoices(
    org_id: str,
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    pagination: Pagination = Depends(),
):
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    stmt = select(Invoice).where(Invoice.organization_id == org_id)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    invoices = db.execute(stmt.order_by(Invoice.date.desc(), Invoice.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    items = [
        PlatformInvoiceOut(
            id=inv.id,
            number=inv.invoice_number,
            customer_name=inv.customer.display_name if inv.customer else None,
            date=inv.date.isoformat() if inv.date else None,
            due_date=inv.due_date.isoformat() if inv.due_date else None,
            status=inv.status,
            total=_float(inv.total),
            amount_paid=_float(inv.amount_paid),
            balance_due=_float(inv.total) - _float(inv.amount_paid),
        )
        for inv in invoices
    ]
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/organizations", response_model=CreateOrgResponse, status_code=status.HTTP_201_CREATED)
def create_organization(payload: CreateOrganizationRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    admin_email = payload.admin_email.lower().strip()
    if db.execute(select(User.id).where(User.email == admin_email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this admin email already exists")

    defaults = platform_settings.get_org_defaults(db)
    org = Organization(
        name=payload.name,
        gstin=payload.gstin or None,
        currency=payload.currency or defaults.currency,
        country=payload.country,
        default_tax_rate=defaults.tax_rate,
        default_payment_terms_days=defaults.payment_terms_days,
        # Created by a platform admin, so there is nothing to approve.
        approval_status="approved",
        approved_at=datetime.now(UTC),
    )
    db.add(org)
    db.flush()

    accounts = bootstrap_accounts(db, org.id)
    db.add(
        BankAccount(
            organization_id=org.id,
            name="Petty Cash",
            type="cash",
            opening_balance=0,
            opening_balance_date=date.today(),
            ledger_account_id=accounts["1000"].id,
            is_primary=True,
        )
    )
    user = User(
        organization_id=org.id,
        name=payload.admin_name,
        email=admin_email,
        password_hash=hash_password(payload.admin_password),
        role="admin",
    )
    db.add(user)
    db.flush()
    audit.record(db, None, "create", "organization", org.id, f"Organization '{org.name}' created by platform admin {admin.email}", organization_id=org.id)
    db.commit()
    db.refresh(org)
    return CreateOrgResponse(organization=_org_detail(db, org), admin=_user_out(user, org.name))


@router.patch("/organizations/{org_id}", response_model=OrgDetail)
def update_organization(org_id: str, payload: UpdateOrganizationRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    data = payload.model_dump(exclude_unset=True)
    for field in _ORG_PROFILE_FIELDS:
        if field in data:
            value = data[field]
            # Required fields reject blanks in the schema, so a blank here is an
            # optional text field being cleared.
            setattr(org, field, value if value != "" else None)
    if "is_suspended" in data:
        if not data["is_suspended"] and org.is_archived:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This organization is archived. Restore it instead of unsuspending it.")
        if data["is_suspended"] and org.is_suspended and data.get("suspended_reason"):
            org.suspended_reason = data["suspended_reason"]
        elif data["is_suspended"] and not org.is_suspended:
            org.is_suspended = True
            org.suspended_at = datetime.now(UTC)
            org.suspended_reason = data.get("suspended_reason") or payload.suspended_reason
        elif not data["is_suspended"] and org.is_suspended:
            org.is_suspended = False
            org.suspended_at = None
            org.suspended_reason = None
    verb = "suspended" if org.is_suspended else "updated"
    audit.record(db, None, "update", "organization", org.id, f"Organization {verb} by platform admin {admin.email}", organization_id=org.id)
    db.commit()
    db.refresh(org)
    return _org_detail(db, org)


def _notify_org_admins(db: Session, org: Organization, subject: str, message: str) -> None:
    """Best-effort email to the org's admin users; never fails the request."""
    if not smtp_configured():
        return
    admins = db.execute(
        select(User).where(User.organization_id == org.id, User.role == "admin", User.is_active.is_(True))
    ).scalars().all()
    for user in admins:
        try:
            res = send_custom_message_email(user.email, subject, message, recipient_name=user.name)
            if not res.get("success"):
                logger.warning("Could not send approval email to %s: %s", user.email, res.get("error"))
        except Exception:  # noqa: BLE001 - notification is best effort
            logger.exception("Could not send approval email to %s", user.email)


@router.post("/organizations/{org_id}/approve", response_model=OrgDetail)
def approve_organization(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    """Let a pending (or previously rejected) sign-up's users sign in."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    org.approval_status = "approved"
    org.approved_at = datetime.now(UTC)
    org.rejection_reason = None
    audit.record(db, None, "approve", "organization", org.id, f"Organization '{org.name}' approved by platform admin {admin.email}", organization_id=org.id)
    db.commit()
    db.refresh(org)
    _notify_org_admins(
        db,
        org,
        f"{org.name} has been approved",
        f"Your organization {org.name} has been approved. You can now sign in at {settings.frontend_url}/login",
    )
    return _org_detail(db, org)


@router.post("/organizations/{org_id}/reject", response_model=OrgDetail)
def reject_organization(
    org_id: str,
    payload: Optional[RejectOrganizationRequest] = None,
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
):
    """Decline a sign-up. Its users stay locked out; it can be approved later."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    reason = ((payload.reason if payload else None) or "").strip() or None
    org.approval_status = "rejected"
    org.approved_at = None
    org.rejection_reason = reason
    summary = f"Organization '{org.name}' rejected by platform admin {admin.email}" + (f": {reason}" if reason else "")
    audit.record(db, None, "reject", "organization", org.id, summary, organization_id=org.id)
    db.commit()
    db.refresh(org)
    message = f"Your organization {org.name}'s registration was declined."
    if reason:
        message += f"\n\nReason: {reason}"
    _notify_org_admins(db, org, f"{org.name} registration update", message)
    return _org_detail(db, org)


@router.post("/organizations/{org_id}/archive", response_model=OrgDetail)
def archive_organization(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    """Soft delete: hide the org and lock its users out, keeping every row."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    now = datetime.now(UTC)
    if org.deleted_at is None:
        org.deleted_at = now
    org.is_suspended = True
    org.suspended_at = org.suspended_at or now
    org.suspended_reason = ARCHIVED_REASON
    audit.record(db, None, "archive", "organization", org.id, f"Organization '{org.name}' archived by platform admin {admin.email}", organization_id=org.id)
    db.commit()
    db.refresh(org)
    return _org_detail(db, org)


@router.post("/organizations/{org_id}/restore", response_model=OrgDetail)
def restore_organization(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    """Undo an archive: the org reappears and its users can sign in again."""
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    org.deleted_at = None
    org.is_suspended = False
    org.suspended_at = None
    org.suspended_reason = None
    audit.record(db, None, "restore", "organization", org.id, f"Organization '{org.name}' restored by platform admin {admin.email}", organization_id=org.id)
    db.commit()
    db.refresh(org)
    return _org_detail(db, org)


@router.delete("/organizations/{org_id}")
def delete_organization(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    name = org.name
    # Delete via Core so the database's ON DELETE CASCADE removes every
    # org-scoped child row, rather than the ORM trying to null out the
    # (NOT NULL) users.organization_id relationship in Python. Audit rows are
    # intentionally left (they carry no FK) as an immutable trail.
    db.expunge(org)
    db.execute(sa_delete(Organization).where(Organization.id == org_id))
    db.commit()
    return {"message": f"Organization '{name}' and all its data were permanently deleted"}


# --------------------------------------------------------------------------- #
# Users (across all organizations)
# --------------------------------------------------------------------------- #
@router.get("/users", response_model=Page[PlatformUserOut])
def list_users(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    pagination: Pagination = Depends(),
    search: Optional[str] = Query(None, max_length=200),
    organization_id: Optional[str] = Query(None),
):
    stmt = select(User)
    if organization_id:
        stmt = stmt.where(User.organization_id == organization_id)
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(User.name.ilike(s) | User.email.ilike(s))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    users = db.execute(stmt.order_by(User.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    names = _org_name_map(db, [u.organization_id for u in users])
    items = [_user_out(u, names.get(u.organization_id)) for u in users]
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("/users", response_model=PlatformUserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: CreatePlatformUserRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    org = db.get(Organization, payload.organization_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    email = payload.email.lower().strip()
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")
    user = User(
        organization_id=org.id,
        name=payload.name,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.flush()
    audit.record(db, None, "create", "user", user.id, f"User {email} created by platform admin {admin.email}", organization_id=org.id)
    db.commit()
    return _user_out(user, org.name)


def _would_orphan_org(db: Session, user: User) -> bool:
    """True when ``user`` is the only active admin of their organization, so
    moving, demoting, deactivating or deleting them would leave nobody able to
    run it."""
    if user.role != "admin" or not user.is_active:
        return False
    others = db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.organization_id == user.organization_id, User.role == "admin", User.is_active.is_(True), User.id != user.id)
    )
    return not others


_ORPHAN_MSG = "This is the organization's only active admin. Add another admin before moving, demoting, deactivating or deleting them."


@router.patch("/users/{user_id}", response_model=PlatformUserOut)
def update_user(user_id: str, payload: UpdatePlatformUserRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    data = payload.model_dump(exclude_unset=True)

    source_org_id = user.organization_id
    target_org_id = data.get("organization_id") or source_org_id
    moving = target_org_id != source_org_id
    new_org = None
    if moving:
        new_org = db.get(Organization, target_org_id)
        if new_org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Target organization not found")
        if user.role == "employee":
            # An employee login is tied to an Employee record in its own org.
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Employee portal users can't be moved. Invite them from the new organization instead.")
    new_role = data.get("role") or user.role
    new_active = data["is_active"] if data.get("is_active") is not None else user.is_active
    still_admin_here = new_role == "admin" and new_active and not moving
    if not still_admin_here and _would_orphan_org(db, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _ORPHAN_MSG)

    if data.get("name"):
        user.name = data["name"].strip()
    if data.get("email"):
        clean_email = data["email"].strip().lower()
        if clean_email != user.email:
            existing = db.execute(select(User).where(User.email == clean_email, User.id != user.id)).scalar_one_or_none()
            if existing:
                raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email address already exists")
            user.email = clean_email
    if data.get("role"):
        user.role = data["role"]
    if data.get("is_active") is not None:
        user.is_active = data["is_active"]
    summary = f"User {user.email} updated by platform admin {admin.email}"
    if moving:
        source = db.get(Organization, source_org_id)
        user.organization_id = new_org.id
        # Sign them out everywhere: a live session must not carry into the new org.
        now = datetime.now(UTC)
        for tok in db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))).scalars():
            tok.revoked_at = now
        summary += f" (moved from {source.name if source else source_org_id} to {new_org.name})"
        audit.record(db, None, "update", "user", user.id, summary, organization_id=source_org_id)
    org = db.get(Organization, user.organization_id)
    audit.record(db, None, "update", "user", user.id, summary, organization_id=user.organization_id)
    db.commit()
    return _user_out(user, org.name if org else None)


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: str, payload: ResetUserPasswordRequest, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.password_hash = hash_password(payload.new_password)
    audit.record(db, None, "update", "user", user.id, f"Password reset by platform admin {admin.email}", organization_id=user.organization_id)
    db.commit()
    return {"message": "Password reset"}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if _would_orphan_org(db, user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _ORPHAN_MSG)
    email = user.email
    org_id = user.organization_id
    db.delete(user)
    audit.record(db, None, "delete", "user", user_id, f"User {email} deleted by platform admin {admin.email}", organization_id=org_id)
    db.commit()
    return {"message": f"User {email} deleted"}


@router.get("/users/export")
def export_users(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    search: Optional[str] = Query(None, max_length=200),
    organization_id: Optional[str] = Query(None),
):
    # Same query/joins as list_users, without pagination.
    stmt = select(User)
    if organization_id:
        stmt = stmt.where(User.organization_id == organization_id)
    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(User.name.ilike(s) | User.email.ilike(s))
    users = db.execute(stmt.order_by(User.created_at.desc())).scalars().all()
    names = _org_name_map(db, [u.organization_id for u in users])
    rows = [
        [
            u.name,
            u.email,
            u.role,
            "Yes" if u.is_active else "No",
            names.get(u.organization_id) or "",
            u.created_at.isoformat() if u.created_at else "",
        ]
        for u in users
    ]
    return _csv_response(["Name", "Email", "Role", "Active", "Organization", "Created"], rows, "users.csv")


@router.post("/users/{user_id}/impersonate", response_model=ImpersonateResponse)
def impersonate_user(user_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    """Mint a short-lived tenant access token for a support "view as" session.

    Deliberately non-renewable: no refresh cookie is set, so the session ends
    when the access token expires and cannot be silently extended.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.role not in ("admin", "staff", "viewer"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This user's role cannot be impersonated")
    org = db.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    if org.is_suspended:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot impersonate a user in a suspended organization")
    if not org.is_approved:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot impersonate a user in an organization that is not approved")
    token = create_access_token(user.id, user.organization_id, user.role, impersonator=admin.email)
    audit.record(
        db,
        None,
        "impersonate",
        "user",
        user.id,
        f"Platform admin {admin.email} impersonated {user.email}",
        organization_id=user.organization_id,
    )
    db.commit()
    return ImpersonateResponse(
        access_token=token,
        user=_user_out(user, org.name),
        organization=ImpersonateOrg(id=org.id, name=org.name),
    )


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #
@router.get("/search", response_model=PlatformSearchResults)
def platform_search(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    q: str = Query("", max_length=200),
):
    term = q.strip()
    if not term:
        return PlatformSearchResults(organizations=[], users=[])
    like = f"%{term}%"

    orgs = db.execute(
        select(Organization).where(Organization.name.ilike(like)).order_by(Organization.created_at.desc()).limit(10)
    ).scalars().all()
    # Archived orgs are included here (flagged isArchived) so they stay findable.
    org_out = _org_summaries(db, orgs)

    users = db.execute(
        select(User).where(User.name.ilike(like) | User.email.ilike(like)).order_by(User.created_at.desc()).limit(10)
    ).scalars().all()
    names = _org_name_map(db, [u.organization_id for u in users])
    user_out = [_user_out(u, names.get(u.organization_id)) for u in users]

    return PlatformSearchResults(organizations=org_out, users=user_out)


# --------------------------------------------------------------------------- #
# Platform settings (runtime toggles)
# --------------------------------------------------------------------------- #
def _settings_out(db: Session) -> PlatformSettingsOut:
    defaults = platform_settings.get_org_defaults(db)
    return PlatformSettingsOut(
        allow_public_signup=platform_settings.get_bool(db, ALLOW_PUBLIC_SIGNUP_KEY, settings.allow_public_signup),
        require_org_approval=platform_settings.require_org_approval(db),
        environment=settings.environment,
        razorpay_configured=settings.razorpay_configured,
        smtp_configured=settings.smtp_configured,
        default_tax_rate=_float(defaults.tax_rate),
        default_payment_terms_days=defaults.payment_terms_days,
        default_currency=defaults.currency,
    )


@router.get("/settings", response_model=PlatformSettingsOut)
def get_platform_settings(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    return _settings_out(db)


@router.put("/settings", response_model=PlatformSettingsOut)
def update_platform_settings(
    payload: UpdatePlatformSettingsRequest,
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
):
    data = payload.model_dump(exclude_unset=True)
    if "allow_public_signup" in data and data["allow_public_signup"] is not None:
        platform_settings.set_bool(db, ALLOW_PUBLIC_SIGNUP_KEY, data["allow_public_signup"])
        audit.record(
            db,
            None,
            "update",
            "platform_setting",
            ALLOW_PUBLIC_SIGNUP_KEY,
            f"Public signup set to {data['allow_public_signup']} by platform admin {admin.email}",
        )
    if "require_org_approval" in data and data["require_org_approval"] is not None:
        platform_settings.set_bool(db, platform_settings.REQUIRE_ORG_APPROVAL_KEY, data["require_org_approval"])
        audit.record(
            db,
            None,
            "update",
            "platform_setting",
            platform_settings.REQUIRE_ORG_APPROVAL_KEY,
            f"Organization approval requirement set to {data['require_org_approval']} by platform admin {admin.email}",
        )
    defaults = {
        "default_tax_rate": (platform_settings.DEFAULT_TAX_RATE_KEY, "Default tax rate"),
        "default_payment_terms_days": (platform_settings.DEFAULT_PAYMENT_TERMS_DAYS_KEY, "Default payment terms (days)"),
        "default_currency": (platform_settings.DEFAULT_CURRENCY_KEY, "Default currency"),
    }
    for field, (key, label) in defaults.items():
        if field in data:
            platform_settings.set_value(db, key, str(data[field]))
            audit.record(db, None, "update", "platform_setting", key, f"{label} set to {data[field]} by platform admin {admin.email}")
    db.commit()
    return _settings_out(db)


@router.get("/audit-logs", response_model=Page[PlatformAuditOut])
def list_audit_logs(
    db: Session = Depends(get_db),
    admin: PlatformAdmin = Depends(get_current_superuser),
    pagination: Pagination = Depends(),
    organization_id: Optional[str] = Query(None),
):
    stmt = select(AuditLog)
    if organization_id:
        stmt = stmt.where(AuditLog.organization_id == organization_id)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.order_by(AuditLog.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    names = _org_name_map(db, [a.organization_id for a in rows if a.organization_id])
    items = [
        PlatformAuditOut(
            id=a.id,
            organization_id=a.organization_id,
            organization_name=names.get(a.organization_id),
            user_name=a.user_name,
            action=a.action,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            summary=a.summary,
            created_at=a.created_at,
        )
        for a in rows
    ]
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)
