"""Billing -> Books: customers, plans, invoices and payments from Rooman Billing.

One way only. Each Billing record becomes a normal Books record, posted to the
ledger exactly as if it had been entered in Books, and marked with
``source_app="billing"`` + Billing's id (``source_ref``):

- it is never imported twice (unique per organization), and
- it is read-only in Books (change it in Billing; it flows across).

Events (contracts/events): customer.created / customer.updated, plan.upserted,
invoice.created, payment.received - only those whose ``source`` is "billing";
Books' own customer events coming back are ignored here.

Errors:
- ``RetryLater`` (e.g. the invoice's customer has not arrived yet): the
  request fails, nothing is recorded, Billing retries.
- ``PermanentEventError`` (e.g. unknown organization, totals that do not add
  up): answered 422 so Billing stops retrying and shows it as failed.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.integrations import events
from backend.integrations.inbound import PermanentEventError, handles
from backend.models import Contact, CustomerPayment, Invoice, InvoiceLine, Item, Organization, User, new_id
from backend.services import numbering
from backend.services.money import money

logger = logging.getLogger("roomanbooks.integrations.billing")

SOURCE = "billing"
TOTAL_TOLERANCE = Decimal("0.05")  # rounding differences between Billing's and Books' GST


class RetryLater(RuntimeError):
    """A record this event depends on has not arrived yet; Billing will resend."""


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _from_billing(event) -> bool:
    return event.source == SOURCE


def _org(db: Session, event) -> Organization:
    org = db.get(Organization, events.books_id_of(event.org_id))
    if org is None:
        raise PermanentEventError(f"Organization {event.org_id} does not exist in Books.")
    return org


def _actor(db: Session, org_id: str) -> User:
    """The 'Rooman Billing' account records are created by: never signs in, not listed with users."""
    email = f"billing-{org_id}@connected-apps.invalid"
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            id=new_id(), organization_id=org_id, name="Rooman Billing", email=email, password_hash=None, role="integration", is_active=True
        )
        db.add(user)
        db.flush()
    return user


def _find(db: Session, model, org_id: str, ref: str):
    return db.execute(
        select(model).where(model.organization_id == org_id, model.source_app == SOURCE, model.source_ref == str(ref))
    ).scalar_one_or_none()


def _day(value: Any) -> Optional[date]:
    if not value:
        return None
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _dec(value: Any, default: str = "0") -> Decimal:
    return Decimal(str(value if value not in (None, "") else default))


# --------------------------------------------------------------------------- #
# Customers
# --------------------------------------------------------------------------- #
def _upsert_customer(db: Session, event) -> None:
    if not _from_billing(event):
        return
    org = _org(db, event)
    d = event.data
    ref = d.get("app_local_id")
    if not ref:
        raise PermanentEventError("customer event from Billing has no app_local_id (Billing's customer id).")
    contact = _find(db, Contact, org.id, ref)
    if contact is None:
        contact = Contact(organization_id=org.id, type="customer", source_app=SOURCE, source_ref=str(ref))
        db.add(contact)
    contact.display_name = d["display_name"][:200]
    contact.email = d.get("email") or None
    contact.phone = (d.get("phone") or None) and str(d["phone"])[:40]
    if "company_name" in d:
        contact.company_name = d.get("company_name") or None
    if "gstin" in d:
        contact.gstin = (d.get("gstin") or "").upper() or None
        if contact.gstin:
            contact.gst_treatment = "registered"
    if "billing_address" in d:
        contact.billing_address = d.get("billing_address") or None
    if d.get("party_id"):
        contact.party_id = events.books_id_of(d["party_id"])
    db.flush()


handles("customer.created")(_upsert_customer)
handles("customer.updated")(_upsert_customer)


# --------------------------------------------------------------------------- #
# Plans -> items
# --------------------------------------------------------------------------- #
@handles("plan.upserted")
def _upsert_plan(db: Session, event) -> None:
    if not _from_billing(event):
        return
    org = _org(db, event)
    d = event.data
    item = _find(db, Item, org.id, d["plan_id"])
    if item is None:
        item = Item(organization_id=org.id, type="service", sku=f"BIL-{d['plan_id']}"[:40], source_app=SOURCE, source_ref=str(d["plan_id"]))
        db.add(item)
    item.name = d["name"][:200]
    item.description = d.get("description") or None
    item.selling_price = money(_dec(d["price"]))
    item.tax_rate = _dec(d["tax_rate"])
    item.hsn_sac = d.get("hsn_sac") or None
    item.is_active = bool(d["is_active"])
    db.flush()


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
@handles("invoice.created")
def _create_invoice(db: Session, event) -> None:
    if not _from_billing(event):
        return
    from backend.routers.invoices import post_invoice
    from backend.schemas.sales import LineInput
    from backend.services.documents import compute_lines

    org = _org(db, event)
    d = event.data
    if _find(db, Invoice, org.id, d["invoice_id"]) is not None:
        return  # already imported (a re-sent event with a new id)
    customer = _find(db, Contact, org.id, d["customer_id"])
    if customer is None:
        raise RetryLater(f"Billing customer {d['customer_id']} has not arrived in Books yet.")
    actor = _actor(db, org.id)

    specs = []
    for line in d.get("lines") or []:
        item = _find(db, Item, org.id, line["plan_id"]) if line.get("plan_id") else None
        specs.append(
            LineInput(
                item_id=item.id if item else None,
                description=line.get("description") or (item.name if item else "Subscription"),
                quantity=_dec(line["quantity"], "1"),
                rate=_dec(line["rate"]),
                tax_rate=_dec(line["tax_rate"]),
            )
        )
    if not specs:
        # No lines sent: one line for the whole invoice at its effective GST rate.
        subtotal, tax = _dec(d["subtotal"]), _dec(d["tax_total"])
        rate = (tax * 100 / subtotal).quantize(Decimal("0.01")) if subtotal else Decimal("0")
        specs.append(LineInput(description=f"Subscription invoice {d['number']}", quantity=Decimal("1"), rate=subtotal, tax_rate=rate))

    discount = _dec(d.get("discount_total"))
    computed, subtotal, tax_total = compute_lines(db, org.id, specs, kind="invoice", discount=discount)
    total = money(subtotal - discount + tax_total)
    if abs(total - _dec(d["total"])) > TOTAL_TOLERANCE:
        raise PermanentEventError(
            f"Invoice {d['number']}: Books computes {total} but Billing says {d['total']}; check the lines and GST rates."
        )

    inv = Invoice(
        organization_id=org.id,
        invoice_number=numbering.next_number(db, org.id, "invoice"),
        customer_id=customer.id,
        date=_day(d["date"]),
        reference=str(d["number"])[:120],
        subject="Subscription (Rooman Billing)",
        subtotal=subtotal,
        discount_amount=money(discount),
        tax_total=tax_total,
        total=total,
        amount_paid=Decimal("0"),
        status="sent",
        created_by=actor.id,
        source_app=SOURCE,
        source_ref=str(d["invoice_id"]),
    )
    inv.due_date = _day(d.get("due_date")) or inv.date
    for position, line in enumerate(computed):
        inv.lines.append(
            InvoiceLine(
                item_id=line.item.id if line.item else None,
                account_id=line.account.id if line.account else None,
                position=position,
                description=line.spec.description,
                quantity=line.quantity,
                rate=line.rate,
                tax_rate=line.tax_rate,
                amount=line.amount,
                tax_amount=line.tax_amount,
            )
        )
    db.add(inv)
    db.flush()
    post_invoice(db, inv, actor)


# --------------------------------------------------------------------------- #
# Payments
# --------------------------------------------------------------------------- #
@handles("payment.received")
def _record_payment(db: Session, event) -> None:
    if not _from_billing(event):
        return
    from backend.routers.payments import _apply_invoice_payment, _record_customer_payment
    from backend.schemas.sales import CustomerPaymentCreate
    from backend.services.razorpay_posting import default_bank_account

    org = _org(db, event)
    d = event.data
    if db.execute(
        select(CustomerPayment.id).where(
            CustomerPayment.organization_id == org.id,
            CustomerPayment.source_app == SOURCE,
            CustomerPayment.source_ref.like(f"{d['payment_id']}%"),
        )
    ).first():
        return  # already imported
    customer = _find(db, Contact, org.id, d["customer_id"])
    if customer is None:
        raise RetryLater(f"Billing customer {d['customer_id']} has not arrived in Books yet.")
    bank_acct = default_bank_account(db, org.id)
    if bank_acct is None:
        raise PermanentEventError("The organization has no bank account in Books to deposit Billing payments into.")
    actor = _actor(db, org.id)
    method = (d.get("method") or "").lower()
    mode = method if method in ("cash", "bank_transfer", "cheque", "upi", "card") else "other"
    received = _day(d["received_on"])
    remaining = money(_dec(d["amount"]))

    applications = []
    for app in d.get("applied_to") or []:
        inv = _find(db, Invoice, org.id, app["invoice_id"])
        if inv is None:
            raise RetryLater(f"Billing invoice {app['invoice_id']} has not arrived in Books yet.")
        applications.append((inv, money(_dec(app["amount"]))))

    for index, (inv, amount) in enumerate(applications):
        amount = min(amount, money(inv.balance_due), remaining)
        if amount <= 0:
            continue
        payload = CustomerPaymentCreate(
            customer_id=customer.id,
            invoice_id=inv.id,
            bank_account_id=bank_acct.id,
            date=received,
            amount=amount,
            mode=mode,
            reference=d.get("reference"),
        )
        _apply_invoice_payment(db, inv, amount)
        payment = _record_customer_payment(db, org.id, actor, customer, bank_acct, inv, amount, payload, "Received in Rooman Billing")
        payment.source_app, payment.source_ref = SOURCE, f"{d['payment_id']}" if index == 0 else f"{d['payment_id']}#{index}"
        remaining = money(remaining - amount)
    if remaining > 0:
        # Paid more than the invoices it names (or none named): kept as the customer's advance.
        payload = CustomerPaymentCreate(
            customer_id=customer.id, bank_account_id=bank_acct.id, date=received, amount=remaining, mode=mode, reference=d.get("reference")
        )
        payment = _record_customer_payment(
            db, org.id, actor, customer, bank_acct, None, remaining, payload, "Advance received in Rooman Billing"
        )
        payment.source_app, payment.source_ref = SOURCE, f"{d['payment_id']}#advance"
    db.flush()


# --------------------------------------------------------------------------- #
# Read-only in Books
# --------------------------------------------------------------------------- #
READ_ONLY_DETAIL = "This record comes from Rooman Billing and is read-only in Books. Change it in Billing; the change flows across."


def is_from_other_app(record: Optional[Any]) -> bool:
    return bool(record is not None and getattr(record, "source_app", None))
