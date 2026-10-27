"""Point of Sale: the counter where a cashier scans products and takes payment.

Every sale becomes an ordinary Books invoice, already paid, so stock, cost of
goods, GST and reports all go through the existing invoice and payment code.
A return is a credit note against that invoice, refunded at once.
"""

from __future__ import annotations

import datetime as dt
import secrets
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_admin, require_write
from backend.models import (
    BankAccount,
    Contact,
    ContactRefund,
    CreditNote,
    Invoice,
    Item,
    Organization,
    PosSale,
    PosScan,
    PosScannerSession,
    User,
)
from backend.routers import credit_notes as credit_notes_router
from backend.routers.invoices import create_invoice_record
from backend.routers.payments import _apply_invoice_payment, _record_customer_payment
from backend.schemas import validators
from backend.schemas.common import MAX_MONEY, MAX_QUANTITY, APIModel
from backend.schemas.documents_flow import CreditNoteCreate, RefundCreate
from backend.schemas.sales import CustomerPaymentCreate, InvoiceCreate, LineInput
from backend.security import hash_token
from backend.services import audit, bank, credits, doc_flow, numbering, upi
from backend.services.doc_flow import CREDIT_NOTE
from backend.services.money import money, qty
from backend.services.ratelimit import RateLimiter
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/pos", tags=["Point of Sale"])

WALK_IN_NAME = "Walk-in Customer"
PosMode = Literal["cash", "upi", "card"]
# How many sales one day's list returns; a busy counter does a few hundred.
MAX_SALES_PER_DAY_LIST = 1000


class PosItem(APIModel):
    id: str
    name: str
    sku: str
    barcode: Optional[str] = None
    unit: str
    selling_price: Decimal
    tax_rate: Decimal
    hsn_sac: Optional[str] = None
    track_inventory: bool
    stock_on_hand: Decimal
    reorder_level: Decimal
    image_url: Optional[str] = None


def find_by_code(db: Session, org_id: str, code: str) -> Optional[Item]:
    """The active item a scanned code refers to: its barcode first, then its SKU (any case)."""
    code = code.strip()
    if not code:
        return None
    active = (Item.organization_id == org_id, Item.is_active.is_(True))
    item = db.execute(select(Item).where(*active, Item.barcode == code)).scalars().first()
    if item is None:
        item = db.execute(select(Item).where(*active, func.upper(Item.sku) == code.upper())).scalars().first()
    return item


