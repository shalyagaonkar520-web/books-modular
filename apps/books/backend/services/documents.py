"""Shared line-item math for invoices and bills."""
from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models import Account, Item
from backend.schemas.sales import LineInput
from backend.services.money import money, qty
from backend.services.tenancy import get_or_404


class ComputedLine:
    def __init__(self, spec: LineInput, item: Optional[Item], account: Optional[Account]):
        self.spec = spec
        self.item = item
        self.account = account
        self.quantity = qty(spec.quantity)
        self.rate = money(spec.rate)
        self.tax_rate = Decimal(str(spec.tax_rate)).quantize(Decimal("0.01"))
        self.amount = money(self.quantity * self.rate)
        self.tax_amount = money(self.amount * self.tax_rate / Decimal("100"))


def compute_lines(db: Session, org_id: str, lines: Sequence[LineInput]) -> Tuple[List[ComputedLine], Decimal, Decimal]:
    computed: List[ComputedLine] = []
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    for spec in lines:
        item = get_or_404(db, Item, spec.item_id, org_id, "Item") if spec.item_id else None
        account = get_or_404(db, Account, spec.account_id, org_id, "Account") if spec.account_id else None
        line = ComputedLine(spec, item, account)
        computed.append(line)
        subtotal += line.amount
        tax_total += line.tax_amount
    return computed, money(subtotal), money(tax_total)


def totals(subtotal: Decimal, discount: Decimal, tax_total: Decimal) -> Decimal:
    discount = money(discount)
    if discount > subtotal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Discount cannot exceed the subtotal")
    return money(subtotal - discount + tax_total)


def group_by_account(pairs: Sequence[Tuple[str, Decimal]]) -> Dict[str, Decimal]:
    grouped: Dict[str, Decimal] = {}
    for account_id, amount in pairs:
        grouped[account_id] = grouped.get(account_id, Decimal("0")) + amount
    return grouped
