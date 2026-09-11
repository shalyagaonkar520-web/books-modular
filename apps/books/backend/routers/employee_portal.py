"""Employee self-service: an invited employee's own profile and payslips.

Deliberately its own router, registered without the app-wide
``require_full_app_access`` dependency (see main.py), so a portal-only
Employee login can reach it. Every endpoint here scopes strictly to the
Employee record linked to the caller's own user id - never anyone else's,
and nothing about the wider organisation.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import Employee, PayRun, Payslip, Project, TimeEntry, User
from backend.routers.payroll import employee_out, payslip_out
from backend.routers.projects import entry_out
from backend.schemas.payroll import EmployeeOut, PayslipOut
from backend.schemas.timetracking import TimeEntryOut

router = APIRouter(prefix="/api/me", tags=["Employee Portal"])


def _my_employee(user: User, db: Session) -> Employee:
    employee = db.execute(
        select(Employee).where(Employee.user_id == user.id, Employee.organization_id == user.organization_id)
    ).scalar_one_or_none()
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No employee profile is linked to your account")
    return employee


@router.get("/employee", response_model=EmployeeOut)
def get_my_employee(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return employee_out(_my_employee(user, db))


@router.get("/payslips", response_model=List[PayslipOut])
def list_my_payslips(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee = _my_employee(user, db)
    stmt = (
        select(Payslip)
        .join(PayRun, PayRun.id == Payslip.pay_run_id)
        .where(Payslip.employee_id == employee.id, PayRun.status != "draft")
        .options(selectinload(Payslip.employee), selectinload(Payslip.pay_run))
        .order_by(PayRun.period_year.desc(), PayRun.period_month.desc())
    )
    return [payslip_out(p) for p in db.execute(stmt).scalars()]


@router.get("/time-entries", response_model=List[TimeEntryOut])
def list_my_time_entries(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Hours logged against this account (entered by staff on their behalf), read-only."""
    stmt = (
        select(TimeEntry)
        .where(TimeEntry.organization_id == user.organization_id, TimeEntry.user_id == user.id)
        .options(selectinload(TimeEntry.project).selectinload(Project.customer), selectinload(TimeEntry.user))
        .order_by(TimeEntry.date.desc(), TimeEntry.created_at.desc())
    )
    return [entry_out(e) for e in db.execute(stmt).scalars()]
