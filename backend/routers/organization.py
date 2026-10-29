"""Organization profile, user management, audit log."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_admin
from backend.models import AuditLog, Employee, Organization, PayRun, Payslip, Project, TimeEntry, User
from backend.schemas.auth import (
    AdminResetPasswordRequest,
    AuditLogOut,
    InviteUserRequest,
    OrganizationOut,
    OrganizationUpdate,
    UpdateUserRequest,
    UserDashboardOut,
    UserOut,
    UserStats,
)
from backend.schemas.common import Message, Page
from backend.schemas.documents_flow import LockDateOut, LockDateUpdate
from backend.services import audit, data_export, export_service, org_roles, org_users, permissions, subscription
from backend.services.tenancy import Pagination

router = APIRouter(prefix="/api", tags=["Organization"])


@router.get("/organization", response_model=OrganizationOut)
def get_organization(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return org_users.get_organization(db, user.organization_id)


@router.put("/organization", response_model=OrganizationOut)
def update_organization(payload: OrganizationUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_users.update_organization(db, user.organization_id, user, payload)


@router.get("/organization/lock-date", response_model=LockDateOut)
def get_lock_date(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return LockDateOut(lock_date=db.get(Organization, user.organization_id).lock_date)


@router.put("/organization/lock-date", response_model=LockDateOut)
def set_lock_date(payload: LockDateUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Close the books up to a date (inclusive), or reopen them with null.

    Nothing dated on or before it can then be posted, edited, voided or
    deleted - the usual step after filing a GST return or closing a year.
    """
    if payload.lock_date and payload.lock_date >= date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The lock date must be in the past")
    org = db.get(Organization, user.organization_id)
    previous = org.lock_date
    org.lock_date = payload.lock_date
    summary = f"Books locked up to {payload.lock_date.isoformat()}" if payload.lock_date else "Books lock removed"
    audit.record(db, user, "update", "organization", org.id, f"{summary} (was {previous.isoformat() if previous else 'unlocked'})")
    db.commit()
    return LockDateOut(lock_date=org.lock_date)


