"""Organization profile, user management, audit log."""
from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_admin
from backend.models import AuditLog, Employee, PayRun, Payslip, Project, TimeEntry, User
from backend.schemas.auth import (
    AuditLogOut,
    InviteUserRequest,
    OrganizationOut,
    OrganizationUpdate,
    SmtpSettingsOut,
    SmtpSettingsUpdate,
    SmtpTestRequest,
    UpdateUserRequest,
    UserDashboardOut,
    UserOut,
    UserStats,
)
from backend.schemas.common import Message, Page
from backend.security import hash_password, hash_token
from backend.services import audit, export_service
from backend.services.email_service import (
    send_invite_email,
    send_test_email,
    smtp_configured,
    verify_smtp_credentials,
)
from backend.services.env_config import update_env_values
from backend.services.tenancy import Pagination, get_or_404, paginate

settings = get_settings()

# How long an invite link stays valid before the admin has to resend it.
INVITE_TOKEN_EXPIRE_DAYS = 7

router = APIRouter(prefix="/api", tags=["Organization"])


@router.get("/organization", response_model=OrganizationOut)
def get_organization(user: User = Depends(get_current_user)):
    return OrganizationOut.model_validate(user.organization)


@router.put("/organization", response_model=OrganizationOut)
def update_organization(payload: OrganizationUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = user.organization
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    audit.record(db, user, "update", "organization", org.id, "Organization profile updated")
    db.commit()
    db.refresh(org)
    return OrganizationOut.model_validate(org)


@router.get("/users", response_model=List[UserOut])
def list_users(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(User).where(User.organization_id == user.organization_id).order_by(User.created_at)
    ).scalars().all()
    return [UserOut.model_validate(u) for u in rows]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def invite_user(payload: InviteUserRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")
    if not smtp_configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Outbound email is not configured on the server, so invite links cannot be delivered. "
            "Set SMTP_USER and SMTP_PASSWORD, or ask an administrator to.",
        )

    employee: Employee | None = None
    if payload.role == "employee":
        if not payload.employee_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select which employee this portal login is for.")
        employee = get_or_404(db, Employee, payload.employee_id, user.organization_id, "Employee")
        if employee.user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "This employee already has portal access.")

    raw_token = secrets.token_urlsafe(32)
    new_user = User(
        organization_id=user.organization_id,
        name=payload.name,
        email=email,
        role=payload.role,
        password_hash=None,
        is_active=True,
        invite_token_hash=hash_token(raw_token),
        invite_token_expires_at=datetime.now(UTC) + timedelta(days=INVITE_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_user)
    db.flush()
    if employee is not None:
        employee.user_id = new_user.id

    accept_url = f"{settings.frontend_url}/accept-invite?token={raw_token}"
    result = send_invite_email(
        to_email=email,
        name=payload.name,
        organization_name=user.organization.name,
        role=payload.role,
        inviter_name=user.name,
        accept_url=accept_url,
    )
    if not result.get("success"):
        db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not send the invite email: {result.get('error', 'unknown error')}")

    detail = f"Invited {email} as {payload.role}" + (f", linked to employee {employee.name}" if employee else "")
    audit.record(db, user, "create", "user", new_user.id, detail)
    db.commit()
    return UserOut.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str, payload: UpdateUserRequest, user: User = Depends(require_admin), db: Session = Depends(get_db)
):
    target = db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    data = payload.model_dump(exclude_unset=True)
    if target.id == user.id and (data.get("role") not in (None, "admin") or data.get("is_active") is False):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot demote or deactivate your own account")
    if data.get("role") and data["role"] != "admin" and target.role == "admin":
        admins = db.execute(
            select(User.id).where(User.organization_id == user.organization_id, User.role == "admin", User.is_active.is_(True))
        ).scalars().all()
        if len(admins) <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The organization needs at least one administrator")
    for field, value in data.items():
        setattr(target, field, value)
    audit.record(db, user, "update", "user", target.id, f"Updated user {target.email}")
    db.commit()
    return UserOut.model_validate(target)


@router.post("/users/{user_id}/reset-password", response_model=Message)
def reset_password(
    user_id: str,
    new_password: str = Query(min_length=8),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    target.password_hash = hash_password(new_password)
    audit.record(db, user, "update", "user", target.id, f"Password reset for {target.email}")
    db.commit()
    return Message(message="Password reset")


@router.get("/users/{user_id}/dashboard", response_model=UserDashboardOut)
def get_user_dashboard(
    user_id: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from backend.routers.payroll import employee_out, payslip_out
    from backend.routers.projects import entry_out

    target = db.get(User, user_id)
    if target is None or target.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    employee = db.execute(
        select(Employee).where(
            Employee.organization_id == user.organization_id,
            (Employee.user_id == target.id) | (Employee.email == target.email),
        )
    ).scalars().first()

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
    if target is None or target.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    employee = db.execute(
        select(Employee).where(
            Employee.organization_id == user.organization_id,
            (Employee.user_id == target.id) | (Employee.email == target.email),
        )
    ).scalars().first()

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
    stmt = select(AuditLog).where(AuditLog.organization_id == user.organization_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[AuditLogOut.model_validate(r) for r in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.get("/settings/smtp", response_model=SmtpSettingsOut)
def get_smtp_settings(user: User = Depends(require_admin)):
    """Current outbound-email configuration. Never returns the password."""
    current = get_settings()
    return SmtpSettingsOut(
        host=current.smtp_host,
        port=current.smtp_port,
        username=current.smtp_user,
        sender_name=current.smtp_sender_name,
        configured=current.smtp_configured,
    )


@router.put("/settings/smtp", response_model=SmtpSettingsOut)
def update_smtp_settings(payload: SmtpSettingsUpdate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Save the sender account used for invites, invoices and reminders.

    The credentials are verified against the server before being written, so a
    bad app password is rejected here rather than silently breaking every
    outbound email later.
    """
    password = (payload.password or "").strip() or get_settings().smtp_password
    if not password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A password (Gmail app password) is required the first time you configure this.")

    try:
        verify_smtp_credentials(payload.host, payload.port, str(payload.username), password)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Those details were rejected by the mail server: {exc}",
        ) from exc

    update_env_values({
        "SMTP_HOST": payload.host.strip(),
        "SMTP_PORT": str(payload.port),
        "SMTP_USER": str(payload.username).strip(),
        "SMTP_PASSWORD": password,
        "SMTP_SENDER_NAME": payload.sender_name.strip(),
    })

    audit.record(db, user, "update", "organization", user.organization_id, f"Outbound email sender set to {payload.username}")
    db.commit()

    current = get_settings()
    return SmtpSettingsOut(
        host=current.smtp_host,
        port=current.smtp_port,
        username=current.smtp_user,
        sender_name=current.smtp_sender_name,
        configured=current.smtp_configured,
    )


@router.post("/settings/smtp/test", response_model=Message)
def send_smtp_test(payload: SmtpTestRequest, user: User = Depends(require_admin)):
    """Send a test message so an admin can confirm delivery actually works."""
    if not smtp_configured():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Configure the sender account first.")
    result = send_test_email(str(payload.to_email), user.organization.name)
    if not result.get("success"):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not send the test email: {result.get('error', 'unknown error')}")
    return Message(message=f"Test email sent to {payload.to_email}.")
