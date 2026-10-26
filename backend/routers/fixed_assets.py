"""Fixed asset register, depreciation runs and disposal."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user, require_financial_write
from backend.models import Account, AssetDepreciation, FixedAsset, User
from backend.schemas.common import MAX_MONEY, APIModel, Message
from backend.services import audit, bank, fixed_assets, ledger, numbering
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/fixed-assets", tags=["Accountant"])


class AssetCreate(APIModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=60)
    asset_account_id: Optional[str] = None  # default 1500 Furniture and Equipment
    depreciation_account_id: Optional[str] = None  # default 6950
    accumulated_account_id: Optional[str] = None  # default 1590
    purchase_date: date
    depreciation_start: Optional[date] = None  # default: purchase date
    cost: Decimal = Field(gt=0, le=MAX_MONEY)
    salvage_value: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    method: Literal["straight_line", "declining"] = "straight_line"
    useful_life_months: int = Field(default=60, ge=1, le=600)
    # Declining balance: percent of book value per year.
    rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    # Owned before the books started: post it in against opening balances.
    post_opening_balance: bool = False

    @model_validator(mode="after")
    def _check(self):
        if self.salvage_value >= self.cost:
            raise ValueError("Salvage value must be less than the cost")
        if self.method == "declining" and self.rate <= 0:
            raise ValueError("Declining balance needs a yearly rate")
        if self.depreciation_start and self.depreciation_start < self.purchase_date:
            raise ValueError("Depreciation cannot start before the purchase date")
        return self


class AssetOut(APIModel):
    id: str
    asset_number: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    asset_account_id: str
    asset_account_name: str
    depreciation_account_id: Optional[str] = None
    accumulated_account_id: Optional[str] = None
    purchase_date: date
    depreciation_start: date
    cost: Decimal
    salvage_value: Decimal
    method: str
    useful_life_months: int
    rate: Decimal
    accumulated_depreciation: Decimal
    book_value: Decimal
    monthly_depreciation: Decimal
    last_depreciation_date: Optional[date] = None
    status: str
    disposed_on: Optional[date] = None
    disposal_amount: Optional[Decimal] = None


class DepreciationOut(APIModel):
    id: str
    period_end: date
    amount: Decimal


class RunRequest(APIModel):
    through: Optional[date] = None
    asset_ids: Optional[List[str]] = None


class RunResult(APIModel):
    posted: int
    amount: Decimal
    assets: int


class DisposeRequest(APIModel):
    date: date
    proceeds: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    bank_account_id: Optional[str] = None


def _out(db: Session, a: FixedAsset) -> AssetOut:
    account = db.get(Account, a.asset_account_id)
    return AssetOut(
        id=a.id,
        asset_number=a.asset_number,
        name=a.name,
        description=a.description,
        category=a.category,
        asset_account_id=a.asset_account_id,
        asset_account_name=account.name if account else "",
        depreciation_account_id=a.depreciation_account_id,
        accumulated_account_id=a.accumulated_account_id,
        purchase_date=a.purchase_date,
        depreciation_start=a.depreciation_start,
        cost=a.cost,
        salvage_value=a.salvage_value,
        method=a.method,
        useful_life_months=a.useful_life_months,
        rate=a.rate,
        accumulated_depreciation=a.accumulated_depreciation,
        book_value=fixed_assets.book_value(a),
        monthly_depreciation=fixed_assets.monthly_amount(a) if a.status == "active" else Decimal("0"),
        last_depreciation_date=a.last_depreciation_date,
        status=a.status,
        disposed_on=a.disposed_on,
        disposal_amount=a.disposal_amount,
    )


def _account(db: Session, org_id: str, account_id: Optional[str], allowed_types: tuple, label: str) -> Optional[str]:
    if not account_id:
        return None
    acct = get_or_404(db, Account, account_id, org_id, "Account")
    if acct.type not in allowed_types:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} must be an {' or '.join(allowed_types)} account")
    # Bank, cash, receivable, payable and tax accounts are kept by their own registers.
    if acct.subtype in _CONTROL_SUBTYPES or bank.is_bank_ledger_account(db, org_id, acct.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{acct.name} is a control account and cannot be used for {label.lower()}")
    return acct.id


_CONTROL_SUBTYPES = {"bank", "cash", "credit_card", "accounts_receivable", "accounts_payable", "tax"}


@router.get("", response_model=List[AssetOut])
def list_assets(
    status_filter: Optional[str] = Query(None, alias="status"), user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    stmt = select(FixedAsset).where(FixedAsset.organization_id == user.organization_id)
    if status_filter:
        stmt = stmt.where(FixedAsset.status == status_filter)
    return [_out(db, a) for a in db.execute(stmt.order_by(FixedAsset.purchase_date.desc(), FixedAsset.asset_number.desc())).scalars()]


@router.post("/run-depreciation", response_model=RunResult)
def run_depreciation(payload: RunRequest, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    """Post monthly depreciation for active assets up to a month end (default: the last completed month)."""
    today = date.today()
    through = payload.through or date(today.year, today.month, 1) - timedelta(days=1)
    stmt = select(FixedAsset).where(FixedAsset.organization_id == user.organization_id, FixedAsset.status == "active")
    if payload.asset_ids:
        stmt = stmt.where(FixedAsset.id.in_(payload.asset_ids))
    posted, total, touched = 0, Decimal("0"), 0
    for asset in db.execute(stmt).scalars().all():
        rows = fixed_assets.depreciate(db, asset, through, user)
        if rows:
            touched += 1
            posted += len(rows)
            total += sum((r.amount for r in rows), Decimal("0"))
    if posted:
        audit.record(
            db,
            user,
            "create",
            "depreciation",
            None,
            f"Posted {posted} month(s) of depreciation through {through.isoformat()} ({money(total)})",
        )
    db.commit()
    return RunResult(posted=posted, amount=money(total), assets=touched)


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(db, get_or_404(db, FixedAsset, asset_id, user.organization_id, "Asset"))


@router.get("/{asset_id}/schedule", response_model=List[DepreciationOut])
def depreciation_history(asset_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asset = get_or_404(db, FixedAsset, asset_id, user.organization_id, "Asset")
    rows = db.execute(
        select(AssetDepreciation).where(AssetDepreciation.asset_id == asset.id).order_by(AssetDepreciation.period_end)
    ).scalars()
    return [DepreciationOut(id=r.id, period_end=r.period_end, amount=r.amount) for r in rows]


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(payload: AssetCreate, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    org_id = user.organization_id
    asset = FixedAsset(
        organization_id=org_id,
        asset_number=numbering.next_number(db, org_id, "fixed_asset"),
        name=payload.name,
        description=payload.description,
        category=payload.category,
        asset_account_id=_account(db, org_id, payload.asset_account_id, ("asset",), "The asset account")
        or get_account_by_code(db, org_id, "1500").id,
        depreciation_account_id=_account(db, org_id, payload.depreciation_account_id, ("expense",), "The depreciation account"),
        accumulated_account_id=_account(db, org_id, payload.accumulated_account_id, ("asset",), "The accumulated depreciation account"),
        purchase_date=payload.purchase_date,
        depreciation_start=payload.depreciation_start or payload.purchase_date,
        cost=money(payload.cost),
        salvage_value=money(payload.salvage_value),
        method=payload.method,
        useful_life_months=payload.useful_life_months,
        rate=payload.rate,
        accumulated_depreciation=Decimal("0"),
        status="active",
        created_by=user.id,
    )
    db.add(asset)
    db.flush()
    if payload.post_opening_balance:
        fixed_assets.post_opening(db, asset, user)
    audit.record(db, user, "create", "fixed_asset", asset.id, f"Added asset {asset.asset_number} {asset.name} ({asset.cost})")
    db.commit()
    return _out(db, asset)


@router.post("/{asset_id}/undo-depreciation", response_model=AssetOut)
def undo_depreciation(asset_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    asset = get_or_404(db, FixedAsset, asset_id, user.organization_id, "Asset")
    row = fixed_assets.undo_last(db, asset, user)
    audit.record(
        db, user, "delete", "depreciation", asset.id, f"Undid depreciation of {asset.asset_number} for {row.period_end.isoformat()}"
    )
    db.commit()
    return _out(db, asset)


@router.post("/{asset_id}/dispose", response_model=AssetOut)
def dispose_asset(asset_id: str, payload: DisposeRequest, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    asset = get_or_404(db, FixedAsset, asset_id, user.organization_id, "Asset")
    # Depreciate up to the month before disposal so the gain or loss is right.
    if asset.status == "active":
        before = date(payload.date.year, payload.date.month, 1)
        fixed_assets.depreciate(db, asset, before - timedelta(days=1), user)
    fixed_assets.dispose(db, asset, payload.date, payload.proceeds, payload.bank_account_id, user)
    db.commit()
    return _out(db, asset)


@router.post("/{asset_id}/undo-disposal", response_model=AssetOut)
def undo_disposal(asset_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    asset = get_or_404(db, FixedAsset, asset_id, user.organization_id, "Asset")
    fixed_assets.undo_disposal(db, asset, user)
    audit.record(db, user, "update", "fixed_asset", asset.id, f"Disposal of {asset.asset_number} undone")
    db.commit()
    return _out(db, asset)


@router.delete("/{asset_id}", response_model=Message)
def delete_asset(asset_id: str, user: User = Depends(require_financial_write), db: Session = Depends(get_db)):
    asset = get_or_404(db, FixedAsset, asset_id, user.organization_id, "Asset")
    if asset.accumulated_depreciation > 0 or asset.status == "disposed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Undo its depreciation and disposal before deleting an asset")
    ledger.reverse_entries_for_source(db, asset.organization_id, "fixed_asset", asset.id, date.today(), user.id, "Asset deleted")
    number = asset.asset_number
    db.delete(asset)
    audit.record(db, user, "delete", "fixed_asset", asset_id, f"Deleted asset {number}")
    db.commit()
    return Message(message=f"Asset {number} deleted")
