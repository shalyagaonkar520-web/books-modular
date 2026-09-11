"""Employees, monthly pay runs and payslips."""
from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_admin, require_write
from backend.models import BankAccount, Employee, PayRun, Payslip, User
from backend.schemas.common import Message
from backend.schemas.payroll import (
    EmployeeCreate,
    EmployeeOptionOut,
    EmployeeOut,
    EmployeeUpdate,
    PayRunCreate,
    PayRunOut,
    PayRunPay,
    PayslipOut,
)
from backend.services import audit, bank, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.tenancy import get_or_404, mask_number

router = APIRouter(prefix="/api/payroll", tags=["Payroll"])


def employee_out(e: Employee) -> EmployeeOut:
    gross = money(e.basic_salary + e.hra + e.other_allowances)
    deductions = money(e.pf_employee + e.professional_tax + e.tds)
    return EmployeeOut(
        id=e.id, employee_code=e.employee_code, name=e.name, email=e.email, designation=e.designation, department=e.department,
        date_of_joining=e.date_of_joining, pan=e.pan, bank_account_number_masked=mask_number(e.bank_account_number), bank_ifsc=e.bank_ifsc,
        basic_salary=e.basic_salary, hra=e.hra, other_allowances=e.other_allowances, pf_employee=e.pf_employee,
        professional_tax=e.professional_tax, tds=e.tds, gross_salary=gross, net_salary=money(gross - deductions), is_active=e.is_active,
        created_at=e.created_at, has_login=bool(e.user_id),
    )


def payslip_out(p: Payslip) -> PayslipOut:
    e = p.employee
    return PayslipOut(
        id=p.id, employee_id=p.employee_id, employee_code=e.employee_code, employee_name=e.name, designation=e.designation, department=e.department,
        pan=e.pan, bank_account_number_masked=mask_number(e.bank_account_number), basic_salary=p.basic_salary, hra=p.hra,
        other_allowances=p.other_allowances, gross=p.gross, pf_employee=p.pf_employee, professional_tax=p.professional_tax, tds=p.tds,
        loss_of_pay_days=p.loss_of_pay_days, loss_of_pay_amount=p.loss_of_pay_amount, total_deductions=p.total_deductions, net_pay=p.net_pay,
    )


def payrun_out(run: PayRun, include_slips: bool = True) -> PayRunOut:
    return PayRunOut(
        id=run.id, period_year=run.period_year, period_month=run.period_month, period_label=f"{calendar.month_name[run.period_month]} {run.period_year}",
        status=run.status, pay_date=run.pay_date, bank_account_id=run.bank_account_id, total_gross=run.total_gross,
        total_deductions=run.total_deductions, total_net=run.total_net, employee_count=len(run.payslips),
        payslips=[payslip_out(p) for p in run.payslips] if include_slips else [], created_at=run.created_at,
    )


@router.get("/employees", response_model=List[EmployeeOut])
def list_employees(include_inactive: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Employee).where(Employee.organization_id == user.organization_id)
    if not include_inactive:
        stmt = stmt.where(Employee.is_active.is_(True))
    return [employee_out(e) for e in db.execute(stmt.order_by(Employee.employee_code)).scalars()]


