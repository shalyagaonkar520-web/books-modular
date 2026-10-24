"""Currencies the organization deals in, and their exchange rates against the base currency."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user, require_admin
from backend.models import Bill, Contact, Invoice, OrgCurrency, User
from backend.schemas.common import APIModel, Message
from backend.services import audit, fx

router = APIRouter(prefix="/api/currencies", tags=["Settings"])


class CurrencyOut(APIModel):
    code: str
    name: str
    symbol: str
    exchange_rate: Optional[Decimal] = None
    is_base: bool
    updated_at: Optional[datetime] = None


class CurrencyIn(APIModel):
    name: Optional[str] = Field(default=None, max_length=60)
    symbol: Optional[str] = Field(default=None, max_length=8)
    # Base currency per 1 unit of this currency.
    exchange_rate: Decimal = Field(gt=0, le=Decimal("1000000"))


class CatalogEntry(APIModel):
    code: str
    name: str
    symbol: str


def _code(code: str) -> str:
    code = code.strip().upper()
    if len(code) != 3 or not code.isalpha():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A currency code is three letters, e.g. USD")
    return code


@router.get("/catalog", response_model=List[CatalogEntry])
def catalog():
    return [CatalogEntry(code=c, name=n, symbol=s) for c, (n, s) in fx.COMMON_CURRENCIES.items()]


@router.get("", response_model=List[CurrencyOut])
def list_currencies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    base = fx.base_currency(db, user.organization_id)
    name, symbol = fx.COMMON_CURRENCIES.get(base, (base, base))
    out = [CurrencyOut(code=base, name=name, symbol=symbol, exchange_rate=Decimal("1"), is_base=True)]
    rows = db.execute(select(OrgCurrency).where(OrgCurrency.organization_id == user.organization_id).order_by(OrgCurrency.code)).scalars()
    out += [
        CurrencyOut(code=r.code, name=r.name, symbol=r.symbol, exchange_rate=r.exchange_rate, is_base=False, updated_at=r.updated_at)
        for r in rows
        if r.code != base
    ]
    return out


@router.put("/{code}", response_model=CurrencyOut)
def save_currency(code: str, payload: CurrencyIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    code = _code(code)
    if code == fx.base_currency(db, user.organization_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The base currency's rate is always 1")
    row = db.execute(
        select(OrgCurrency).where(OrgCurrency.organization_id == user.organization_id, OrgCurrency.code == code)
    ).scalar_one_or_none()
    default_name, default_symbol = fx.COMMON_CURRENCIES.get(code, (code, code))
    if row is None:
        row = OrgCurrency(
            organization_id=user.organization_id, code=code, name=payload.name or default_name, symbol=payload.symbol or default_symbol
        )
        db.add(row)
    else:
        row.name = payload.name or row.name
        row.symbol = payload.symbol or row.symbol
    row.exchange_rate = fx.rate(payload.exchange_rate)
    audit.record(db, user, "update", "currency", code, f"Exchange rate for {code} set to {row.exchange_rate}")
    db.commit()
    db.refresh(row)
    return CurrencyOut(
        code=row.code, name=row.name, symbol=row.symbol, exchange_rate=row.exchange_rate, is_base=False, updated_at=row.updated_at
    )


@router.delete("/{code}", response_model=Message)
def delete_currency(code: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    code = _code(code)
    org_id = user.organization_id
    in_use = (
        db.execute(
            select(func.count()).select_from(Contact).where(Contact.organization_id == org_id, Contact.currency == code)
        ).scalar_one()
        + db.execute(
            select(func.count()).select_from(Invoice).where(Invoice.organization_id == org_id, Invoice.currency == code)
        ).scalar_one()
        + db.execute(select(func.count()).select_from(Bill).where(Bill.organization_id == org_id, Bill.currency == code)).scalar_one()
    )
    if in_use:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{code} is used by contacts or documents and cannot be removed")
    row = db.execute(select(OrgCurrency).where(OrgCurrency.organization_id == org_id, OrgCurrency.code == code)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Currency not found")
    db.delete(row)
    audit.record(db, user, "delete", "currency", code, f"Removed currency {code}")
    db.commit()
    return Message(message=f"{code} removed")