@router.get("/organization/export")
def export_all(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Every record of the organization as one Excel workbook (admins only)."""
    return _export_response(db, user.organization_id, user)


def _export_response(db: Session, org_id: str, actor) -> Response:
    content, filename = data_export.export_workbook(db, org_id)
    audit.record(db, actor, "export", "organization", org_id, "Exported all books (Excel)", organization_id=org_id)
    db.commit()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/roles/catalog")
def role_catalog(user: User = Depends(require_admin)):
    """Every feature a custom role can give No access / View / Edit on, grouped."""
    return permissions.catalog()


@router.get("/roles", response_model=List[org_roles.RoleOut])
def list_roles(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_roles.list_roles(db, user.organization_id)


@router.post("/roles", response_model=org_roles.RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(payload: org_roles.RoleIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_roles.create_role(db, user.organization_id, user, payload)


@router.put("/roles/{role_id}", response_model=org_roles.RoleOut)
def update_role(role_id: str, payload: org_roles.RoleIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_roles.update_role(db, user.organization_id, user, role_id, payload)


@router.delete("/roles/{role_id}", response_model=Message)
def delete_role(role_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org_roles.delete_role(db, user.organization_id, user, role_id)
    return Message(message="Role deleted")


@router.get("/plan-modules")
def plan_modules(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Modules of the organization's accepted plan (null = every module: trial or no plan)."""
    plan = subscription.paid_modules(db.get(Organization, user.organization_id))
    return {"planModules": sorted(plan) if plan is not None else None}


@router.get("/users", response_model=List[UserOut])
def list_users(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    # Admin-only: the web app lists users only in Settings > Users and in the
    # admin's "log time for" picker, and the list carries every login email.
    return org_users.list_users(db, user.organization_id)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def invite_user(payload: InviteUserRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_users.invite_user(db, user.organization_id, user, payload)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, payload: UpdateUserRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_users.update_user(db, user.organization_id, user, user_id, payload)


@router.delete("/users/{user_id}", response_model=Message)
def delete_user(user_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return org_users.delete_user(db, user.organization_id, user, user_id)


@router.post("/users/{user_id}/reset-password", response_model=Message)
def reset_password(
    user_id: str,
    payload: AdminResetPasswordRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # JSON body, not a query string, so the password stays out of access logs;
    # and the same strength rules as sign-up and change-password apply.
    return org_users.reset_user_password(db, user.organization_id, user, user_id, payload)


@router.get("/users/{user_id}/dashboard", response_model=UserDashboardOut)
def get_user_dashboard(
    user_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from backend.routers.payroll import employee_out, payslip_out
    from backend.routers.projects import entry_out

    target = db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id or target.role == "integration":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    employee = (
        db.execute(
            select(Employee).where(
                Employee.organization_id == user.organization_id,
                (Employee.user_id == target.id) | (Employee.email == target.email),
            )
        )
        .scalars()
        .first()
    )

    emp_data = employee_out(employee).model_dump() if employee else None

    payslips_data = []
    if employee:
        stmt = (
            select(Payslip)
            .join(PayRun, PayRun.id == Payslip.pay_run_id)
            .where(Payslip.employee_id == employee.id)
            .options(selectinload(Payslip.employee), selectinload(Payslip.pay_run))
            .order_by(PayRun.period_year.desc(), PayRun.period_month.desc())
        )
        payslips = db.execute(stmt).scalars().all()
        payslips_data = [payslip_out(p).model_dump() for p in payslips]

    time_stmt = (
        select(TimeEntry)
        .where(TimeEntry.organization_id == user.organization_id, TimeEntry.user_id == target.id)
        .options(selectinload(TimeEntry.project).selectinload(Project.customer), selectinload(TimeEntry.user))
        .order_by(TimeEntry.date.desc(), TimeEntry.created_at.desc())
    )
    time_entries = db.execute(time_stmt).scalars().all()
    time_data = [entry_out(t).model_dump() for t in time_entries]

    audit_stmt = (
        select(AuditLog)
        .where(
            AuditLog.organization_id == user.organization_id,
            (AuditLog.user_id == target.id) | (AuditLog.user_name == target.name),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    )
    audit_logs = db.execute(audit_stmt).scalars().all()

    total_hours = sum(float(t.hours or 0) for t in time_entries)
    last_act = target.last_login_at or (audit_logs[0].created_at if audit_logs else None)

    return UserDashboardOut(
        user=UserOut.model_validate(target),
        employee=emp_data,
        payslips=payslips_data,
        time_entries=time_data,
        audit_logs=[AuditLogOut.model_validate(a) for a in audit_logs],
        stats=UserStats(
            total_actions=len(audit_logs),
            total_hours_logged=round(total_hours, 2),
            total_payslips=len(payslips_data),
            last_active=last_act,
        ),
    )


@router.get("/users/{user_id}/pdf")
def export_user_dashboard_pdf(
    user_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id or target.role == "integration":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    employee = (
        db.execute(
            select(Employee).where(
                Employee.organization_id == user.organization_id,
                (Employee.user_id == target.id) | (Employee.email == target.email),
            )
        )
        .scalars()
        .first()
    )

    payslips = []
    if employee:
        stmt = (
            select(Payslip)
            .join(PayRun, PayRun.id == Payslip.pay_run_id)
            .where(Payslip.employee_id == employee.id)
            .options(selectinload(Payslip.employee), selectinload(Payslip.pay_run))
            .order_by(PayRun.period_year.desc(), PayRun.period_month.desc())
        )
        payslips = db.execute(stmt).scalars().all()

    time_stmt = (
        select(TimeEntry)
        .where(TimeEntry.organization_id == user.organization_id, TimeEntry.user_id == target.id)
        .options(selectinload(TimeEntry.project).selectinload(Project.customer), selectinload(TimeEntry.user))
        .order_by(TimeEntry.date.desc(), TimeEntry.created_at.desc())
    )
    time_entries = db.execute(time_stmt).scalars().all()

    audit_stmt = (
        select(AuditLog)
        .where(
            AuditLog.organization_id == user.organization_id,
            (AuditLog.user_id == target.id) | (AuditLog.user_name == target.name),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(30)
    )
    audit_logs = db.execute(audit_stmt).scalars().all()

    pdf_bytes = export_service.generate_user_dashboard_pdf(
        target_user=target,
        org=user.organization,
        employee=employee,
        payslips=payslips,
        time_entries=time_entries,
        audit_logs=audit_logs,
    )
    safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in target.name)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="User_{safe_name}_Dashboard.pdf"'},
    )


@router.get("/audit-logs", response_model=Page[AuditLogOut])
def audit_logs(
    entity_type: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return org_users.audit_log_page(db, user.organization_id, entity_type, pagination)


# Outbound email (SMTP) is platform-wide: managed by the platform admin
# (routers/platform_email.py), never by an organization's admin.
