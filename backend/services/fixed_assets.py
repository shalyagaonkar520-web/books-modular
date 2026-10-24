"""Fixed asset register: monthly depreciation and disposal, posted to the ledger.

Buying the asset is normally booked on a bill or expense (Dr the asset
account). An asset owned before the books started can instead be brought in
against Opening Balance Adjustments. Depreciation runs month by month from
the depreciation start date: straight line spreads (cost - salvage) over the
useful life; declining balance takes the annual rate of the book value. It
never takes the book value below salvage. Disposal removes cost and
accumulated depreciation and books the gain or loss against the proceeds.
"""

from __future__ import annotations

import calendar
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import AssetDepreciation, BankAccount, FixedAsset, User
from backend.services import audit, bank, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.money import money
from backend.services.periods import add_months

ACCUMULATED = "1590"
DEPRECIATION_EXPENSE = "6950"
DISPOSAL_GAIN_LOSS = "4950"
OPENING_BALANCE = "3100"


def month_end(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def book_value(asset: FixedAsset) -> Decimal:
    return money(asset.cost - asset.accumulated_depreciation)


def monthly_amount(asset: FixedAsset) -> Decimal:
    """Depreciation for the next month, capped so book value never drops below salvage."""
    room = money(book_value(asset) - asset.salvage_value)
    if room <= 0:
        return Decimal("0")
    if asset.method == "declining":
        amount = money(book_value(asset) * asset.rate / Decimal("100") / Decimal("12"))
    else:
        amount = money((asset.cost - asset.salvage_value) / Decimal(asset.useful_life_months))
    return min(amount, room)


def next_period(asset: FixedAsset) -> date:
    last = asset.last_depreciation_date
    return month_end(add_months(last, 1)) if last else month_end(asset.depreciation_start)


def post_opening(db: Session, asset: FixedAsset, user: User) -> None:
    """Bring an asset owned before the books started in at cost (Dr asset, Cr opening balance)."""
    opening = get_account_by_code(db, asset.organization_id, OPENING_BALANCE)
    desc = f"Opening balance {asset.asset_number} {asset.name}"
    ledger.post_entry(
        db,
        asset.organization_id,
        asset.purchase_date,
        [(asset.asset_account_id, asset.cost, Decimal("0"), desc, None), (opening.id, Decimal("0"), asset.cost, desc, None)],
        "fixed_asset",
        asset.id,
        reference=asset.asset_number,
        created_by=user.id,
    )


def depreciate(db: Session, asset: FixedAsset, through: date, user: User) -> List[AssetDepreciation]:
    """Post every month of depreciation due up to ``through`` (month ends only)."""
    posted: List[AssetDepreciation] = []
    if asset.status != "active":
        return posted
    expense = asset.depreciation_account_id or get_account_by_code(db, asset.organization_id, DEPRECIATION_EXPENSE).id
    accumulated = asset.accumulated_account_id or get_account_by_code(db, asset.organization_id, ACCUMULATED).id
    period = next_period(asset)
    while period <= through:
        amount = monthly_amount(asset)
        if amount <= 0:
            asset.status = "fully_depreciated"
            break
        row = AssetDepreciation(organization_id=asset.organization_id, asset_id=asset.id, period_end=period, amount=amount)
        db.add(row)
        db.flush()
        desc = f"Depreciation {asset.asset_number} {asset.name} ({period.strftime('%b %Y')})"
        entry = ledger.post_entry(
            db,
            asset.organization_id,
            period,
            [(expense, amount, Decimal("0"), desc, None), (accumulated, Decimal("0"), amount, desc, None)],
            "depreciation",
            row.id,
            reference=asset.asset_number,
            created_by=user.id,
        )
        row.journal_entry_id = entry.id
        asset.accumulated_depreciation = money(asset.accumulated_depreciation + amount)
        asset.last_depreciation_date = period
        posted.append(row)
        if book_value(asset) <= asset.salvage_value:
            asset.status = "fully_depreciated"
            break
        period = month_end(add_months(period, 1))
    return posted


def undo_last(db: Session, asset: FixedAsset, user: User) -> AssetDepreciation:
    row = (
        db.execute(select(AssetDepreciation).where(AssetDepreciation.asset_id == asset.id).order_by(AssetDepreciation.period_end.desc()))
        .scalars()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No depreciation has been posted for this asset")
    if asset.status == "disposed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Undo the disposal first")
    ledger.reverse_entries_for_source(db, asset.organization_id, "depreciation", row.id, date.today(), user.id, "Depreciation undone")
    asset.accumulated_depreciation = money(asset.accumulated_depreciation - row.amount)
    previous = (
        db.execute(
            select(AssetDepreciation.period_end)
            .where(AssetDepreciation.asset_id == asset.id, AssetDepreciation.id != row.id)
            .order_by(AssetDepreciation.period_end.desc())
        )
        .scalars()
        .first()
    )
    asset.last_depreciation_date = previous
    asset.status = "active"
    db.delete(row)
    return row


def dispose(db: Session, asset: FixedAsset, on: date, proceeds: Decimal, bank_account_id: Optional[str], user: User) -> None:
    """Sell or scrap: Dr accumulated depreciation, Dr bank (proceeds); Cr asset at cost; the difference is the gain or loss."""
    if asset.status == "disposed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This asset is already disposed")
    if on < asset.purchase_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An asset cannot be disposed before it was bought")
    proceeds = money(proceeds)
    org_id = asset.organization_id
    accumulated = asset.accumulated_account_id or get_account_by_code(db, org_id, ACCUMULATED).id
    gain_loss = get_account_by_code(db, org_id, DISPOSAL_GAIN_LOSS)
    bank_acct = None
    if proceeds > 0:
        if not bank_account_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose the account the sale proceeds went into")
        bank_acct = db.get(BankAccount, bank_account_id)
        if bank_acct is None or bank_acct.organization_id != org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank account not found")
    desc = f"Disposal of {asset.asset_number} {asset.name}"
    lines = [(asset.asset_account_id, Decimal("0"), asset.cost, desc, None)]
    if asset.accumulated_depreciation > 0:
        lines.append((accumulated, asset.accumulated_depreciation, Decimal("0"), desc, None))
    if bank_acct:
        lines.append((bank_acct.ledger_account_id, proceeds, Decimal("0"), desc, None))
    result = money(proceeds - book_value(asset))  # positive = gain
    if result > 0:
        lines.append((gain_loss.id, Decimal("0"), result, f"Gain on {desc.lower()}", None))
    elif result < 0:
        lines.append((gain_loss.id, -result, Decimal("0"), f"Loss on {desc.lower()}", None))
    entry = ledger.post_entry(db, org_id, on, lines, "asset_disposal", asset.id, reference=asset.asset_number, created_by=user.id)
    if bank_acct:
        bank.record_movement(
            db,
            bank_acct,
            on,
            "deposit",
            proceeds,
            desc,
            "asset_disposal",
            asset.id,
            user.id,
            asset.asset_number,
            asset.asset_account_id,
            entry.id,
        )
    asset.status = "disposed"
    asset.disposed_on = on
    asset.disposal_amount = proceeds
    audit.record(db, user, "update", "fixed_asset", asset.id, f"{desc} for {proceeds} ({'gain' if result >= 0 else 'loss'} {abs(result)})")


def undo_disposal(db: Session, asset: FixedAsset, user: User) -> None:
    if asset.status != "disposed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This asset is not disposed")
    ledger.reverse_entries_for_source(db, asset.organization_id, "asset_disposal", asset.id, date.today(), user.id, "Disposal undone")
    bank.remove_movements(db, "asset_disposal", asset.id)
    asset.status = "fully_depreciated" if book_value(asset) <= asset.salvage_value else "active"
    asset.disposed_on = None
    asset.disposal_amount = None
