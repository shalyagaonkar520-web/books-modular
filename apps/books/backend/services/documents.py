"""Shared line-item math for invoices and bills."""

from __future__ import annotations

from decimal import Decimal
from typing import Dict, List, Literal, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Account, Contact, Item
from backend.schemas.sales import LineInput
from backend.services import bank
from backend.services.money import money, qty
from backend.services.tenancy import get_or_404

DocumentKind = Literal["invoice", "bill"]

# Accounts that only the posting engine itself should touch. A line posted
# straight to one of these would move receivables, payables, GST or a bank
# balance without the sub-ledger (documents, payments, bank register) that is
# supposed to explain it.
CONTROL_CODES = {"1100", "1300", "2000", "2100"}
CONTROL_SUBTYPES = {"accounts_receivable", "accounts_payable", "tax", "bank", "cash", "credit_card"}
BILL_ACCOUNT_TYPES = {"expense", "asset"}
INVOICE_ACCOUNT_TYPES = {"income"}


class ComputedLine:
    def __init__(self, spec: LineInput, item: Optional[Item], account: Optional[Account]):
        self.spec = spec
        self.item = item
        self.account = account
        self.quantity = qty(spec.quantity)
        self.rate = money(spec.rate)
        self.tax_rate = Decimal(str(spec.tax_rate)).quantize(Decimal("0.01"))
        self.amount = money(self.quantity * self.rate)
        # This line's share of a document-level discount. GST is charged on
        # the value actually billed, so tax is computed after it is taken off.
        self.discount_share = Decimal("0")
        self.tax_amount = self._tax()

    def _tax(self) -> Decimal:
        return money((self.amount - self.discount_share) * self.tax_rate / Decimal("100"))

    def apply_discount(self, share: Decimal) -> None:
        self.discount_share = money(share)
        self.tax_amount = self._tax()


def _check_line_account(account: Account, item: Optional[Item], kind: DocumentKind, position: int, restricted: set) -> None:
    label = f"Line {position}: account {account.code} {account.name}"
    if not account.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} is inactive")
    if kind == "invoice":
        if account.type not in INVOICE_ACCOUNT_TYPES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} is not an income account")
        return
    if account.type not in BILL_ACCOUNT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} must be an expense, cost of goods or asset account")
    if account.code in CONTROL_CODES or account.subtype in CONTROL_SUBTYPES or account.id in restricted:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{label} is a control, tax or bank account and cannot be charged directly on a bill",
        )
    if account.subtype == "inventory" and not (item and item.track_inventory):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} can only be used for items that track inventory")


def _restricted_account_ids(db: Session, org_id: str) -> set:
    """Bank-register ledgers plus any account a contact uses as its own AR/AP."""
    contact_ledgers = set(
        db.execute(
            select(Contact.ledger_account_id).where(Contact.organization_id == org_id, Contact.ledger_account_id.is_not(None))
        ).scalars()
    )
    return bank.bank_ledger_account_ids(db, org_id) | contact_ledgers


def compute_lines(
    db: Session,
    org_id: str,
    lines: Sequence[LineInput],
    kind: DocumentKind = "invoice",
    discount: Optional[Decimal] = None,
) -> Tuple[List[ComputedLine], Decimal, Decimal]:
    """Price each line and total the document.

    ``kind`` decides which ledger accounts a line may name: invoices post to
    income accounts only; bills to expense/COGS/asset accounts that are not a
    control, tax or bank account. ``discount`` is the document-level discount;
    it is spread across the lines in proportion to their value before GST is
    worked out, so tax is charged on the discounted amount.
    """
    computed: List[ComputedLine] = []
    subtotal = Decimal("0")
    restricted: Optional[set] = None
    for position, spec in enumerate(lines, start=1):
        item = get_or_404(db, Item, spec.item_id, org_id, "Item") if spec.item_id else None
        account = get_or_404(db, Account, spec.account_id, org_id, "Account") if spec.account_id else None
        if account is not None:
            if restricted is None:
                restricted = _restricted_account_ids(db, org_id) if kind == "bill" else set()
            _check_line_account(account, item, kind, position, restricted)
        # Fallback: if description omitted but item is provided, use item's name
        if not spec.description and item:
            spec.description = item.sales_description or item.name
        # With no item to borrow a name from there is nothing to print on the
        # document, so ask for one rather than saving a blank line.
        if not spec.description:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Line {position} needs a description, or an item to take one from.",
            )
        line = ComputedLine(spec, item, account)
        computed.append(line)
        subtotal += line.amount
    subtotal = money(subtotal)

    discount = money(discount or 0)
    if discount > subtotal:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Discount cannot exceed the subtotal")
    if discount > 0:
        # Proportional split, with the rounding remainder on the last line that
        # has any value so the shares always add back up to the discount.
        remaining = discount
        valued = [line for line in computed if line.amount > 0]
        for index, line in enumerate(valued):
            share = remaining if index == len(valued) - 1 else money(discount * line.amount / subtotal)
            share = min(share, line.amount)
            line.apply_discount(share)
            remaining -= share
    tax_total = money(sum((line.tax_amount for line in computed), Decimal("0")))
    return computed, subtotal, tax_total


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