@router.get("/employees/unlinked", response_model=List[EmployeeOptionOut])
def list_unlinked_employees(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Active employees with no portal login yet - the picker shown when inviting someone as Employee."""
    stmt = (
        select(Employee)
        .where(Employee.organization_id == user.organization_id, Employee.is_active.is_(True), Employee.user_id.is_(None))
        .order_by(Employee.name)
    )
    return [
        EmployeeOptionOut(id=e.id, employee_code=e.employee_code, name=e.name, email=e.email)
        for e in db.execute(stmt).scalars()
    ]


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    data = payload.model_dump()
    code = data.pop("employee_code") or numbering.next_number(db, user.organization_id, "employee")
    if db.execute(select(Employee.id).where(Employee.organization_id == user.organization_id, Employee.employee_code == code)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"Employee code {code} already exists")
    emp = Employee(organization_id=user.organization_id, employee_code=code, **data)
    db.add(emp)
    db.flush()
    audit.record(db, user, "create", "employee", emp.id, f"Added employee {emp.name} ({code})")
    db.commit()
    return employee_out(emp)


@router.put("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: str, payload: EmployeeUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    emp = get_or_404(db, Employee, employee_id, user.organization_id, "Employee")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(emp, field, value)
    if emp.is_active is False and emp.user:
        # Deactivating the employee record locks their portal login too.
        emp.user.is_active = False
    audit.record(db, user, "update", "employee", emp.id, f"Updated employee {emp.name}")
    db.commit()
    return employee_out(emp)


@router.delete("/employees/{employee_id}", response_model=Message)
def delete_employee(employee_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    emp = get_or_404(db, Employee, employee_id, user.organization_id, "Employee")
    has_slips = db.execute(select(Payslip.id).where(Payslip.employee_id == emp.id).limit(1)).first()
    if has_slips:
        emp.is_active = False
        if emp.user:
            emp.user.is_active = False
        db.commit()
        return Message(message="Employee has payslips and was marked inactive instead of deleted")
    if emp.user:
        emp.user.is_active = False
    db.delete(emp)
    audit.record(db, user, "delete", "employee", employee_id, f"Deleted employee {emp.name}")
    db.commit()
    return Message(message="Employee deleted")


@router.get("/pay-runs", response_model=List[PayRunOut])
def list_pay_runs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(PayRun).where(PayRun.organization_id == user.organization_id).options(selectinload(PayRun.payslips).selectinload(Payslip.employee))
        .order_by(PayRun.period_year.desc(), PayRun.period_month.desc())
    ).scalars().all()
    return [payrun_out(r, include_slips=False) for r in rows]


@router.get("/pay-runs/{run_id}", response_model=PayRunOut)
def get_pay_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    run = db.execute(
        select(PayRun).where(PayRun.id == run_id, PayRun.organization_id == user.organization_id)
        .options(selectinload(PayRun.payslips).selectinload(Payslip.employee))
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pay run not found")
    return payrun_out(run)


@router.post("/pay-runs", response_model=PayRunOut, status_code=status.HTTP_201_CREATED)
def create_pay_run(payload: PayRunCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org_id = user.organization_id
    exists = db.execute(select(PayRun.id).where(PayRun.organization_id == org_id, PayRun.period_year == payload.period_year, PayRun.period_month == payload.period_month)).first()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "A pay run already exists for this period")
    period_end = date(payload.period_year, payload.period_month, calendar.monthrange(payload.period_year, payload.period_month)[1])
    employees = db.execute(
        select(Employee).where(Employee.organization_id == org_id, Employee.is_active.is_(True), Employee.date_of_joining <= period_end)
    ).scalars().all()
    if not employees:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active employees for this period")
    days_in_month = Decimal(calendar.monthrange(payload.period_year, payload.period_month)[1])
    run = PayRun(organization_id=org_id, period_year=payload.period_year, period_month=payload.period_month, status="draft", created_by=user.id)
    total_gross = total_ded = total_net = Decimal("0")
    for emp in employees:
        lop_days = Decimal(str(payload.loss_of_pay.get(emp.id, 0)))
        if lop_days < 0 or lop_days > days_in_month:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid loss-of-pay days for {emp.name}")
        full_gross = money(emp.basic_salary + emp.hra + emp.other_allowances)
        lop_amount = money(full_gross * lop_days / days_in_month) if lop_days else Decimal("0")
        gross = money(full_gross - lop_amount)
        deductions = money(emp.pf_employee + emp.professional_tax + emp.tds)
        net = money(gross - deductions)
        if net < 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Deductions exceed pay for {emp.name}")
        run.payslips.append(Payslip(
            employee_id=emp.id, basic_salary=emp.basic_salary, hra=emp.hra, other_allowances=emp.other_allowances, gross=gross,
            pf_employee=emp.pf_employee, professional_tax=emp.professional_tax, tds=emp.tds, loss_of_pay_days=lop_days,
            loss_of_pay_amount=lop_amount, total_deductions=deductions, net_pay=net,
        ))
        total_gross += gross
        total_ded += deductions
        total_net += net
    run.total_gross, run.total_deductions, run.total_net = money(total_gross), money(total_ded), money(total_net)
    db.add(run)
    db.flush()
    audit.record(db, user, "create", "pay_run", run.id, f"Created pay run for {calendar.month_name[run.period_month]} {run.period_year}")
    db.commit()
    return get_pay_run(run.id, user, db)


@router.post("/pay-runs/{run_id}/approve", response_model=PayRunOut)
def approve_pay_run(run_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    run = get_or_404(db, PayRun, run_id, user.organization_id, "Pay run")
    if run.status != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only draft pay runs can be approved")
    run.status = "approved"
    audit.record(db, user, "update", "pay_run", run.id, "Pay run approved")
    db.commit()
    return get_pay_run(run.id, user, db)


@router.post("/pay-runs/{run_id}/pay", response_model=PayRunOut)
def pay_pay_run(run_id: str, payload: PayRunPay, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org_id = user.organization_id
    run = get_or_404(db, PayRun, run_id, org_id, "Pay run")
    if run.status != "approved":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Approve the pay run before recording payment")
    bank_acct = get_or_404(db, BankAccount, payload.bank_account_id, org_id, "Bank account")
    salary_exp = get_account_by_code(db, org_id, "6400")
    pf_payable = get_account_by_code(db, org_id, "2310")
    pt_payable = get_account_by_code(db, org_id, "2320")
    tds_payable = get_account_by_code(db, org_id, "2200")
    label = f"Payroll {calendar.month_name[run.period_month]} {run.period_year}"
    pf = money(sum((p.pf_employee for p in run.payslips), Decimal("0")))
    pt = money(sum((p.professional_tax for p in run.payslips), Decimal("0")))
    tds = money(sum((p.tds for p in run.payslips), Decimal("0")))
    lines = [(salary_exp.id, run.total_gross, Decimal("0"), label, None)]
    if pf:
        lines.append((pf_payable.id, Decimal("0"), pf, f"{label} - PF", None))
    if pt:
        lines.append((pt_payable.id, Decimal("0"), pt, f"{label} - Professional tax", None))
    if tds:
        lines.append((tds_payable.id, Decimal("0"), tds, f"{label} - TDS", None))
    lines.append((bank_acct.ledger_account_id, Decimal("0"), run.total_net, f"{label} - net salaries", None))
    entry = ledger.post_entry(db, org_id, payload.pay_date, lines, "payroll", run.id, reference=label, created_by=user.id)
    bank.record_movement(db, bank_acct, payload.pay_date, "withdrawal", run.total_net, label, "payroll", run.id, user.id, None, salary_exp.id, entry.id)
    run.status = "paid"
    run.pay_date = payload.pay_date
    run.bank_account_id = bank_acct.id
    audit.record(db, user, "update", "pay_run", run.id, f"{label} paid from {bank_acct.name}")
    db.commit()
    return get_pay_run(run.id, user, db)


@router.delete("/pay-runs/{run_id}", response_model=Message)
def delete_pay_run(run_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    run = get_or_404(db, PayRun, run_id, user.organization_id, "Pay run")
    if run.status == "paid":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paid pay runs cannot be deleted")
    db.delete(run)
    audit.record(db, user, "delete", "pay_run", run_id, "Pay run deleted")
    db.commit()
    return Message(message="Pay run deleted")


@router.get("/payslips/{payslip_id}", response_model=PayslipOut)
def get_payslip(payslip_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    slip = db.get(Payslip, payslip_id)
    if slip is None or slip.pay_run.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
    return payslip_out(slip)
