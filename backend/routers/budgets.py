"""Budgets per account and month, and budget vs actual from the ledger."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_financial_read, require_write
from backend.models import Account, Budget, BudgetLine, User
from backend.schemas.common import MAX_MONEY, APIModel, Message
from backend.services import audit, ledger
from backend.services.money import money
from backend.services.periods import add_months, month_bounds
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/budgets", tags=["Accountant"])


class BudgetLineIn(APIModel):
    account_id: str
    # One amount per month of the budget year, first month first.
    amounts: List[Decimal] = Field(min_length=12, max_length=12)

    @field_validator("amounts")
    @classmethod
    def _bounds(cls, value: List[Decimal]) -> List[Decimal]:
        if any(abs(v) > MAX_MONEY for v in value):
            raise ValueError("Budget amount is too large")
        return value


class BudgetIn(APIModel):
    name: str = Field(min_length=1, max_length=120)
    # First day of the budget year (normally the fiscal year start).
    start_date: date
    lines: List[BudgetLineIn] = []

    @field_validator("start_date")
    @classmethod
    def _first_of_month(cls, value: date) -> date:
        return value.replace(day=1)


class BudgetLineOut(APIModel):
    account_id: str
    code: str
    name: str
    type: str
    amounts: List[Decimal]
    total: Decimal


class BudgetOut(APIModel):
    id: str
    name: str
    start_date: date
    end_date: date
    lines: List[BudgetLineOut]
    total_income: Decimal
    total_expense: Decimal


class VarianceRow(APIModel):
    account_id: str
    code: str
    name: str
    type: str
    budget: Decimal
    actual: Decimal
    variance: Decimal  # actual - budget
    variance_percent: Optional[Decimal] = None
    # Favourable: income above budget, or expense below it.
    favourable: bool
    monthly_budget: List[Decimal]
    monthly_actual: List[Decimal]


class BudgetVsActual(APIModel):
    budget_id: str
    name: str
    start_date: date
    through: date
    months: List[str]
    rows: List[VarianceRow]
    income_budget: Decimal
    income_actual: Decimal
    expense_budget: Decimal
    expense_actual: Decimal
    profit_budget: Decimal
    profit_actual: Decimal


def _end(start: date) -> date:
    return add_months(start, 12) - timedelta(days=1)


def _out(budget: Budget) -> BudgetOut:
    by_account: Dict[str, List[Decimal]] = {}
    accounts: Dict[str, Account] = {}
    for line in budget.lines:
        by_account.setdefault(line.account_id, [Decimal("0")] * 12)[line.month_index] = line.amount
        accounts[line.account_id] = line.account
    lines = [
        BudgetLineOut(
            account_id=aid,
            code=accounts[aid].code,
            name=accounts[aid].name,
            type=accounts[aid].type,
            amounts=amounts,
            total=money(sum(amounts, Decimal("0"))),
        )
        for aid, amounts in sorted(by_account.items(), key=lambda kv: accounts[kv[0]].code)
    ]
    return BudgetOut(
        id=budget.id,
        name=budget.name,
        start_date=budget.start_date,
        end_date=_end(budget.start_date),
        lines=lines,
        total_income=money(sum((ln.total for ln in lines if ln.type == "income"), Decimal("0"))),
        total_expense=money(sum((ln.total for ln in lines if ln.type == "expense"), Decimal("0"))),
    )


def _load(db: Session, budget_id: str, org_id: str) -> Budget:
    budget = db.execute(
        select(Budget)
        .where(Budget.id == budget_id, Budget.organization_id == org_id)
        .options(selectinload(Budget.lines).selectinload(BudgetLine.account))
    ).scalar_one_or_none()
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
    return budget


def _apply(db: Session, budget: Budget, payload: BudgetIn, org_id: str) -> None:
    budget.name = payload.name
    budget.start_date = payload.start_date
    budget.lines.clear()
    db.flush()
    seen = set()
    for line in payload.lines:
        account = get_or_404(db, Account, line.account_id, org_id, "Account")
        if account.type not in ("income", "expense"):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"Account {account.code} {account.name}: budgets are for income and expense accounts"
            )
        if account.id in seen:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Account {account.code} {account.name} appears twice")
        seen.add(account.id)
        for month, amount in enumerate(line.amounts):
            if amount:
                budget.lines.append(BudgetLine(account_id=account.id, month_index=month, amount=money(amount)))


@router.get("", response_model=List[BudgetOut])
def list_budgets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Budget)
        .where(Budget.organization_id == user.organization_id)
        .options(selectinload(Budget.lines).selectinload(BudgetLine.account))
        .order_by(Budget.start_date.desc())
    ).scalars()
    return [_out(b) for b in rows]


@router.get("/{budget_id}", response_model=BudgetOut)
def get_budget(budget_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(_load(db, budget_id, user.organization_id))


@router.post("", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
def create_budget(payload: BudgetIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    budget = Budget(organization_id=user.organization_id, name=payload.name, start_date=payload.start_date, created_by=user.id)
    db.add(budget)
    _apply(db, budget, payload, user.organization_id)
    db.flush()
    audit.record(db, user, "create", "budget", budget.id, f"Created budget '{budget.name}'")
    db.commit()
    return _out(_load(db, budget.id, user.organization_id))


@router.put("/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: str, payload: BudgetIn, user: User = Depends(require_write), db: Session = Depends(get_db)):
    budget = _load(db, budget_id, user.organization_id)
    _apply(db, budget, payload, user.organization_id)
    audit.record(db, user, "update", "budget", budget.id, f"Updated budget '{budget.name}'")
    db.commit()
    return _out(_load(db, budget.id, user.organization_id))


@router.delete("/{budget_id}", response_model=Message)
def delete_budget(budget_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    budget = _load(db, budget_id, user.organization_id)
    name = budget.name
    db.delete(budget)
    audit.record(db, user, "delete", "budget", budget_id, f"Deleted budget '{name}'")
    db.commit()
    return Message(message=f"Budget '{name}' deleted")


@router.get("/{budget_id}/vs-actual", response_model=BudgetVsActual)
def budget_vs_actual(
    budget_id: str,
    through: Optional[date] = Query(None),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    """Each budgeted account's budget against the ledger, month by month, up to ``through``."""
    budget = _load(db, budget_id, user.organization_id)
    out = _out(budget)
    through = min(through or date.today(), out.end_date)
    months = []
    monthly_actual: Dict[str, List[Decimal]] = {line.account_id: [Decimal("0")] * 12 for line in out.lines}
    for index in range(12):
        start = add_months(budget.start_date, index)
        if start > through:
            break
        months.append(start.strftime("%b %Y"))
        _, end = month_bounds(start.year, start.month)
        balances = ledger.account_balances(db, user.organization_id, start=start, end=min(end, through), account_ids=list(monthly_actual))
        for line in out.lines:
            d, c = balances.get(line.account_id, (Decimal("0"), Decimal("0")))
            monthly_actual[line.account_id][index] = ledger.natural_balance(line.type, d, c)
    n = len(months)
    rows: List[VarianceRow] = []
    for line in out.lines:
        budgeted = money(sum(line.amounts[:n], Decimal("0")))
        actual = money(sum(monthly_actual[line.account_id][:n], Decimal("0")))
        variance = money(actual - budgeted)
        rows.append(
            VarianceRow(
                account_id=line.account_id,
                code=line.code,
                name=line.name,
                type=line.type,
                budget=budgeted,
                actual=actual,
                variance=variance,
                variance_percent=money(variance * 100 / budgeted) if budgeted else None,
                favourable=variance >= 0 if line.type == "income" else variance <= 0,
                monthly_budget=line.amounts[:n],
                monthly_actual=monthly_actual[line.account_id][:n],
            )
        )

    def total(kind: str, attr: str) -> Decimal:
        return money(sum((getattr(r, attr) for r in rows if r.type == kind), Decimal("0")))

    ib, ia, eb, ea = total("income", "budget"), total("income", "actual"), total("expense", "budget"), total("expense", "actual")
    return BudgetVsActual(
        budget_id=budget.id,
        name=budget.name,
        start_date=budget.start_date,
        through=through,
        months=months,
        rows=rows,
        income_budget=ib,
        income_actual=ia,
        expense_budget=eb,
        expense_actual=ea,
        profit_budget=money(ib - eb),
        profit_actual=money(ia - ea),
    )
