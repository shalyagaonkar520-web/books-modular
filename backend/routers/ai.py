"""AI assistant endpoints and the cash-flow forecast."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import Field
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Invoice, Organization, User
from backend.schemas.common import APIModel
from backend.services import ai, forecast
from backend.services.money import money
from backend.services.tenancy import get_or_404

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
    first_negative_week: Optional[date] = None


def _forecast_out(f: forecast.Forecast) -> Forecast:
    return Forecast(
        opening_cash=f.opening_cash,
        weeks=[ForecastWeek(**w.__dict__) for w in f.weeks],
        lowest_balance=f.lowest_balance,
        lowest_week=f.lowest_week,
        average_daily_spend=f.average_daily_spend,
        assumptions=f.assumptions,
        first_negative_week=f.first_negative_week,
    )


def _require_cash_access(user: User) -> None:
    if user.role not in ("admin", "viewer"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot see bank balances")


@router.get("/cash-forecast", response_model=Forecast)
def cash_forecast(weeks: int = Query(13, ge=4, le=52), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cash week by week from today: open invoices come in and open bills go out on their
    due dates (overdue ones in the first week), recurring invoices and bills on their next
    run dates, and expenses at the average daily rate of the last 90 days."""
    _require_cash_access(user)
    return _forecast_out(forecast.build(db, user.organization_id, weeks))


class OneOffIn(APIModel):
    date: date
    amount: Decimal = Field(gt=0, le=Decimal("9999999999"))
    type: Literal["inflow", "outflow"]
    label: str = Field(default="", max_length=80)


class ScenarioIn(APIModel):
    weeks: int = Field(default=13, ge=4, le=52)
    collection_delay_days: int = Field(default=0, ge=0, le=180)
    collection_rate: Decimal = Field(default=Decimal("100"), ge=0, le=100)
    payment_delay_days: int = Field(default=0, ge=0, le=180)
    extra_monthly_income: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("9999999999"))
    extra_monthly_expense: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("9999999999"))
    spend_change_percent: Decimal = Field(default=Decimal("0"), ge=-100, le=500)
    one_offs: List[OneOffIn] = Field(default_factory=list, max_length=20)


class WhatIf(APIModel):
    baseline: Forecast
    scenario: Forecast
    difference_at_end: Decimal
    summary: str


@router.post("/cash-forecast/what-if", response_model=WhatIf)
def cash_what_if(payload: ScenarioIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The forecast as it stands next to the forecast under a scenario."""
    _require_cash_access(user)
    sc = forecast.Scenario(
        collection_delay_days=payload.collection_delay_days,
        collection_rate=payload.collection_rate,
        payment_delay_days=payload.payment_delay_days,
        extra_monthly_income=payload.extra_monthly_income,
        extra_monthly_expense=payload.extra_monthly_expense,
        spend_change_percent=payload.spend_change_percent,
        one_offs=[forecast.OneOff(o.date, o.amount, o.type, o.label) for o in payload.one_offs],
    )
    base = forecast.build(db, user.organization_id, payload.weeks)
    alt = forecast.build(db, user.organization_id, payload.weeks, sc)
    diff = money(alt.weeks[-1].closing - base.weeks[-1].closing)
    return WhatIf(baseline=_forecast_out(base), scenario=_forecast_out(alt), difference_at_end=diff, summary=forecast.describe(sc))


class ReminderRequest(APIModel):
    invoice_id: str
    tone: Literal["friendly", "firm", "final"] = "friendly"


class ReminderDraft(APIModel):
    subject: str
    body: str
    source: Literal["ai", "template"]
    to_email: Optional[str] = None


@router.post("/reminder-draft", response_model=ReminderDraft)
def reminder_draft(payload: ReminderRequest, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """A payment reminder for an unpaid invoice in the chosen tone, ready to edit and send."""
    inv = get_or_404(db, Invoice, payload.invoice_id, user.organization_id, "Invoice")
    if inv.status not in ("sent", "partially_paid"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only unpaid, sent invoices need a reminder")
    org = db.get(Organization, user.organization_id)
    draft = ai.reminder_draft(inv, org.name, payload.tone)
    return ReminderDraft(**draft, to_email=inv.customer.email)
