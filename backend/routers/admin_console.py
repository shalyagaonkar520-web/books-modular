"""The Admin console: everything an organization's admins manage, inside the app.

Open to the organization's own admins (role ``admin``) - the person who
created the organization is its first admin. Users, roles, the organization
profile and the activity log use the shared tenant endpoints
(routers/organization.py); this router adds the console's own pages: the
overview, one user's overview and edit access, app content, the change log
(every change with old and new values), sign-in history and sessions.
Reviewers' pages and Support (open to every role) are in reviews.py and
support.py.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_console_admin
from backend.models import AuditLog, ChangeLog, Employee, LoginEvent, Organization, RefreshToken, User
from backend.schemas.app_content import AppContent, AppContentOverrides, OrgAppContentOut, PanelContentAccessOut
from backend.schemas.auth import AuditLogOut, UserOut
from backend.schemas.common import APIModel, Message, Page
from backend.services import audit, module_pricing, panel_content, subscription
from backend.services import user_overview as user_overview_service
from backend.services.app_content import get_app_content, get_org_app_content, get_org_overrides
from backend.services.tenancy import Pagination
from backend.services.user_overview import UserOverviewOut

router = APIRouter(prefix="/api/admin", tags=["Admin console"])


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
def dashboard(admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    org_id = admin.organization_id
    org = db.get(Organization, org_id)
    now = datetime.now(UTC)
    month_ago, week_ago = now - timedelta(days=30), now - timedelta(days=7)

    users = (
        db.execute(select(User).where(User.organization_id == org_id, User.role != "integration").order_by(User.created_at.desc()))
        .scalars()
        .all()
    )
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
# One user: overview and edit access
# --------------------------------------------------------------------------- #
@router.get("/users/{user_id}/overview", response_model=UserOverviewOut)
def user_overview(user_id: str, admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    """Everything about one user: profile, employee record, performance, pending work and recent activity."""
    return user_overview_service.user_overview(db, admin.organization_id, user_id)


class ModuleAccessUpdate(APIModel):
    # None = every module of the plan (no restriction).
    modules: Optional[List[str]] = None


@router.put("/users/{user_id}/module-access", response_model=UserOut)
def set_module_access(
    user_id: str,
    payload: ModuleAccessUpdate,
    admin: User = Depends(require_console_admin),
    db: Session = Depends(get_db),
):
    """Choose which modules a staff user may edit - only modules of the organization's plan."""
    target = db.get(User, user_id)
    if target is None or target.organization_id != admin.organization_id or target.role == "integration":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.role in ("admin", "viewer", "employee", "reviewer"):
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


# --------------------------------------------------------------------------- #
# App content: only the parts the platform admin lets this organization edit
# --------------------------------------------------------------------------- #
def _content_out(db: Session, org: Organization) -> OrgAppContentOut:
    overrides = get_org_overrides(db, org.id)
    return OrgAppContentOut(
        organization_id=org.id,
        organization_name=org.name,
        content=get_org_app_content(db, org.id),
        shared=get_app_content(db),
        overridden=AppContentOverrides(
            branding=sorted(overrides["branding"]),
            modules=sorted(overrides["modules"]),
            texts=sorted(overrides["texts"]),
        ),
        editable=PanelContentAccessOut(**panel_content.access_out(org)),
    )


