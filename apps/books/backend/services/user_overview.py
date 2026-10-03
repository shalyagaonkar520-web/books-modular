"""Everything about one user of an organization, for its admin panel: profile,
employee record, performance (what they raised, collected and logged) and
what is still pending on them (drafts, unpaid and overdue invoices).

Read-only. Records are attributed by ``created_by`` (the user's id), time by
``TimeEntry.user_id`` and actions by the audit log.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.models import AuditLog, Bill, Employee, Expense, Invoice, LeaveRecord, PayRun, Payslip, TimeEntry, User
from backend.schemas.auth import AuditLogOut, UserOut
from backend.schemas.common import APIModel
from backend.services import subscription

OPEN_INVOICE_STATUSES = ("sent", "partially_paid")
PENDING_ROWS = 20
RECENT_ACTIONS = 50


class OverviewEmployee(APIModel):
    id: str
    employee_code: str
    designation: Optional[str] = None
    department: Optional[str] = None
    date_of_joining: date
    is_active: bool
    leave_days_this_year: int
    payslips: int
    last_net_pay: Optional[Decimal] = None
    last_pay_period: Optional[str] = None


class OverviewPerformance(APIModel):
    invoices_raised: int
    invoiced_amount: Decimal
    collected_amount: Decimal
    invoices_last_30_days: int
    bills_recorded: int
    bills_amount: Decimal
    expenses_recorded: int
    expenses_amount: Decimal
    hours_logged: Decimal
    hours_last_30_days: Decimal
    billable_hours: Decimal
    actions_last_30_days: int
    last_active: Optional[datetime] = None


class PendingInvoice(APIModel):
    id: str
    invoice_number: str
    customer_name: Optional[str] = None
    due_date: date
    status: str
    total: Decimal
    balance_due: Decimal


class PendingBill(APIModel):
    id: str
    bill_number: str
    vendor_name: Optional[str] = None
    due_date: date
    total: Decimal


class OverviewPending(APIModel):
    invite_pending: bool
    draft_invoices: int
    open_invoices: int
    overdue_invoices: int
    outstanding_amount: Decimal
    draft_bills: int
    invoices: List[PendingInvoice]
    bills: List[PendingBill]


class UserOverviewOut(APIModel):
    user: UserOut
    # Modules of the accepted plan (None = every module: trial or no plan);
    # the panel can grant only these. ``user.module_access`` is what is granted.
    plan_modules: Optional[List[str]] = None
    employee: Optional[OverviewEmployee] = None
    performance: OverviewPerformance
    pending: OverviewPending
    recent_activity: List[AuditLogOut]


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _sum(values) -> Decimal:
    return _money(sum(values, Decimal("0")))


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    # SQLite hands back naive datetimes; they are stored in UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _employee(db: Session, org_id: str, target: User, today: date) -> Optional[OverviewEmployee]:
    employee = (
        db.execute(
            select(Employee).where(Employee.organization_id == org_id, or_(Employee.user_id == target.id, Employee.email == target.email))
        )
        .scalars()
        .first()
    )
    if employee is None:
        return None
    leaves = db.execute(
        select(func.count())
        .select_from(LeaveRecord)
        .where(LeaveRecord.employee_id == employee.id, LeaveRecord.date >= date(today.year, 1, 1))
    ).scalar_one()
    slips = (
        db.execute(
            select(Payslip)
            .join(PayRun, PayRun.id == Payslip.pay_run_id)
            .where(Payslip.employee_id == employee.id)
            .options(selectinload(Payslip.pay_run))
            .order_by(PayRun.period_year.desc(), PayRun.period_month.desc())
        )
        .scalars()
        .all()
    )
    last = slips[0] if slips else None
    return OverviewEmployee(
        id=employee.id,
        employee_code=employee.employee_code,
        designation=employee.designation,
        department=employee.department,
        date_of_joining=employee.date_of_joining,
        is_active=employee.is_active,
        leave_days_this_year=leaves,
        payslips=len(slips),
        last_net_pay=_money(last.net_pay) if last else None,
        last_pay_period=f"{last.pay_run.period_year}-{last.pay_run.period_month:02d}" if last else None,
    )


def user_overview(db: Session, org_id: str, user_id: str, today: Optional[date] = None) -> UserOverviewOut:
    """404 unless ``user_id`` belongs to ``org_id``."""
    target = db.get(User, user_id)
    if target is None or target.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    today = today or date.today()
    now = datetime.now(UTC)
    month_ago = now - timedelta(days=30)

    invoices = (
        db.execute(
            select(Invoice)
            .where(Invoice.organization_id == org_id, Invoice.created_by == target.id)
            .options(selectinload(Invoice.customer))
            .order_by(Invoice.due_date)
        )
        .scalars()
        .all()
    )
    raised = [i for i in invoices if i.status not in ("draft", "void")]
    open_invoices = [i for i in invoices if i.status in OPEN_INVOICE_STATUSES]
    overdue = [i for i in open_invoices if i.due_date < today]
    drafts = [i for i in invoices if i.status == "draft"]

    bills = (
        db.execute(
            select(Bill)
            .where(Bill.organization_id == org_id, Bill.created_by == target.id)
            .options(selectinload(Bill.vendor))
            .order_by(Bill.due_date)
        )
        .scalars()
        .all()
    )
    draft_bills = [b for b in bills if b.status == "draft"]
    expenses = db.execute(select(Expense).where(Expense.organization_id == org_id, Expense.created_by == target.id)).scalars().all()
    entries = db.execute(select(TimeEntry).where(TimeEntry.organization_id == org_id, TimeEntry.user_id == target.id)).scalars().all()

    mine = or_(AuditLog.user_id == target.id, AuditLog.user_name == target.name)
    activity = (
        db.execute(
            select(AuditLog).where(AuditLog.organization_id == org_id, mine).order_by(AuditLog.created_at.desc()).limit(RECENT_ACTIONS)
        )
        .scalars()
        .all()
    )
    actions_30 = db.execute(
        select(func.count()).select_from(AuditLog).where(AuditLog.organization_id == org_id, mine, AuditLog.created_at >= month_ago)
    ).scalar_one()

    user_out = UserOut.model_validate(target)
    last_active = _aware(target.last_login_at)
    if activity and (last_active is None or _aware(activity[0].created_at) > last_active):
        last_active = _aware(activity[0].created_at)

    # Overdue first, then the other open invoices, then drafts.
    pending_invoices = overdue + [i for i in open_invoices if i not in overdue] + drafts

    plan = subscription.paid_modules(target.organization)
    return UserOverviewOut(
        user=user_out,
        plan_modules=sorted(plan) if plan is not None else None,
        employee=_employee(db, org_id, target, today),
        performance=OverviewPerformance(
            invoices_raised=len(raised),
            invoiced_amount=_sum(i.total for i in raised),
            collected_amount=_sum(i.amount_paid for i in raised),
            invoices_last_30_days=sum(1 for i in raised if (_aware(i.created_at) or now) >= month_ago),
            bills_recorded=len(bills),
            bills_amount=_sum(b.total for b in bills),
            expenses_recorded=len(expenses),
            expenses_amount=_sum(e.total for e in expenses),
            hours_logged=_sum(t.hours for t in entries),
            hours_last_30_days=_sum(t.hours for t in entries if t.date >= month_ago.date()),
            billable_hours=_sum(t.hours for t in entries if t.is_billable),
            actions_last_30_days=actions_30,
            last_active=last_active,
        ),
        pending=OverviewPending(
            invite_pending=bool(user_out.pending_invite),
            draft_invoices=len(drafts),
            open_invoices=len(open_invoices),
            overdue_invoices=len(overdue),
            outstanding_amount=_sum(i.balance_due for i in open_invoices),
            draft_bills=len(draft_bills),
            invoices=[
                PendingInvoice(
                    id=i.id,
                    invoice_number=i.invoice_number,
                    customer_name=i.customer.display_name if i.customer else None,
                    due_date=i.due_date,
                    status="overdue" if i in overdue else i.status,
                    total=_money(i.total),
                    balance_due=_money(i.total if i.status == "draft" else i.balance_due),
                )
                for i in pending_invoices[:PENDING_ROWS]
            ],
            bills=[
                PendingBill(
                    id=b.id,
                    bill_number=b.bill_number,
                    vendor_name=b.vendor.display_name if b.vendor else None,
                    due_date=b.due_date,
                    total=_money(b.total),
                )
                for b in draft_bills[:PENDING_ROWS]
            ],
        ),
        recent_activity=[AuditLogOut.model_validate(a) for a in activity],
    )