@router.get("/lookup", response_model=PosItem)
def lookup(code: str = Query(min_length=1, max_length=64), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The item for a scanned barcode (or typed SKU)."""
    item = find_by_code(db, user.organization_id, code)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No item with this barcode")
    return PosItem.model_validate(item)


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class PosLineIn(APIModel):
    item_id: str
    quantity: Decimal = Field(gt=0, le=MAX_QUANTITY)


class PosSaleCreate(APIModel):
    # Made by the till before the first attempt and reused on every retry.
    client_sale_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    lines: List[PosLineIn] = Field(min_length=1, max_length=500)
    payment_mode: PosMode = "cash"
    # Cash handed over; change is given from it. Ignored for UPI and card.
    amount_tendered: Optional[Decimal] = Field(default=None, ge=0, le=MAX_MONEY)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, le=MAX_MONEY)
    reference: Optional[str] = Field(default=None, max_length=120)
    # A known customer; null = the Walk-in Customer.
    customer_id: Optional[str] = None
    # The till's own date (its time zone); null = today on the server.
    date: Optional[dt.date] = None


class PosReturnLineIn(APIModel):
    item_id: str
    quantity: Decimal = Field(gt=0, le=MAX_QUANTITY)


class PosReturnCreate(APIModel):
    # Made by the till, so a retried return does not refund twice.
    client_return_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    lines: List[PosReturnLineIn] = Field(min_length=1, max_length=500)
    reason: Optional[str] = Field(default=None, max_length=120)
    date: Optional[dt.date] = None


class PosSaleLine(APIModel):
    item_id: Optional[str] = None
    name: str
    quantity: Decimal
    returned_quantity: Decimal
    rate: Decimal
    tax_rate: Decimal
    amount: Decimal
    tax_amount: Decimal


class PosReturnOut(APIModel):
    credit_note_id: str
    credit_note_number: str
    date: date
    total: Decimal
    refund_number: Optional[str] = None


class PosReceipt(APIModel):
    organization_name: str
    gstin: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    header: Optional[str] = None
    footer: Optional[str] = None


class PosSaleListItem(APIModel):
    id: str
    client_sale_id: str
    invoice_id: str
    invoice_number: str
    date: date
    created_at: str
    customer_name: str
    mode: str
    total: Decimal
    returned_amount: Decimal
    items_count: Decimal
    cashier_name: Optional[str] = None


class PosSaleOut(PosSaleListItem):
    payment_id: Optional[str] = None
    payment_number: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_total: Decimal
    tendered: Decimal
    change_due: Decimal
    reference: Optional[str] = None
    lines: List[PosSaleLine]
    returns: List[PosReturnOut]
    receipt: PosReceipt


class PosModeTotal(APIModel):
    mode: str
    count: int
    total: Decimal
    refunds: Decimal


class PosCashierTotal(APIModel):
    cashier_id: Optional[str] = None
    name: str
    count: int
    total: Decimal


class PosTopItem(APIModel):
    item_id: str
    name: str
    quantity: Decimal
    amount: Decimal


class PosSummary(APIModel):
    date: date
    sales_count: int
    gross_sales: Decimal
    tax_total: Decimal
    returns_total: Decimal
    net_sales: Decimal
    items_sold: Decimal
    average_bill: Decimal
    # Cash that should be in the drawer from the counter: cash sales less cash refunds.
    cash_expected: Decimal
    by_mode: List[PosModeTotal]
    by_cashier: List[PosCashierTotal]
    top_items: List[PosTopItem]


class PosSettings(APIModel):
    bank_account_id: Optional[str] = None
    allow_negative_stock: bool = False
    receipt_header: Optional[str] = Field(default=None, max_length=500)
    receipt_footer: Optional[str] = Field(default=None, max_length=500)

    @field_validator("bank_account_id", "receipt_header", "receipt_footer")
    @classmethod
    def _blank_is_none(cls, value: Optional[str]) -> Optional[str]:
        value = (value or "").strip()
        return value or None


class PosSettingsOut(PosSettings):
    bank_account_name: Optional[str] = None
    cash_account_id: Optional[str] = None
    cash_account_name: Optional[str] = None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _org(db: Session, user: User) -> Organization:
    return db.get(Organization, user.organization_id)


def _cash_account(db: Session, org_id: str) -> BankAccount:
    """The cash drawer: the organization's (primary) active cash account, Petty Cash for a new one."""
    acct = (
        db.execute(
            select(BankAccount)
            .where(BankAccount.organization_id == org_id, BankAccount.type == "cash", BankAccount.is_active.is_(True))
            .order_by(BankAccount.is_primary.desc(), BankAccount.created_at, BankAccount.id)
        )
        .scalars()
        .first()
    )
    if acct is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add a cash account (Banking > Add account > Cash) for the counter first")
    return acct


def _usable_pos_bank(db: Session, org: Organization) -> Optional[BankAccount]:
    """The account set for UPI / card takings, when it can still take them."""
    if not org.pos_bank_account_id:
        return None
    acct = db.get(BankAccount, org.pos_bank_account_id)
    if acct is None or acct.organization_id != org.id or not acct.is_active:
        return None
    return acct


def _account_for(db: Session, org: Organization, mode: str) -> BankAccount:
    if mode != "cash":
        acct = _usable_pos_bank(db, org)
        if acct is not None:
            return acct
    return _cash_account(db, org.id)


def _walk_in_customer(db: Session, org_id: str) -> Contact:
    found = (
        db.execute(
            select(Contact)
            .where(Contact.organization_id == org_id, Contact.type == "customer", Contact.display_name == WALK_IN_NAME)
            .order_by(Contact.created_at, Contact.id)
        )
        .scalars()
        .first()
    )
    if found is not None:
        if not found.is_active:
            found.is_active = True
        return found
    contact = Contact(
        organization_id=org_id,
        type="customer",
        contact_type="individual",
        display_name=WALK_IN_NAME,
        gst_treatment="consumer",
        payment_terms_days=0,
    )
    db.add(contact)
    db.flush()
    return contact


def _sale_date(given: Optional[date]) -> date:
    today = date.today()
    if given is None:
        return today
    # The till's day can be a day either side of the server's (time zones).
    if abs((given - today).days) > 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A counter sale is dated today")
    return given


def _stock_error(items: Dict[str, Item], wanted: Dict[str, Decimal]) -> Optional[str]:
    short = []
    for item_id, quantity in wanted.items():
        item = items[item_id]
        if item.track_inventory and qty(item.stock_on_hand) < quantity:
            short.append(f"{item.name}: {qty(item.stock_on_hand).normalize():f} {item.unit} in stock, {quantity.normalize():f} on the bill")
    return "Not enough stock. " + "; ".join(short) if short else None


def _load_sale(db: Session, org_id: str, sale_id: str) -> PosSale:
    sale = db.execute(
        select(PosSale)
        .where(PosSale.id == sale_id, PosSale.organization_id == org_id)
        .options(selectinload(PosSale.invoice).selectinload(Invoice.lines), selectinload(PosSale.payment))
    ).scalar_one_or_none()
    if sale is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sale not found")
    return sale


def _returns_of(db: Session, sale: PosSale) -> List[CreditNote]:
    return (
        db.execute(
            select(CreditNote)
            .where(
                CreditNote.organization_id == sale.organization_id,
                CreditNote.invoice_id == sale.invoice_id,
                CreditNote.status != "void",
            )
            .options(selectinload(CreditNote.lines))
            .order_by(CreditNote.created_at, CreditNote.id)
        )
        .scalars()
        .all()
    )


def _returned_by_item(returns: List[CreditNote]) -> Dict[str, Decimal]:
    out: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for cn in returns:
        for line in cn.lines:
            if line.item_id:
                out[line.item_id] += qty(line.quantity)
    return out


def _cashier_names(db: Session, ids) -> Dict[str, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all())


def _list_item(sale: PosSale, names: Dict[str, str]) -> dict:
    inv = sale.invoice
    return dict(
        id=sale.id,
        client_sale_id=sale.client_sale_id,
        invoice_id=inv.id,
        invoice_number=inv.invoice_number,
        date=sale.date,
        created_at=sale.created_at.isoformat() if sale.created_at else "",
        customer_name=inv.customer.display_name,
        mode=sale.mode,
        total=sale.total,
        returned_amount=sale.returned_amount,
        items_count=sum((qty(line.quantity) for line in inv.lines), Decimal("0")),
        cashier_name=names.get(sale.cashier_id),
    )


def _receipt(org: Organization) -> PosReceipt:
    address = ", ".join(part for part in (org.address, org.city, org.state, org.postal_code) if part)
    return PosReceipt(
        organization_name=org.legal_name or org.name,
        gstin=org.gstin,
        address=address or None,
        phone=org.phone,
        header=org.pos_receipt_header,
        footer=org.pos_receipt_footer,
    )


def _sale_out(db: Session, sale: PosSale) -> PosSaleOut:
    inv = sale.invoice
    returns = _returns_of(db, sale)
    returned = _returned_by_item(returns)
    refund_numbers: Dict[str, str] = {}
    if returns:
        rows = db.execute(
            select(ContactRefund.credit_note_id, ContactRefund.refund_number).where(
                ContactRefund.organization_id == sale.organization_id, ContactRefund.credit_note_id.in_([cn.id for cn in returns])
            )
        ).all()
        refund_numbers = {cn_id: number for cn_id, number in rows}
    names = _cashier_names(db, [sale.cashier_id])
    lines = []
    for line in inv.lines:
        taken = min(returned.get(line.item_id, Decimal("0")), qty(line.quantity)) if line.item_id else Decimal("0")
        if line.item_id:
            returned[line.item_id] = returned.get(line.item_id, Decimal("0")) - taken
        lines.append(
            PosSaleLine(
                item_id=line.item_id,
                name=line.description or (line.item.name if line.item else ""),
                quantity=line.quantity,
                returned_quantity=taken,
                rate=line.rate,
                tax_rate=line.tax_rate,
                amount=line.amount,
                tax_amount=line.tax_amount,
            )
        )
    return PosSaleOut(
        **_list_item(sale, names),
        payment_id=sale.payment_id,
        payment_number=sale.payment.payment_number if sale.payment else None,
        subtotal=inv.subtotal,
        discount_amount=inv.discount_amount,
        tax_total=inv.tax_total,
        tendered=sale.tendered,
        change_due=sale.change_due,
        reference=sale.payment.reference if sale.payment else None,
        lines=lines,
        returns=[
            PosReturnOut(
                credit_note_id=cn.id,
                credit_note_number=cn.credit_note_number,
                date=cn.date,
                total=cn.total,
                refund_number=refund_numbers.get(cn.id),
            )
            for cn in returns
        ],
        receipt=_receipt(db.get(Organization, sale.organization_id)),
    )


def _existing_sale(db: Session, org_id: str, client_sale_id: str) -> Optional[PosSale]:
    return db.execute(
        select(PosSale).where(PosSale.organization_id == org_id, PosSale.client_sale_id == client_sale_id)
    ).scalar_one_or_none()


# --------------------------------------------------------------------------- #
# Sales
# --------------------------------------------------------------------------- #
@router.post("/sales", response_model=PosSaleOut, status_code=status.HTTP_201_CREATED)
def create_sale(payload: PosSaleCreate, response: Response, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Ring up a bill: a sent invoice, paid in full, in one transaction.

    Sending the same ``clientSaleId`` again returns the sale already made
    (HTTP 200) - the till retries after a dropped connection without charging
    twice.
    """
    org_id = user.organization_id
    existing = _existing_sale(db, org_id, payload.client_sale_id)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return _sale_out(db, _load_sale(db, org_id, existing.id))

    org = _org(db, user)
    sale_date = _sale_date(payload.date)
    # The same product scanned twice is one line with the quantities added.
    wanted: Dict[str, Decimal] = {}
    for line in payload.lines:
        wanted[line.item_id] = qty(wanted.get(line.item_id, Decimal("0")) + line.quantity)
    items: Dict[str, Item] = {}
    for item_id in wanted:
        item = get_or_404(db, Item, item_id, org_id, "Item")
        if not item.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Item '{item.name}' is inactive")
        if item.track_serial:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"'{item.name}' is serial-numbered; sell it on an invoice so the serial numbers are recorded"
            )
        items[item_id] = item
    if not org.pos_allow_negative_stock:
        # A friendly early answer listing everything short; the stock update
        # inside the invoice is what holds when two tills race for the last unit.
        error = _stock_error(items, wanted)
        if error:
            raise HTTPException(status.HTTP_409_CONFLICT, error)

    if payload.customer_id:
        customer = get_or_404(db, Contact, payload.customer_id, org_id, "Customer")
        if customer.type != "customer":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected contact is not a customer")
    else:
        customer = _walk_in_customer(db, org_id)
    bank_acct = _account_for(db, org, payload.payment_mode)

    invoice_payload = InvoiceCreate(
        customer_id=customer.id,
        date=sale_date,
        due_date=sale_date,
        reference=f"POS {payload.client_sale_id}"[:120],
        discount_amount=payload.discount_amount,
        status="sent",
        lines=[
            LineInput(item_id=item.id, description=item.name, quantity=wanted[item.id], rate=item.selling_price, tax_rate=item.tax_rate)
            for item in items.values()
        ],
    )
    try:
        inv = create_invoice_record(db, user, invoice_payload, allow_negative_stock=org.pos_allow_negative_stock)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_400_BAD_REQUEST and str(exc.detail).startswith("Insufficient stock"):
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, f"Not enough stock. {exc.detail}") from None
        raise
    if inv.currency and inv.exchange_rate != 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Counter sales are in the base currency; pick a customer who deals in it")
    total = money(inv.total)
    if total <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The bill total must be more than zero")

    if payload.payment_mode == "cash":
        tendered = money(payload.amount_tendered if payload.amount_tendered is not None else total)
        if tendered < total:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cash received ({tendered}) is less than the bill total ({total})")
    else:
        tendered = total
    change = money(tendered - total)

    _apply_invoice_payment(db, inv, total)
    payment = _record_customer_payment(
        db,
        org_id,
        user,
        customer,
        bank_acct,
        inv,
        total,
        CustomerPaymentCreate(
            customer_id=customer.id,
            invoice_id=inv.id,
            bank_account_id=bank_acct.id,
            date=sale_date,
            amount=total,
            mode=payload.payment_mode,
            reference=payload.reference,
        ),
        f"Counter sale {inv.invoice_number}",
    )
    sale = PosSale(
        organization_id=org_id,
        client_sale_id=payload.client_sale_id,
        invoice_id=inv.id,
        payment_id=payment.id,
        date=sale_date,
        mode=payload.payment_mode,
        total=total,
        tendered=tendered,
        change_due=change,
        cashier_id=user.id,
    )
    db.add(sale)
    try:
        db.flush()
    except IntegrityError:
        # Another attempt with the same id got there first: that sale stands.
        db.rollback()
        existing = _existing_sale(db, org_id, payload.client_sale_id)
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return _sale_out(db, _load_sale(db, org_id, existing.id))
    audit.record(db, user, "create", "pos_sale", sale.id, f"Counter sale {inv.invoice_number}: {total} by {payload.payment_mode}")
    db.commit()
    return _sale_out(db, _load_sale(db, org_id, sale.id))


@router.get("/sales", response_model=List[PosSaleListItem])
def list_sales(
    on: Optional[date] = Query(None, alias="date"),
    mine: bool = Query(False, description="Only the current user's sales"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One day's counter sales, newest first (default today)."""
    day = on or date.today()
    stmt = (
        select(PosSale)
        .where(PosSale.organization_id == user.organization_id, PosSale.date == day)
        .options(selectinload(PosSale.invoice).selectinload(Invoice.lines), selectinload(PosSale.invoice).selectinload(Invoice.customer))
        .order_by(PosSale.created_at.desc(), PosSale.id.desc())
        .limit(MAX_SALES_PER_DAY_LIST)
    )
    if mine:
        stmt = stmt.where(PosSale.cashier_id == user.id)
    sales = db.execute(stmt).scalars().all()
    names = _cashier_names(db, [s.cashier_id for s in sales])
    return [PosSaleListItem(**_list_item(s, names)) for s in sales]


@router.get("/sales/{sale_id}", response_model=PosSaleOut)
def get_sale(sale_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _sale_out(db, _load_sale(db, user.organization_id, sale_id))


# --------------------------------------------------------------------------- #
# Returns
# --------------------------------------------------------------------------- #
@router.post("/sales/{sale_id}/returns", response_model=PosSaleOut, status_code=status.HTTP_201_CREATED)
def return_items(
    sale_id: str, payload: PosReturnCreate, response: Response, user: User = Depends(require_write), db: Session = Depends(get_db)
):
    """Take goods back: a credit note against the sale's invoice (stock goes back in) refunded at once.

    The refund leaves the account the sale was paid into (the cash drawer for
    cash). Sending the same ``clientReturnId`` again changes nothing.
    """
    org_id = user.organization_id
    sale = _load_sale(db, org_id, sale_id)
    inv = sale.invoice
    returns = _returns_of(db, sale)
    marker = f"POS return {payload.client_return_id}"[:120]
    if any(cn.reference == marker for cn in returns):
        response.status_code = status.HTTP_200_OK
        return _sale_out(db, sale)

    return_date = _sale_date(payload.date)
    if return_date < sale.date:
        return_date = sale.date
    already = _returned_by_item(returns)
    sold: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    sold_line = {}
    for line in inv.lines:
        if line.item_id:
            sold[line.item_id] += qty(line.quantity)
            sold_line.setdefault(line.item_id, line)
    asked: Dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for line in payload.lines:
        asked[line.item_id] += qty(line.quantity)
    for item_id, quantity in asked.items():
        if item_id not in sold:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That item is not on this bill")
        left = sold[item_id] - already.get(item_id, Decimal("0"))
        if quantity > left:
            name = sold_line[item_id].description
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Only {left.normalize():f} of {name} can still be returned")

    # The bill's discount comes back in proportion; returning everything left
    # gives back exactly what is left of it, so the paise add up.
    returned_subtotal = money(sum((money(asked[i] * money(sold_line[i].rate)) for i in asked), Decimal("0")))
    everything_left = all(asked.get(i, Decimal("0")) == sold[i] - already.get(i, Decimal("0")) for i in sold)
    discount_given_back = money(sum((money(cn.discount_amount) for cn in returns), Decimal("0")))
    if everything_left:
        discount = money(inv.discount_amount) - discount_given_back
    elif inv.subtotal and money(inv.subtotal) > 0:
        discount = money(money(inv.discount_amount) * returned_subtotal / money(inv.subtotal))
    else:
        discount = Decimal("0")
    discount = max(Decimal("0"), min(discount, returned_subtotal))

    cn_payload = CreditNoteCreate(
        customer_id=inv.customer_id,
        invoice_id=inv.id,
        date=return_date,
        reference=marker,
        reason=payload.reason or "Returned at the counter",
        discount_amount=discount,
        status="open",
        lines=[
            LineInput(
                item_id=item_id,
                description=sold_line[item_id].description,
                quantity=quantity,
                rate=sold_line[item_id].rate,
                tax_rate=sold_line[item_id].tax_rate,
            )
            for item_id, quantity in asked.items()
        ],
    )
    cn = CreditNote(organization_id=org_id, status="draft", created_by=user.id)
    cn.credit_note_number = numbering.next_number(db, org_id, CREDIT_NOTE.key)
    doc_flow.price(db, org_id, cn, cn_payload, CREDIT_NOTE)
    credit_notes_router._validate(db, cn, cn_payload, org_id)
    left_to_refund = money(sale.total) - money(sale.returned_amount)
    if money(cn.total) > left_to_refund:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"The return ({cn.total}) is more than is left on the bill ({left_to_refund})")
    db.add(cn)
    db.flush()
    cn.status = "open"
    credits.post_credit_note(db, cn, user)
    audit.record(db, user, "create", "credit_note", cn.id, f"Counter return {cn.credit_note_number} on {inv.invoice_number}")

    refund_from = sale.payment.bank_account if sale.payment else _cash_account(db, org_id)
    bank.require_active(refund_from)
    credits.record_refund(
        db,
        user,
        "customer",
        inv.customer,
        RefundCreate(
            bank_account_id=refund_from.id,
            date=return_date,
            amount=cn.total,
            mode=sale.mode,
            notes=f"Counter return on {inv.invoice_number}",
        ),
        credit_note=cn,
    )
    sale.returned_amount = money(money(sale.returned_amount) + money(cn.total))
    audit.record(db, user, "update", "pos_sale", sale.id, f"Returned {cn.total} of counter sale {inv.invoice_number}")
    db.commit()
    return _sale_out(db, _load_sale(db, org_id, sale.id))


# --------------------------------------------------------------------------- #
# Day summary (the day-end report)
# --------------------------------------------------------------------------- #
@router.get("/summary", response_model=PosSummary)
def summary(on: Optional[date] = Query(None, alias="date"), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One day at the counter: takings by payment mode and cashier, returns, the cash the drawer should hold."""
    day = on or date.today()
    org_id = user.organization_id
    sales = (
        db.execute(
            select(PosSale)
            .where(PosSale.organization_id == org_id, PosSale.date == day)
            .options(selectinload(PosSale.invoice).selectinload(Invoice.lines))
        )
        .scalars()
        .all()
    )
    # Refunds of counter sales made that day (a return can come days after the sale).
    refund_rows = db.execute(
        select(PosSale.mode, ContactRefund.amount)
        .join(CreditNote, CreditNote.invoice_id == PosSale.invoice_id)
        .join(ContactRefund, ContactRefund.credit_note_id == CreditNote.id)
        .where(
            PosSale.organization_id == org_id,
            CreditNote.organization_id == org_id,
            ContactRefund.organization_id == org_id,
            ContactRefund.date == day,
            CreditNote.status != "void",
        )
    ).all()
    modes: Dict[str, Dict[str, Decimal]] = {
        m: {"count": Decimal("0"), "total": Decimal("0"), "refunds": Decimal("0")} for m in ("cash", "upi", "card")
    }
    cashiers: Dict[Optional[str], Dict[str, Decimal]] = defaultdict(lambda: {"count": Decimal("0"), "total": Decimal("0")})
    top: Dict[str, Dict] = {}
    gross = tax = items_sold = Decimal("0")
    for sale in sales:
        bucket = modes.setdefault(sale.mode, {"count": Decimal("0"), "total": Decimal("0"), "refunds": Decimal("0")})
        bucket["count"] += 1
        bucket["total"] += money(sale.total)
        cashiers[sale.cashier_id]["count"] += 1
        cashiers[sale.cashier_id]["total"] += money(sale.total)
        gross += money(sale.total)
        tax += money(sale.invoice.tax_total)
        for line in sale.invoice.lines:
            items_sold += qty(line.quantity)
            if line.item_id:
                entry = top.setdefault(line.item_id, {"name": line.description, "quantity": Decimal("0"), "amount": Decimal("0")})
                entry["quantity"] += qty(line.quantity)
                entry["amount"] += money(line.amount)
    returns_total = Decimal("0")
    for mode, amount in refund_rows:
        modes.setdefault(mode, {"count": Decimal("0"), "total": Decimal("0"), "refunds": Decimal("0")})["refunds"] += money(amount)
        returns_total += money(amount)
    names = _cashier_names(db, cashiers.keys())
    count = len(sales)
    return PosSummary(
        date=day,
        sales_count=count,
        gross_sales=money(gross),
        tax_total=money(tax),
        returns_total=money(returns_total),
        net_sales=money(gross - returns_total),
        items_sold=qty(items_sold),
        average_bill=money(gross / count) if count else Decimal("0"),
        cash_expected=money(modes["cash"]["total"] - modes["cash"]["refunds"]),
        by_mode=[
            PosModeTotal(mode=m, count=int(v["count"]), total=money(v["total"]), refunds=money(v["refunds"])) for m, v in modes.items()
        ],
        by_cashier=sorted(
            (
                PosCashierTotal(cashier_id=cid, name=names.get(cid, "Unknown"), count=int(v["count"]), total=money(v["total"]))
                for cid, v in cashiers.items()
            ),
            key=lambda c: (-c.total, c.name),
        ),
        top_items=[
            PosTopItem(item_id=item_id, name=v["name"], quantity=qty(v["quantity"]), amount=money(v["amount"]))
            for item_id, v in sorted(top.items(), key=lambda kv: (-kv[1]["amount"], kv[1]["name"]))[:10]
        ],
    )


# --------------------------------------------------------------------------- #
# Settings (admin)
# --------------------------------------------------------------------------- #
def _settings_out(db: Session, org: Organization) -> PosSettingsOut:
    pos_bank = _usable_pos_bank(db, org)
    try:
        cash = _cash_account(db, org.id)
    except HTTPException:
        cash = None
    return PosSettingsOut(
        bank_account_id=pos_bank.id if pos_bank else None,
        bank_account_name=pos_bank.name if pos_bank else None,
        allow_negative_stock=org.pos_allow_negative_stock,
        receipt_header=org.pos_receipt_header,
        receipt_footer=org.pos_receipt_footer,
        cash_account_id=cash.id if cash else None,
        cash_account_name=cash.name if cash else None,
    )


@router.get("/settings", response_model=PosSettingsOut)
def get_settings(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _settings_out(db, _org(db, user))


@router.put("/settings", response_model=PosSettingsOut)
def update_settings(payload: PosSettings, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = _org(db, user)
    if payload.bank_account_id:
        acct = get_or_404(db, BankAccount, payload.bank_account_id, org.id, "Bank account")
        bank.require_active(acct)
        if acct.type == "credit_card":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "UPI and card takings go into a bank or cash account, not a credit card")
        if acct.currency != org.currency:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Choose an account kept in {org.currency}")
    org.pos_bank_account_id = payload.bank_account_id
    org.pos_allow_negative_stock = payload.allow_negative_stock
    org.pos_receipt_header = payload.receipt_header
    org.pos_receipt_footer = payload.receipt_footer
    audit.record(db, user, "update", "organization", org.id, "Updated Point of Sale settings")
    db.commit()
    return _settings_out(db, org)


# --------------------------------------------------------------------------- #
# A phone as the counter's scanner
# --------------------------------------------------------------------------- #
# A session lasts a working day; the counter can close it sooner.
SCANNER_SESSION_HOURS = 12
# How many codes one poll hands back (a phone cannot scan faster than this in a second).
MAX_SCANS_PER_POLL = 200
# The phone's page has no sign-in: each key may only ask so often.
_phone_calls = RateLimiter(limit=240, window_seconds=60)
_phone_new_items = RateLimiter(limit=30, window_seconds=60)
SCAN_LINK_PATH = "/scan/"


class ScannerSessionOut(APIModel):
    id: str
    expires_at: dt.datetime
    connected: bool
    counter_user_name: Optional[str] = None
    closed: bool


class OpenedScannerSession(ScannerSessionOut):
    # The secret key for the QR link. Shown once, when the session opens; only
    # its SHA-256 is stored.
    token: str


class ScannerQrOut(APIModel):
    svg: str


class ScanOut(APIModel):
    seq: int
    code: str
    quantity: Decimal


class ScanPollOut(APIModel):
    session: ScannerSessionOut
    scans: List[ScanOut]


def _now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _aware(value: dt.datetime) -> dt.datetime:
    # SQLite hands back naive datetimes; they were stored in UTC.
    return value if value.tzinfo else value.replace(tzinfo=dt.UTC)


def _is_open(found: PosScannerSession) -> bool:
    return found.closed_at is None and _aware(found.expires_at) > _now()


def _scanner_session(db: Session, user: User, session_id: str) -> PosScannerSession:
    found = db.execute(
        select(PosScannerSession).where(PosScannerSession.id == session_id, PosScannerSession.organization_id == user.organization_id)
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This scanner session is not valid")
    return found


def _scanner_out(db: Session, found: PosScannerSession) -> ScannerSessionOut:
    return ScannerSessionOut(
        id=found.id,
        expires_at=_aware(found.expires_at),
        connected=found.connected_at is not None,
        counter_user_name=_cashier_names(db, [found.created_by]).get(found.created_by),
        closed=not _is_open(found),
    )


@router.post("/scanner-sessions", response_model=OpenedScannerSession, status_code=status.HTTP_201_CREATED)
def open_scanner_session(user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Open a session for a phone to scan into this counter; its key goes in the QR link."""
    # Sessions that ended are of no further use: clear them (their scans go with them).
    db.execute(
        delete(PosScannerSession).where(
            PosScannerSession.organization_id == user.organization_id,
            (PosScannerSession.expires_at < _now() - dt.timedelta(days=1)) | (PosScannerSession.closed_at.is_not(None)),
        )
    )
    token = secrets.token_urlsafe(32)
    found = PosScannerSession(
        organization_id=user.organization_id,
        created_by=user.id,
        token_hash=hash_token(token),
        expires_at=_now() + dt.timedelta(hours=SCANNER_SESSION_HOURS),
    )
    db.add(found)
    audit.record(db, user, "create", "pos_scanner_session", found.id, "Opened a phone scanner link for the counter")
    db.commit()
    return OpenedScannerSession(**_scanner_out(db, found).model_dump(), token=token)


@router.get("/scanner-sessions/{session_id}/qr", response_model=ScannerQrOut)
def scanner_qr(
    session_id: str, url: str = Query(min_length=10, max_length=500), user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """The QR code of the session's link (the counter's own address + /scan/<key>)."""
    found = _scanner_session(db, user, session_id)
    if not _is_open(found):
        raise HTTPException(status.HTTP_410_GONE, "This scanner link has ended. Open a new one.")
    head, _, key = url.rpartition(SCAN_LINK_PATH)
    if not head.startswith(("https://", "http://")) or "/" in key or not key or hash_token(key) != found.token_hash:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The QR code can only hold this session's scanner link")
    return ScannerQrOut(svg=upi.qr_svg(url, 240))


@router.get("/scanner-sessions/{session_id}/scans", response_model=ScanPollOut)
def poll_scans(session_id: str, after: int = Query(0, ge=0), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What the phone scanned since ``after`` (the counter asks about once a second)."""
    found = _scanner_session(db, user, session_id)
    rows = db.execute(
        select(PosScan.seq, PosScan.code, PosScan.quantity)
        .where(PosScan.session_id == found.id, PosScan.seq > after)
        .order_by(PosScan.seq)
        .limit(MAX_SCANS_PER_POLL)
    ).all()
    return ScanPollOut(session=_scanner_out(db, found), scans=[ScanOut(seq=r.seq, code=r.code, quantity=qty(r.quantity)) for r in rows])


@router.delete("/scanner-sessions/{session_id}", response_model=ScannerSessionOut)
def close_scanner_session(session_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Stop taking scans from the phone; its link stops working at once."""
    found = _scanner_session(db, user, session_id)
    found.closed_at = found.closed_at or _now()
    db.commit()
    return _scanner_out(db, found)


# --------------------------------------------------------------------------- #
# The phone's end: no sign-in, the link's key is the permission
# --------------------------------------------------------------------------- #
public_router = APIRouter(prefix="/api/pos-scan", tags=["Point of Sale"])


class PhoneSessionOut(APIModel):
    organization_name: str
    counter_user_name: Optional[str] = None
    expires_at: dt.datetime


class PhoneScanIn(APIModel):
    code: str = Field(min_length=1, max_length=64)
    quantity: Decimal = Field(default=Decimal("1"), gt=0, le=Decimal("10000"))

    @field_validator("code")
    @classmethod
    def _code(cls, value: str) -> str:
        cleaned = validators.barcode(value)
        if not cleaned:
            raise ValueError("Scan a barcode")
        return cleaned


class PhoneNewItemIn(APIModel):
    barcode: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    selling_price: Decimal = Field(ge=0, le=MAX_MONEY)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    unit: str = Field(default="pcs", min_length=1, max_length=20)

    @field_validator("barcode")
    @classmethod
    def _barcode(cls, value: str) -> str:
        cleaned = validators.barcode(value)
        if not cleaned:
            raise ValueError("Scan a barcode")
        return cleaned

    @field_validator("name", "unit")
    @classmethod
    def _trimmed(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Fill this in")
        return value


def _phone_session(db: Session, token: str, limiter: RateLimiter = _phone_calls) -> PosScannerSession:
    """The open session a phone's key belongs to (404 unknown, 410 ended)."""
    if not token or len(token) > 100:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This scanner link is not valid. Scan the QR code on the counter again.")
    found = db.execute(select(PosScannerSession).where(PosScannerSession.token_hash == hash_token(token))).scalar_one_or_none()
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This scanner link is not valid. Scan the QR code on the counter again.")
    if not _is_open(found):
        raise HTTPException(status.HTTP_410_GONE, "This scanner link has ended. Ask the counter for a new QR code.")
    org = db.get(Organization, found.organization_id)
    if org is None or org.is_suspended:
        raise HTTPException(status.HTTP_410_GONE, "This scanner link has ended. Ask the counter for a new QR code.")
    limiter.check(found.id, "Scanning too fast. Wait a moment and try again.")
    return found


def _counter_user(db: Session, found: PosScannerSession) -> Optional[User]:
    return db.get(User, found.created_by) if found.created_by else None


@public_router.get("/{token}", response_model=PhoneSessionOut)
def phone_open(token: str, db: Session = Depends(get_db)):
    """The phone opened the QR link: which counter it scans for (and the counter shows it connected)."""
    found = _phone_session(db, token)
    found.connected_at = found.connected_at or _now()
    db.commit()
    org = db.get(Organization, found.organization_id)
    return PhoneSessionOut(
        organization_name=org.legal_name or org.name,
        counter_user_name=_cashier_names(db, [found.created_by]).get(found.created_by),
        expires_at=_aware(found.expires_at),
    )


@public_router.get("/{token}/lookup", response_model=PosItem)
def phone_lookup(token: str, code: str = Query(min_length=1, max_length=64), db: Session = Depends(get_db)):
    """The item for a scanned code, to show on the phone before it is sent."""
    found = _phone_session(db, token)
    item = find_by_code(db, found.organization_id, code)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No item with this barcode")
    return PosItem.model_validate(item)


@public_router.post("/{token}/scans", response_model=ScanOut, status_code=status.HTTP_201_CREATED)
def phone_send(token: str, payload: PhoneScanIn, db: Session = Depends(get_db)):
    """Put a scanned item (and how many) on the counter's bill."""
    found = _phone_session(db, token)
    # One UPDATE numbers the scan, so two quick scans never share a number.
    db.execute(
        update(PosScannerSession)
        .where(PosScannerSession.id == found.id)
        .values(last_seq=PosScannerSession.last_seq + 1)
        .execution_options(synchronize_session=False)
    )
    seq = db.execute(select(PosScannerSession.last_seq).where(PosScannerSession.id == found.id)).scalar_one()
    db.add(PosScan(session_id=found.id, seq=seq, code=payload.code, quantity=qty(payload.quantity)))
    found.connected_at = found.connected_at or _now()
    db.commit()
    return ScanOut(seq=seq, code=payload.code, quantity=qty(payload.quantity))


def _free_sku(db: Session, org_id: str, barcode: str) -> str:
    """The barcode as the new item's SKU, or the barcode with -2, -3 ... when that SKU is taken."""
    base = barcode.upper()[:44]
    taken = {
        s.upper()
        for s in db.execute(select(Item.sku).where(Item.organization_id == org_id, func.upper(Item.sku).like(f"{base}%"))).scalars()
    }
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


@public_router.post("/{token}/items", response_model=PosItem, status_code=status.HTTP_201_CREATED)
def phone_new_item(token: str, payload: PhoneNewItemIn, db: Session = Depends(get_db)):
    """A barcode Books does not know yet: add it as an item (name, price, GST) so it can be sold."""
    found = _phone_session(db, token, _phone_new_items)
    org_id = found.organization_id
    existing = find_by_code(db, org_id, payload.barcode)
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Barcode {payload.barcode} is already used by '{existing.name}'")
    taken = db.execute(select(Item).where(Item.organization_id == org_id, Item.barcode == payload.barcode)).scalar_one_or_none()
    if taken is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Barcode {payload.barcode} is already used by '{taken.name}' (inactive)")
    item = Item(
        organization_id=org_id,
        name=payload.name,
        sku=_free_sku(db, org_id, payload.barcode),
        barcode=payload.barcode,
        type="goods",
        unit=payload.unit,
        selling_price=money(payload.selling_price),
        tax_rate=payload.tax_rate,
        cost_price=Decimal("0"),
        track_inventory=False,
    )
    db.add(item)
    db.flush()
    audit.record(
        db,
        _counter_user(db, found),
        "create",
        "item",
        item.id,
        f"Added item {item.name} ({item.barcode}) from the phone scanner",
        organization_id=org_id,
    )
    db.commit()
    db.refresh(item)
    return PosItem.model_validate(item)