@router.get("/app-content", response_model=OrgAppContentOut)
def read_app_content(admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    return _content_out(db, db.get(Organization, admin.organization_id))


@router.put("/app-content", response_model=OrgAppContentOut)
def update_app_content(payload: AppContent, admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, admin.organization_id)
    overrides = panel_content.save_for_panel(db, org, payload)
    count = sum(len(v) for v in overrides.values())
    audit.record(db, admin, "update", "app_content", org.id, f"App content customized ({count} field(s))")
    db.commit()
    return _content_out(db, org)


@router.post("/app-content/reset", response_model=OrgAppContentOut)
def reset_app_content(admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, admin.organization_id)
    panel_content.reset_for_panel(db, org)
    audit.record(db, admin, "update", "app_content", org.id, "Editable app content reset to the shared content")
    db.commit()
    return _content_out(db, org)


# --------------------------------------------------------------------------- #
# Change log: every saved change, field by field
# --------------------------------------------------------------------------- #
class ChangeLogOut(APIModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_role: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    entity_label: Optional[str] = None
    changes: Dict[str, list]
    created_at: datetime
    review_status: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None


def change_out(row: ChangeLog) -> ChangeLogOut:
    try:
        changes = json.loads(row.changes or "{}")
    except ValueError:
        changes = {}
    return ChangeLogOut(
        id=row.id,
        user_id=row.user_id,
        user_name=row.user_name,
        user_role=row.user_role,
        action=row.action,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        entity_label=row.entity_label,
        changes=changes if isinstance(changes, dict) else {},
        created_at=row.created_at,
        review_status=row.review_status,
        reviewed_by_name=row.reviewed_by_name,
        reviewed_at=row.reviewed_at,
        review_note=row.review_note,
    )


def change_page(db: Session, stmt, pagination: Pagination) -> Page[ChangeLogOut]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.order_by(ChangeLog.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    return Page(items=[change_out(r) for r in rows], total=total, page=pagination.page, page_size=pagination.page_size)


def filter_changes(
    stmt,
    user_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    if user_id:
        stmt = stmt.where(ChangeLog.user_id == user_id)
    if entity_type:
        stmt = stmt.where(ChangeLog.entity_type == entity_type)
    if action in ("create", "update", "delete"):
        stmt = stmt.where(ChangeLog.action == action)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(ChangeLog.entity_label.ilike(like) | ChangeLog.changes.ilike(like) | ChangeLog.user_name.ilike(like))
    if date_from:
        stmt = stmt.where(ChangeLog.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
    if date_to:
        stmt = stmt.where(ChangeLog.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=UTC))
    return stmt


@router.get("/changes", response_model=Page[ChangeLogOut])
def list_changes(
    user_id: Optional[str] = Query(None, max_length=32),
    entity_type: Optional[str] = Query(None, max_length=60),
    action: Optional[str] = Query(None, max_length=10),
    search: Optional[str] = Query(None, max_length=100),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    pagination: Pagination = Depends(),
    admin: User = Depends(require_console_admin),
    db: Session = Depends(get_db),
):
    """Every change in the organization, newest first: who, when, which record, each field's old and new value."""
    stmt = select(ChangeLog).where(ChangeLog.organization_id == admin.organization_id)
    return change_page(db, filter_changes(stmt, user_id, entity_type, action, search, date_from, date_to), pagination)


@router.get("/changes/types", response_model=List[str])
def change_types(admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    """The kinds of record that have changes, for the filter."""
    rows = db.execute(select(ChangeLog.entity_type).where(ChangeLog.organization_id == admin.organization_id).distinct()).scalars()
    return sorted(rows)


@router.get("/changes/{entity_type}/{entity_id}", response_model=List[ChangeLogOut])
def record_history(entity_type: str, entity_id: str, admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    """The full history of one record, oldest first."""
    rows = db.execute(
        select(ChangeLog)
        .where(ChangeLog.organization_id == admin.organization_id, ChangeLog.entity_type == entity_type, ChangeLog.entity_id == entity_id)
        .order_by(ChangeLog.created_at)
    ).scalars()
    return [change_out(r) for r in rows]


# --------------------------------------------------------------------------- #
# Security: sign-in history and signed-in sessions
# --------------------------------------------------------------------------- #
class LoginEventOut(APIModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    email: str
    success: bool
    reason: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class SessionOut(APIModel):
    id: str
    user_id: str
    user_name: str
    user_email: str
    user_role: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime
    expires_at: datetime


class SecuritySummary(APIModel):
    sign_ins_today: int
    failed_today: int
    failed_last_7_days: int
    signed_in_sessions: int
    users_signed_in: int


def _today_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _org_users(db: Session, org_id: str) -> Dict[str, User]:
    rows = db.execute(select(User).where(User.organization_id == org_id, User.role != "integration")).scalars()
    return {u.id: u for u in rows}


def _live_sessions(db: Session, org_id: str):
    users = _org_users(db, org_id)
    if not users:
        return users, []
    rows = (
        db.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id.in_(list(users)), RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > datetime.now(UTC))
            .order_by(RefreshToken.created_at.desc())
        )
        .scalars()
        .all()
    )
    return users, rows


@router.get("/security/summary", response_model=SecuritySummary)
def security_summary(admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    org_id = admin.organization_id
    today = _today_start()

    def count(*conds) -> int:
        return db.scalar(select(func.count()).select_from(LoginEvent).where(LoginEvent.organization_id == org_id, *conds)) or 0

    _, sessions = _live_sessions(db, org_id)
    return SecuritySummary(
        sign_ins_today=count(LoginEvent.success.is_(True), LoginEvent.created_at >= today),
        failed_today=count(LoginEvent.success.is_(False), LoginEvent.created_at >= today),
        failed_last_7_days=count(LoginEvent.success.is_(False), LoginEvent.created_at >= datetime.now(UTC) - timedelta(days=7)),
        signed_in_sessions=len(sessions),
        users_signed_in=len({s.user_id for s in sessions}),
    )


@router.get("/security/logins", response_model=Page[LoginEventOut])
def login_history(
    user_id: Optional[str] = Query(None, max_length=32),
    failed_only: bool = False,
    pagination: Pagination = Depends(),
    admin: User = Depends(require_console_admin),
    db: Session = Depends(get_db),
):
    """Every sign-in attempt to the organization's accounts, newest first."""
    stmt = select(LoginEvent).where(LoginEvent.organization_id == admin.organization_id)
    if user_id:
        stmt = stmt.where(LoginEvent.user_id == user_id)
    if failed_only:
        stmt = stmt.where(LoginEvent.success.is_(False))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.order_by(LoginEvent.created_at.desc()).offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    users = _org_users(db, admin.organization_id)
    items = [
        LoginEventOut(
            id=r.id,
            user_id=r.user_id,
            user_name=users[r.user_id].name if r.user_id in users else None,
            email=r.email,
            success=r.success,
            reason=r.reason,
            ip_address=r.ip_address,
            user_agent=r.user_agent,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return Page(items=items, total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/security/sessions", response_model=List[SessionOut])
def list_sessions(admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    """Who is signed in right now, and on which device."""
    users, rows = _live_sessions(db, admin.organization_id)
    return [
        SessionOut(
            id=t.id,
            user_id=t.user_id,
            user_name=users[t.user_id].name,
            user_email=users[t.user_id].email,
            user_role=users[t.user_id].role,
            ip_address=t.ip_address,
            user_agent=t.user_agent,
            created_at=t.created_at,
            expires_at=t.expires_at,
        )
        for t in rows
    ]


@router.post("/security/sessions/{session_id}/revoke", response_model=Message)
def revoke_session(session_id: str, admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    """Sign one device out."""
    token = db.get(RefreshToken, session_id)
    target = db.get(User, token.user_id) if token else None
    if token is None or target is None or target.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    token.revoked_at = datetime.now(UTC)
    audit.record(db, admin, "security", "user", target.id, f"Signed {target.email} out of one device")
    db.commit()
    return Message(message=f"{target.name} is signed out of that device.")


@router.post("/security/users/{user_id}/sign-out", response_model=Message)
def sign_out_everywhere(user_id: str, admin: User = Depends(require_console_admin), db: Session = Depends(get_db)):
    """Sign a user out of every device at once (their open pages stop working too)."""
    target = db.get(User, user_id)
    if target is None or target.organization_id != admin.organization_id or target.role == "integration":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    now = datetime.now(UTC)
    for token in db.execute(select(RefreshToken).where(RefreshToken.user_id == target.id, RefreshToken.revoked_at.is_(None))).scalars():
        token.revoked_at = now
    target.sessions_revoked_at = now
    audit.record(db, admin, "security", "user", target.id, f"Signed {target.email} out of every device")
    db.commit()
    return Message(message=f"{target.name} is signed out everywhere.")
