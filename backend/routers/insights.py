"""Insights: anomaly alerts, customer credit risk and the daily digest."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_financial_read
from backend.models import User
from backend.schemas.common import APIModel
from backend.services import ai, insights

router = APIRouter(prefix="/api/insights", tags=["Insights"])


class AlertOut(APIModel):
    kind: str
    severity: str
    title: str
    detail: str
    doc_type: Optional[str] = None
    doc_id: Optional[str] = None
    amount: Optional[Decimal] = None


class CreditRiskOut(APIModel):
    customer_id: str
    customer_name: str
    score: int
    grade: str
    outstanding: Decimal
    overdue: Decimal
    max_days_overdue: int
    average_days_late: Optional[Decimal] = None
    invoices_paid: int
    on_time_percent: Optional[Decimal] = None
    advice: str
    reasons: List[str]


class DigestOut(APIModel):
    date: date
    headline: Optional[str] = None
    lines: List[str]


@router.get("/anomalies", response_model=List[AlertOut])
def anomalies(user: User = Depends(require_financial_read), db: Session = Depends(get_db)):
    """Possible duplicates, unusual amounts, GST gaps, overdrawn accounts and forgotten drafts."""
    return [AlertOut(**a.__dict__) for a in insights.anomalies(db, user.organization_id)]


@router.get("/credit-risk", response_model=List[CreditRiskOut])
def credit_risk(user: User = Depends(require_financial_read), db: Session = Depends(get_db)):
    """Every customer scored 0-100 on how they pay, riskiest first."""
    return [CreditRiskOut(**r.__dict__) for r in insights.credit_risk(db, user.organization_id)]


@router.get("/digest", response_model=DigestOut)
def digest(
    day: Optional[date] = Query(default=None, description="Day to summarise; default yesterday"),
    with_ai: bool = Query(default=False, alias="withAi"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    """The daily digest that scheduled 'Daily digest' emails send."""
    day = day or (date.today() - timedelta(days=1))
    lines = insights.digest(db, user.organization_id, day)
    return DigestOut(date=day, headline=ai.digest_headline(lines) if with_ai else None, lines=lines)
