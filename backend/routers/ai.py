"""AI assistant endpoints and the cash-flow forecast."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Bill, Expense, Invoice, RecurringProfile, User
from backend.schemas.common import APIModel
from backend.services import ai, bank, recurring
from backend.services.money import money

router = APIRouter(prefix="/api/ai", tags=["AI assistant"])


class AiStatus(APIModel):
    configured: bool
    model: str


class StatementRow(APIModel):
    description: str = Field(min_length=1, max_length=300)
    amount: Decimal
    type: Literal["deposit", "withdrawal"] = "withdrawal"


class CategorizeRequest(APIModel):
    rows: List[StatementRow] = Field(min_length=1, max_length=100)


class ChatTurn(APIModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(APIModel):
    question: str = Field(min_length=2, max_length=1000)
    history: List[ChatTurn] = Field(default_factory=list, max_length=20)


@router.get("/status", response_model=AiStatus)
def ai_status(user: User = Depends(get_current_user)):
    return AiStatus(configured=ai.configured(), model=get_settings().ai_model)


@router.post("/extract-document")
async def extract_document(
    file: UploadFile = File(...), user: User = Depends(require_write), db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Read a bill or receipt photo / PDF into a draft to review before saving."""
    data = await file.read(ai.MAX_UPLOAD_BYTES + 1)
    media_type = (file.content_type or "").split(";")[0].strip().lower()
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    return ai.extract_document(db, user.organization_id, data, media_type)


@router.post("/categorize")
def categorize(payload: CategorizeRequest, user: User = Depends(require_write), db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = [r.model_dump(mode="json") for r in payload.rows]
    return {"suggestions": ai.categorize(db, user.organization_id, rows)}


@router.post("/ask")
def ask(payload: AskRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    return ai.ask(db, user, payload.question, [t.model_dump() for t in payload.history])


# --------------------------------------------------------------------------- #
# Cash-flow forecast (deterministic: what is already booked or scheduled)
# --------------------------------------------------------------------------- #
class ForecastWeek(APIModel):
    week_start: date
    inflow: Decimal
    outflow: Decimal
    net: Decimal
    closing: Decimal


class Forecast(APIModel):
    opening_cash: Decimal
    weeks: List[ForecastWeek]
    lowest_balance: Decimal
    lowest_week: Optional[date] = None
    average_daily_spend: Decimal
    assumptions: List[str]


@router.get("/cash-forecast", response_model=Forecast)
def cash_forecast(weeks: int = Query(13, ge=4, le=52), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cash week by week from today: open invoices come in and open bills go out on their
    due dates (overdue ones in the first week), recurring invoices and bills on their next
    run dates, and expenses at the average daily rate of the last 90 days."""
    if user.role not in ("admin", "viewer"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot see bank balances")
    org_id = user.organization_id
    today = date.today()
    starts = [today + timedelta(days=7 * i) for i in range(weeks)]
    horizon = starts[-1] + timedelta(days=7)
    inflow = [Decimal("0")] * weeks
    outflow = [Decimal("0")] * weeks

    def bucket(day: date) -> Optional[int]:
        if day >= horizon:
            return None
        return max(0, (day - today).days // 7)

    for inv in db.execute(
        select(Invoice).where(Invoice.organization_id == org_id, Invoice.status.in_(("sent", "partially_paid")))
    ).scalars():
        i = bucket(inv.due_date)
        if i is not None:
            inflow[i] += inv.balance_due
    for bill in db.execute(select(Bill).where(Bill.organization_id == org_id, Bill.status.in_(("open", "partially_paid")))).scalars():
        i = bucket(bill.due_date)
        if i is not None:
            outflow[i] += bill.balance_due
    for profile in db.execute(
        select(RecurringProfile).where(
            RecurringProfile.organization_id == org_id, RecurringProfile.status == "active", RecurringProfile.kind.in_(("invoice", "bill"))
        )
    ).scalars():
        run = profile.next_run_date
        while run and run < horizon and (profile.end_date is None or run <= profile.end_date):
            i = bucket(run)
            if i is not None:
                (inflow if profile.kind == "invoice" else outflow)[i] += profile.total
            run = recurring.next_after(profile.start_date, profile.frequency, profile.interval_count, run)
    spent = db.execute(
        select(func.coalesce(func.sum(Expense.total), 0)).where(
            Expense.organization_id == org_id, Expense.date > today - timedelta(days=90), Expense.date <= today
        )
    ).scalar_one()
    daily = money(Decimal(str(spent)) / 90)
    opening = money(sum(bank.balances_for_org(db, org_id).values(), Decimal("0")))
    out: List[ForecastWeek] = []
    balance = opening
    lowest, lowest_week = opening, None
    for i, start in enumerate(starts):
        o = money(outflow[i] + daily * 7)
        net = money(inflow[i] - o)
        balance = money(balance + net)
        out.append(ForecastWeek(week_start=start, inflow=money(inflow[i]), outflow=o, net=net, closing=balance))
        if balance < lowest:
            lowest, lowest_week = balance, start
    return Forecast(
        opening_cash=opening,
        weeks=out,
        lowest_balance=lowest,
        lowest_week=lowest_week,
        average_daily_spend=daily,
        assumptions=[
            "Customers pay open invoices on their due dates; overdue invoices are counted in the first week.",
            "Open bills are paid on their due dates.",
            "Active recurring invoices and bills run on schedule.",
            "Day-to-day expenses continue at the average of the last 90 days.",
        ],
    )
