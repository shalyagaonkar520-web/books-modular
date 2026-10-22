"""Payroll records in their API shape, shared by the payroll router, the
employee portal and the organization's user overview."""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal

from backend.models import Employee, LeaveRecord, Payslip
from backend.schemas.payroll import EmployeeOut, LeaveRecordOut, PayslipOut
from backend.services.money import money
from backend.services.tenancy import mask_number


def _next_pay_date(salary_day: int | None, today: date) -> date:
    """The next occurrence of ``salary_day`` on or after today (clamped to each
    month's actual length), rolling into next month once this month's has passed."""
    year, month = today.year, today.month
    days_this_month = calendar.monthrange(year, month)[1]
    day = min(salary_day, days_this_month) if salary_day else days_this_month
    candidate = date(year, month, day)
    if candidate >= today:
        return candidate
    year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    days_next_month = calendar.monthrange(year, month)[1]
    day = min(salary_day, days_next_month) if salary_day else days_next_month
    return date(year, month, day)


def _salary_accrual(e: Employee, today: date) -> dict:
    """A day-by-day informational estimate of this month's pay so an employee can
    see it building up. Purely a display aid - the real number always comes from
    the pay run's own calculation once one is created for the period."""
    year, month = today.year, today.month
    days_in_period = calendar.monthrange(year, month)[1]
    gross = money(e.basic_salary + e.hra + e.other_allowances)
    daily_rate = money(gross / Decimal(days_in_period))
    period_start = date(year, month, 1)
    if e.date_of_joining > period_start:
        period_start = e.date_of_joining
    if period_start.year != year or period_start.month != month or period_start > today:
        days_elapsed = 0
    else:
        days_elapsed = (today - period_start).days + 1
    return {
        "next_pay_date": _next_pay_date(e.salary_day, today),
        "daily_rate": daily_rate,
        "days_elapsed_this_period": days_elapsed,
        "days_in_period": days_in_period,
        "accrued_this_period": money(daily_rate * Decimal(days_elapsed)),
    }


def employee_out(e: Employee, today: date | None = None) -> EmployeeOut:
    gross = money(e.basic_salary + e.hra + e.other_allowances)
    deductions = money(e.pf_employee + e.professional_tax + e.tds)
    accrual = _salary_accrual(e, today or date.today())
    return EmployeeOut(
        id=e.id,
        employee_code=e.employee_code,
        name=e.name,
        email=e.email,
        designation=e.designation,
        department=e.department,
        date_of_joining=e.date_of_joining,
        salary_day=e.salary_day,
        pan=e.pan,
        bank_account_number_masked=mask_number(e.bank_account_number),
        bank_ifsc=e.bank_ifsc,
        basic_salary=e.basic_salary,
        hra=e.hra,
        other_allowances=e.other_allowances,
        pf_employee=e.pf_employee,
        professional_tax=e.professional_tax,
        tds=e.tds,
        gross_salary=gross,
        net_salary=money(gross - deductions),
        is_active=e.is_active,
        created_at=e.created_at,
        has_login=bool(e.user_id),
        **accrual,
    )


def leave_out(rec: LeaveRecord) -> LeaveRecordOut:
    return LeaveRecordOut(
        id=rec.id,
        employee_id=rec.employee_id,
        employee_name=rec.employee.name,
        date=rec.date,
        leave_type=rec.leave_type,
        notes=rec.notes,
        created_at=rec.created_at,
    )


def payslip_out(p: Payslip) -> PayslipOut:
    e = p.employee
    run = p.pay_run
    return PayslipOut(
        id=p.id,
        employee_id=p.employee_id,
        employee_code=e.employee_code,
        employee_name=e.name,
        designation=e.designation,
        department=e.department,
        pan=e.pan,
        bank_account_number_masked=mask_number(e.bank_account_number),
        basic_salary=p.basic_salary,
        hra=p.hra,
        other_allowances=p.other_allowances,
        gross=p.gross,
        pf_employee=p.pf_employee,
        professional_tax=p.professional_tax,
        tds=p.tds,
        loss_of_pay_days=p.loss_of_pay_days,
        loss_of_pay_amount=p.loss_of_pay_amount,
        total_deductions=p.total_deductions,
        net_pay=p.net_pay,
        period_year=run.period_year,
        period_month=run.period_month,
        period_label=f"{calendar.month_name[run.period_month]} {run.period_year}",
        pay_run_status=run.status,
        pay_date=run.pay_date,
    )
