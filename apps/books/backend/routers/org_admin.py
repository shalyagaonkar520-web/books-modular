"""The organization admin panel: an organization's panel admins see a
dashboard of its users and employees, manage its users (roles, deactivation,
removal) and its profile (GST etc.), and read its full activity log.

Panel admins (``OrgPanelAdmin``) are separate logins, created only by a
platform admin, with their own token type - tenant users (even tenant admins)
and platform admins cannot use this API, and a panel login cannot use the
tenant app or the platform API. Everything here is scoped to the panel admin's
own organization.

``auth_router`` (login / refresh / logout / change-password) is open so a
panel admin can sign in; ``router`` is guarded by
``get_current_org_panel_admin`` in main.py. User management, the organization
profile and the activity log share their logic with the tenant endpoints in
``organization.py`` (see ``services/org_users.py``). Outbound e-mail (SMTP)
settings are platform-wide and deliberately not exposed here.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_org_panel_admin, org_panel_access_error
from backend.models import AuditLog, Employee, Organization, OrgPanelAdmin, OrgPanelRefreshToken, User
from backend.schemas.auth import (
    AdminResetPasswordRequest,
    AuditLogOut,
    InviteUserRequest,
    OrganizationOut,
    OrganizationUpdate,
    UpdateUserRequest,
    UserOut,
)
from backend.schemas.common import APIModel, Message, Page
from backend.schemas.org_admin import (
    ChangeOrgPanelPasswordRequest,
    OrgPanelAdminProfile,
    OrgPanelLoginRequest,
    OrgPanelMeOut,
    OrgPanelOrgRef,
    OrgPanelTokenResponse,
)
from backend.security import (
    create_org_panel_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from backend.services import audit, module_pricing, org_users, subscription
from backend.services import user_overview as user_overview_service
from backend.services.ratelimit import RateLimiter, client_ip
from backend.services.tenancy import Pagination
from backend.services.user_overview import UserOverviewOut

settings = get_settings()

auth_router = APIRouter(prefix="/api/org-admin/auth", tags=["Organization admin auth"])
router = APIRouter(prefix="/api/org-admin", tags=["Organization admin"])

ORG_PANEL_REFRESH_COOKIE = "rb_org_panel_refresh"
_REFRESH_COOKIE_PATH = "/api/org-admin/auth"
_login_limiter = RateLimiter(settings.login_rate_limit_per_minute)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
def _me_out(admin: OrgPanelAdmin, org: Organization) -> OrgPanelMeOut:
    return OrgPanelMeOut(admin=OrgPanelAdminProfile.model_validate(admin), organization=OrgPanelOrgRef(id=org.id, name=org.name))


def _token_response(admin: OrgPanelAdmin, org: Organization, access: str) -> OrgPanelTokenResponse:
    me = _me_out(admin, org)
    return OrgPanelTokenResponse(access_token=access, admin=me.admin, organization=me.organization)


def _check_org_open(db: Session, admin: OrgPanelAdmin) -> Organization:
    """The admin's organization, or a 403 when its panel is closed."""
    org = db.get(Organization, admin.organization_id)
    if org is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    error = org_panel_access_error(org)
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)
    return org


def _issue_tokens(db: Session, admin: OrgPanelAdmin, response: Response, request: Request) -> str:
    access = create_org_panel_access_token(admin.id, admin.organization_id)
    raw_refresh = generate_refresh_token()
    db.add(
        OrgPanelRefreshToken(
            admin_id=admin.id,
            token_hash=hash_token(raw_refresh),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            user_agent=(request.headers.get("user-agent") or "")[:255],
            ip_address=client_ip(request)[:64],
        )
    )
    response.set_cookie(
        key=ORG_PANEL_REFRESH_COOKIE,
        value=raw_refresh,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=_REFRESH_COOKIE_PATH,
        domain=settings.cookie_domain,
    )
    return access


