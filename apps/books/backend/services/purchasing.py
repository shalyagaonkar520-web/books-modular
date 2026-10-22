"""Bills: their journal postings and the stock they receive at weighted average cost.

Shared by the bills router and the Excel import, so neither imports the other.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Bill, Item, User
from backend.services import inventory, ledger
from backend.services.chart_of_accounts import get_account_by_code
from backend.services.documents import group_by_account
from backend.services.money import money, qty


def _stock_on_hand(db: Session, item: Item) -> Decimal:
    return qty(db.execute(select(Item.stock_on_hand).where(Item.id == item.id)).scalar_one())


def _receive_at_average_cost(item: Item, on_hand: Decimal, quantity: Decimal, rate: Decimal) -> None:
    """Weighted-average costing: fold a receipt into the item's unit cost.

    Overwriting cost_price with the latest purchase rate revalued every unit
    already on the shelf at that rate, so COGS on the next sale was wrong.
    """
    if rate <= 0 or quantity <= 0:
        return
    if on_hand > 0:
        item.cost_price = money((on_hand * money(item.cost_price) + quantity * rate) / (on_hand + quantity))
    else:
        item.cost_price = money(rate)


def _unreceive_at_average_cost(item: Item, on_hand: Decimal, quantity: Decimal, rate: Decimal) -> None:
    """Undo _receive_at_average_cost when a bill is voided, edited or deleted.

    Sales in between relieve stock at the average cost and leave it unchanged,
    so taking the receipt back out restores the earlier average. When that
    cannot be worked out (no stock would remain, or the result would be
    negative) the current cost is left as it is rather than corrupted.
    """
    if rate <= 0 or quantity <= 0:
        return
    remaining = on_hand - quantity
    if remaining <= 0:
        return
    value = on_hand * money(item.cost_price) - quantity * rate
    if value < 0:
        return
    item.cost_price = money(value / remaining)


def post_bill(db: Session, bill: Bill, user: User) -> None:
    """Journal: Dr expense/inventory accounts, Dr Input GST; Cr AP total, Cr Purchase Discounts."""
    org_id = bill.organization_id
    # As with invoices, a vendor may be pointed at its own payables account.
    ap = bill.vendor.ledger_account or get_account_by_code(db, org_id, "2000")
    input_gst = get_account_by_code(db, org_id, "1300")
    inventory_acct = get_account_by_code(db, org_id, "1200")
    default_expense = get_account_by_code(db, org_id, "5000")
    discount_acct = get_account_by_code(db, org_id, "5900")

    debit_pairs = []
    for line in bill.lines:
        item = line.item
        if item and item.track_inventory:
            debit_pairs.append((inventory_acct.id, line.amount))
            on_hand = _stock_on_hand(db, item)
            inventory.adjust_stock(
                db, item, line.quantity, bill.date, "bill_stock", bill.id, f"Received on {bill.bill_number}", user.id, rate=Decimal("0")
            )
            _receive_at_average_cost(item, on_hand, qty(line.quantity), money(line.rate))
        else:
            account_id = line.account_id or (item.purchase_account_id if item and item.purchase_account_id else default_expense.id)
            debit_pairs.append((account_id, line.amount))
    lines = []
    for account_id, amount in group_by_account(debit_pairs).items():
        lines.append((account_id, amount, Decimal("0"), f"Bill {bill.bill_number}", bill.vendor_id))
    if bill.tax_total > 0:
        lines.append((input_gst.id, bill.tax_total, Decimal("0"), f"GST on {bill.bill_number}", bill.vendor_id))
    if bill.discount_amount > 0:
        lines.append((discount_acct.id, Decimal("0"), bill.discount_amount, f"Discount on {bill.bill_number}", bill.vendor_id))
    lines.append((ap.id, Decimal("0"), bill.total, f"Bill {bill.bill_number}", bill.vendor_id))
    ledger.post_entry(
        db, org_id, bill.date, lines, "bill", bill.id, reference=bill.vendor_bill_number or bill.bill_number, created_by=user.id
    )


def unpost_bill(db: Session, bill: Bill, user: User, reason: str) -> None:
    today = date.today()
    ledger.reverse_entries_for_source(db, bill.organization_id, "bill", bill.id, today, user.id, reason)
    for line in bill.lines:
        if line.item and line.item.track_inventory:
            _unreceive_at_average_cost(line.item, _stock_on_hand(db, line.item), qty(line.quantity), money(line.rate))
            inventory.adjust_stock(
                db,
                line.item,
                -line.quantity,
                today,
                "bill_stock",
                bill.id,
                f"{reason} {bill.bill_number}",
                user.id,
                rate=Decimal("0"),
                allow_negative=True,
            )