@auth_router.post("/login", response_model=OrgPanelTokenResponse)
def org_panel_login(payload: OrgPanelLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    _login_limiter.check(f"org-panel-login:{client_ip(request)}")
    email = payload.email.lower().strip()
    admin = db.execute(select(OrgPanelAdmin).where(OrgPanelAdmin.email == email)).scalar_one_or_none()
    # Constant-ish work whether or not the account exists, to blunt enumeration.
    ok = bool(admin) and admin.is_active and verify_password(payload.password, admin.password_hash)
    if not ok:
        # Burn a hash even on unknown email so timing does not leak existence.
        if not admin:
            verify_password(payload.password, hash_password("dummy-not-a-real-hash"))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    org = _check_org_open(db, admin)
    admin.last_login_at = datetime.now(UTC)
    access = _issue_tokens(db, admin, response, request)
    db.commit()
    return _token_response(admin, org, access)


@auth_router.post("/refresh", response_model=OrgPanelTokenResponse)
def org_panel_refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(ORG_PANEL_REFRESH_COOKIE)
    if not raw:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    token = db.execute(select(OrgPanelRefreshToken).where(OrgPanelRefreshToken.token_hash == hash_token(raw))).scalar_one_or_none()
    now = datetime.now(UTC)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    exp = token.expires_at.replace(tzinfo=UTC) if token.expires_at.tzinfo is None else token.expires_at
    if token.revoked_at is not None or exp < now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")
    admin = db.get(OrgPanelAdmin, token.admin_id)
    if not admin or not admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Administrator is inactive")
    org = _check_org_open(db, admin)
    token.revoked_at = now  # rotate
    access = _issue_tokens(db, admin, response, request)
    db.commit()
    return _token_response(admin, org, access)


@auth_router.post("/logout", response_model=Message)
def org_panel_logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(ORG_PANEL_REFRESH_COOKIE)
    if raw:
        token = db.execute(select(OrgPanelRefreshToken).where(OrgPanelRefreshToken.token_hash == hash_token(raw))).scalar_one_or_none()
        if token and token.revoked_at is None:
            token.revoked_at = datetime.now(UTC)
            db.commit()
    response.delete_cookie(ORG_PANEL_REFRESH_COOKIE, path=_REFRESH_COOKIE_PATH, domain=settings.cookie_domain)
    return Message(message="Signed out")


@auth_router.post("/change-password", response_model=Message)
def org_panel_change_password(
    payload: ChangeOrgPanelPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: OrgPanelAdmin = Depends(get_current_org_panel_admin),
):
    if not verify_password(payload.current_password, admin.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    admin.password_hash = hash_password(payload.new_password)
    # Sign out every other session by revoking their refresh tokens, but keep
    # the one tied to the current cookie so this admin stays logged in here.
    raw = request.cookies.get(ORG_PANEL_REFRESH_COOKIE)
    keep_hash = hash_token(raw) if raw else None
    stmt = select(OrgPanelRefreshToken).where(OrgPanelRefreshToken.admin_id == admin.id, OrgPanelRefreshToken.revoked_at.is_(None))
    now = datetime.now(UTC)
    for tok in db.execute(stmt).scalars().all():
        if keep_hash and tok.token_hash == keep_hash:
            continue
        tok.revoked_at = now
    audit.record(db, admin, "update", "org_panel_admin", admin.id, "Changed own admin-panel password")
    db.commit()
    return Message(message="Password changed")


@router.get("/me", response_model=OrgPanelMeOut)
def org_panel_me(admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    return _me_out(admin, db.get(Organization, admin.organization_id))


# --------------------------------------------------------------------------- #
# Dashboard: who is in the organization
# --------------------------------------------------------------------------- #
RECENT_ROWS = 5
RECENT_ACTIVITY = 10


class OrgAdminUserStats(APIModel):
    total: int
    active: int
    suspended: int
    pending_invites: int
    by_role: Dict[str, int]
    signed_in_last_30_days: int


class OrgAdminEmployeeStats(APIModel):
    total: int
    active: int
    inactive: int
    # Employees who can sign in to the self-service portal.
    with_login: int
    joined_last_30_days: int
    by_department: Dict[str, int]


class OrgAdminEmployeeRow(APIModel):
    # Deliberately no salary, PAN or bank details.
    id: str
    employee_code: str
    name: str
    designation: Optional[str] = None
    department: Optional[str] = None
    date_of_joining: date
    is_active: bool
    has_login: bool


class OrgAdminDashboardOut(APIModel):
    organization_name: str
    users: OrgAdminUserStats
    employees: OrgAdminEmployeeStats
    recent_users: List[UserOut]
    recent_employees: List[OrgAdminEmployeeRow]
    recent_activity: List[AuditLogOut]
    activity_last_7_days: int


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    # SQLite hands back naive datetimes; they are stored in UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


@router.get("/dashboard", response_model=OrgAdminDashboardOut)
def dashboard(admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    org_id = admin.organization_id
    org = db.get(Organization, org_id)
    now = datetime.now(UTC)
    month_ago, week_ago = now - timedelta(days=30), now - timedelta(days=7)

    users = db.execute(select(User).where(User.organization_id == org_id).order_by(User.created_at.desc())).scalars().all()
    user_outs = [UserOut.model_validate(u) for u in users]
    employees = (
        db.execute(select(Employee).where(Employee.organization_id == org_id).order_by(Employee.date_of_joining.desc(), Employee.name))
        .scalars()
        .all()
    )
    activity = (
        db.execute(select(AuditLog).where(AuditLog.organization_id == org_id).order_by(AuditLog.created_at.desc()).limit(RECENT_ACTIVITY))
        .scalars()
        .all()
    )
    week_count = db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.organization_id == org_id, AuditLog.created_at >= week_ago)
    ).scalar_one()
    never = datetime.min.replace(tzinfo=UTC)

    return OrgAdminDashboardOut(
        organization_name=org.name,
        users=OrgAdminUserStats(
            total=len(users),
            active=sum(1 for u in user_outs if u.is_active and not u.pending_invite),
            suspended=sum(1 for u in user_outs if not u.is_active and not u.pending_invite),
            pending_invites=sum(1 for u in user_outs if u.pending_invite),
            by_role=dict(Counter(u.role for u in users)),
            signed_in_last_30_days=sum(1 for u in users if (_aware(u.last_login_at) or never) >= month_ago),
        ),
        employees=OrgAdminEmployeeStats(
            total=len(employees),
            active=sum(1 for e in employees if e.is_active),
            inactive=sum(1 for e in employees if not e.is_active),
            with_login=sum(1 for e in employees if e.user_id),
            joined_last_30_days=sum(1 for e in employees if e.date_of_joining >= month_ago.date()),
            by_department=dict(Counter((e.department or "").strip() or "No department" for e in employees if e.is_active)),
        ),
        recent_users=user_outs[:RECENT_ROWS],
        recent_employees=[
            OrgAdminEmployeeRow(
                id=e.id,
                employee_code=e.employee_code,
                name=e.name,
                designation=e.designation,
                department=e.department,
                date_of_joining=e.date_of_joining,
                is_active=e.is_active,
                has_login=bool(e.user_id),
            )
            for e in employees[:RECENT_ROWS]
        ],
        recent_activity=[AuditLogOut.model_validate(a) for a in activity],
        activity_last_7_days=week_count,
    )


# --------------------------------------------------------------------------- #
# Users, organization profile and activity log (shared with the tenant app)
# --------------------------------------------------------------------------- #
@router.get("/users", response_model=List[UserOut])
def list_users(admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    return org_users.list_users(db, admin.organization_id)


@router.get("/users/{user_id}/overview", response_model=UserOverviewOut)
def user_overview(user_id: str, admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    """Everything about one user: profile, employee record, performance, pending work and recent activity."""
    return user_overview_service.user_overview(db, admin.organization_id, user_id)


class ModuleAccessUpdate(APIModel):
    # None = every module of the plan (no restriction).
    modules: Optional[List[str]] = None


@router.put("/users/{user_id}/module-access", response_model=UserOut)
def set_module_access(
    user_id: str,
    payload: ModuleAccessUpdate,
    admin: OrgPanelAdmin = Depends(get_current_org_panel_admin),
    db: Session = Depends(get_db),
):
    """Choose which modules a staff user may edit - only modules of the organization's plan."""
    target = db.get(User, user_id)
    if target is None or target.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.role in ("admin", "viewer", "employee"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Module access applies to staff users: admins edit every module of the plan, viewers and employees edit none",
        )
    if payload.modules is None:
        target.module_access = None
        summary = "every module of the plan"
    else:
        known = module_pricing.module_keys()
        unknown = sorted(set(payload.modules) - set(known))
        if unknown:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown module(s): {', '.join(unknown)}")
        plan = subscription.paid_modules(db.get(Organization, admin.organization_id))
        outside = sorted(set(payload.modules) - plan) if plan is not None else []
        if outside:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Not in your subscription plan: {', '.join(outside)}")
        chosen = [key for key in known if key in set(payload.modules)]
        target.module_access = json.dumps(chosen)
        summary = ", ".join(chosen) or "no modules"
    audit.record(db, admin, "update", "user", target.id, f"Edit access for {target.email} set to {summary}")
    db.commit()
    db.refresh(target)
    return UserOut.model_validate(target)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def invite_user(payload: InviteUserRequest, admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    return org_users.invite_user(db, admin.organization_id, admin, payload)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str, payload: UpdateUserRequest, admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)
):
    return org_users.update_user(db, admin.organization_id, admin, user_id, payload)


@router.delete("/users/{user_id}", response_model=Message)
def delete_user(user_id: str, admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    return org_users.delete_user(db, admin.organization_id, admin, user_id)


@router.post("/users/{user_id}/reset-password", response_model=Message)
def reset_user_password(
    user_id: str,
    payload: AdminResetPasswordRequest,
    admin: OrgPanelAdmin = Depends(get_current_org_panel_admin),
    db: Session = Depends(get_db),
):
    return org_users.reset_user_password(db, admin.organization_id, admin, user_id, payload)


@router.get("/organization", response_model=OrganizationOut)
def get_organization(admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    return org_users.get_organization(db, admin.organization_id)


@router.put("/organization", response_model=OrganizationOut)
def update_organization(
    payload: OrganizationUpdate, admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)
):
    return org_users.update_organization(db, admin.organization_id, admin, payload)


# --------------------------------------------------------------------------- #
# Integrations: Razorpay status and sync for this organization. The keys are
# platform-wide and managed only by the platform super-admin.
# --------------------------------------------------------------------------- #
class RazorpaySyncIn(APIModel):
    full: bool = False


@router.get("/integrations/razorpay")
def razorpay_status(admin: OrgPanelAdmin = Depends(get_current_org_panel_admin), db: Session = Depends(get_db)):
    from backend.routers.razorpay import integration_status_payload

    return integration_status_payload(db, admin.organization_id)


@router.post("/integrations/razorpay/sync")
def razorpay_sync_now(
    payload: Optional[RazorpaySyncIn] = None,
    admin: OrgPanelAdmin = Depends(get_current_org_panel_admin),
    db: Session = Depends(get_db),
):
    from backend.routers.razorpay import run_sync_for_org

    result = run_sync_for_org(db, admin.organization_id, full=bool(payload and payload.full), user_id=None)
    audit.record(db, admin, "sync", "integration", "razorpay", f"Razorpay sync run from the admin panel: {result['message']}")
    db.commit()
    return result


@router.get("/audit-logs", response_model=Page[AuditLogOut])
def audit_logs(
    entity_type: Optional[str] = None,
    pagination: Pagination = Depends(),
    admin: OrgPanelAdmin = Depends(get_current_org_panel_admin),
    db: Session = Depends(get_db),
):
    """The organization's full activity log, newest first (optionally one entity type)."""
    return org_users.audit_log_page(db, admin.organization_id, entity_type, pagination)
