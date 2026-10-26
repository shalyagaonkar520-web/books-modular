"""Tally (TallyPrime / Tally.ERP 9) data exchange.

Export: the chart of accounts and contacts as ledger masters, and the period's
journal entries as vouchers (Sales, Purchase, Receipt, Payment, Journal), in the
XML envelope Tally imports through Import Data. Customer and vendor lines go to
the party's own ledger under Sundry Debtors / Sundry Creditors, as Tally keeps them.

Import: ledger masters from a Tally export (Display > List of Accounts > export
XML, or Masters export). Sundry Debtors become customers, Sundry Creditors become
vendors, and every other ledger becomes an account in the chart.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional
from xml.sax.saxutils import escape

import defusedxml.ElementTree as SafeET
from defusedxml import DefusedXmlException
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models import Account, Contact, JournalEntry, Organization

MAX_IMPORT_BYTES = 5 * 1024 * 1024

_VOUCHER_TYPES = {
    "invoice": "Sales",
    "invoice_cogs": "Journal",
    "credit_note": "Credit Note",
    "bill": "Purchase",
    "vendor_credit": "Debit Note",
    "customer_payment": "Receipt",
    "external_payment": "Receipt",
    "vendor_payment": "Payment",
    "expense": "Payment",
    "bank_transaction": "Journal",
    "transfer": "Contra",
}

_SUBTYPE_GROUPS = {
    "bank": "Bank Accounts",
    "cash": "Cash-in-Hand",
    "credit_card": "Bank OD A/c",
    "accounts_receivable": "Sundry Debtors",
    "accounts_payable": "Sundry Creditors",
    "inventory": "Stock-in-Hand",
    "tax": "Duties & Taxes",
    "cogs": "Purchase Accounts",
    "other_income": "Indirect Incomes",
    "fixed_asset": "Fixed Assets",
}
_TYPE_GROUPS = {
    "asset": "Current Assets",
    "liability": "Current Liabilities",
    "equity": "Capital Account",
    "income": "Sales Accounts",
    "expense": "Indirect Expenses",
}

# Bank and cash ledgers become bank accounts in Banking (with their own ledger), not plain accounts.
_BANK_GROUPS = {"bank accounts", "cash-in-hand", "bank od a/c"}
# Tally's primary groups (and common sub-groups) -> (account type, subtype).
_GROUP_TYPES = {
    "bank occ a/c": ("liability", None),
    "current assets": ("asset", None),
    "fixed assets": ("asset", "fixed_asset"),
    "investments": ("asset", None),
    "loans & advances (asset)": ("asset", None),
    "deposits (asset)": ("asset", None),
    "stock-in-hand": ("asset", "inventory"),
    "misc. expenses (asset)": ("asset", None),
    "current liabilities": ("liability", None),
    "duties & taxes": ("liability", "tax"),
    "provisions": ("liability", None),
    "loans (liability)": ("liability", None),
    "secured loans": ("liability", None),
    "unsecured loans": ("liability", None),
    "capital account": ("equity", None),
    "reserves & surplus": ("equity", None),
    "sales accounts": ("income", None),
    "direct incomes": ("income", None),
    "indirect incomes": ("income", "other_income"),
    "purchase accounts": ("expense", "cogs"),
    "direct expenses": ("expense", "cogs"),
    "indirect expenses": ("expense", None),
}
_CODE_BASE = {"asset": 1700, "liability": 2700, "equity": 3700, "income": 4700, "expense": 6700}


def _x(value: object) -> str:
    """Escaped for element text and for double-quoted attribute values."""
    return escape(str(value if value is not None else ""), {'"': "&quot;"})


def _group(account: Account) -> str:
    return _SUBTYPE_GROUPS.get(account.subtype or "", _TYPE_GROUPS.get(account.type, "Suspense A/c"))


def _amount(value) -> str:
    return f"{value:.2f}"


def export_xml(db: Session, org: Organization, start: date, end: date) -> str:
    accounts = list(db.execute(select(Account).where(Account.organization_id == org.id).order_by(Account.code)).scalars())
    by_id = {a.id: a for a in accounts}
    contacts = {c.id: c for c in db.execute(select(Contact).where(Contact.organization_id == org.id)).scalars()}
    party_accounts = {a.id for a in accounts if a.subtype in ("accounts_receivable", "accounts_payable")}
    party_accounts |= {c.ledger_account_id for c in contacts.values() if c.ledger_account_id}
    entries = list(
        db.execute(
            select(JournalEntry)
            .where(JournalEntry.organization_id == org.id, JournalEntry.date >= start, JournalEntry.date <= end)
            .options(selectinload(JournalEntry.lines))
            .order_by(JournalEntry.date, JournalEntry.entry_number)
        ).scalars()
    )
    used_party_ids = {ln.contact_id for e in entries for ln in e.lines if ln.contact_id and ln.account_id in party_accounts}
    # A receivable / payable line without a contact (e.g. a manual journal) stays on the control
    # account, which then needs its own ledger master.
    control_used = {ln.account_id for e in entries for ln in e.lines if ln.account_id in party_accounts and ln.contact_id not in contacts}
    # Tally ledger names are unique: a party whose name is taken gets "(Customer)" / "(Vendor)".
    taken = {a.name.strip().lower() for a in accounts if a.id not in party_accounts or a.id in control_used}
    party_names: dict = {}
    for c in sorted(contacts.values(), key=lambda c: (c.type != "customer", c.display_name.lower(), c.id)):
        name = c.display_name.strip()
        if name.lower() in taken:
            name = f"{name} ({'Customer' if c.type == 'customer' else 'Vendor'})"
        n, base = 2, name
        while name.lower() in taken:
            name, n = f"{base} {n}", n + 1
        taken.add(name.lower())
        party_names[c.id] = name
    out: List[str] = [
        "<ENVELOPE>",
        "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
        "<BODY><IMPORTDATA>",
        f"<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>{_x(org.legal_name or org.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>",
        "<REQUESTDATA>",
    ]
    for a in accounts:
        if a.id in party_accounts and a.id not in control_used:
            continue  # parties get their own ledgers below
        out.append(
            f'<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="{_x(a.name)}" ACTION="Create">'
            f"<NAME>{_x(a.name)}</NAME><PARENT>{_x(_group(a))}</PARENT></LEDGER></TALLYMESSAGE>"
        )
    for cid in sorted(used_party_ids | {c.id for c in contacts.values() if c.is_active}):
        c = contacts.get(cid)
        if c is None:
            continue
        parent = "Sundry Debtors" if c.type == "customer" else "Sundry Creditors"
        gst = f"<PARTYGSTIN>{_x(c.gstin)}</PARTYGSTIN>" if c.gstin else ""
        out.append(
            f'<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="{_x(party_names[c.id])}" ACTION="Create">'
            f"<NAME>{_x(party_names[c.id])}</NAME><PARENT>{parent}</PARENT>{gst}</LEDGER></TALLYMESSAGE>"
        )
    for e in entries:
        vtype = "Journal" if e.is_reversal else _VOUCHER_TYPES.get(e.source_type, "Journal")
        lines = []
        for ln in e.lines:
            ledger = by_id[ln.account_id].name
            if ln.account_id in party_accounts and ln.contact_id in contacts:
                ledger = party_names[ln.contact_id]
            debit = ln.debit > 0
            # Tally signs amounts: debits negative, credits positive.
            amount = -ln.debit if debit else ln.credit
            lines.append(
                f"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{_x(ledger)}</LEDGERNAME>"
                f"<ISDEEMEDPOSITIVE>{'Yes' if debit else 'No'}</ISDEEMEDPOSITIVE><AMOUNT>{_amount(amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>"
            )
        narration = " ".join(x for x in (e.reference, e.notes) if x)
        out.append(
            f'<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="{vtype}" ACTION="Create">'
            f"<DATE>{e.date.strftime('%Y%m%d')}</DATE><VOUCHERTYPENAME>{vtype}</VOUCHERTYPENAME>"
            f"<VOUCHERNUMBER>{_x(e.entry_number)}</VOUCHERNUMBER><NARRATION>{_x(narration)}</NARRATION>"
            + "".join(lines)
            + "</VOUCHER></TALLYMESSAGE>"
        )
    out += ["</REQUESTDATA>", "</IMPORTDATA></BODY>", "</ENVELOPE>"]
    return "\n".join(out)


@dataclass
class ImportResult:
    accounts_created: int = 0
    customers_created: int = 0
    vendors_created: int = 0
    skipped: int = 0
    errors: List[str] = field(default_factory=list)


def _text(el: ET.Element, tag: str) -> str:
    found = el.find(tag)
    return (found.text or "").strip() if found is not None and found.text else ""


def _parse(content: bytes) -> ET.Element:
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "The Tally file is larger than 5 MB")
    text = content.decode("utf-16") if content[:2] in (b"\xff\xfe", b"\xfe\xff") else content.decode("utf-8", errors="replace")
    # Checked after decoding, so a UTF-16 file cannot hide one; defusedxml refuses them as well.
    if "<!DOCTYPE" in text.upper() or "<!ENTITY" in text.upper():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file contains a DOCTYPE, which is not allowed")
    # Tally writes control characters as &#4; etc., which XML 1.0 forbids.
    text = re.sub(r"&#(?:[0-8]|1[124-9]|2[0-9]|3[01]);", "", text)
    try:
        return SafeET.fromstring(text, forbid_dtd=True)
    except (ET.ParseError, DefusedXmlException) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This is not a Tally XML file ({exc})") from exc


def import_ledgers(db: Session, org_id: str, content: bytes) -> ImportResult:
    root = _parse(content)
    result = ImportResult()
    accounts = {a.name.strip().lower(): a for a in db.execute(select(Account).where(Account.organization_id == org_id)).scalars()}
    codes = set(db.execute(select(Account.code).where(Account.organization_id == org_id)).scalars())
    contacts = {
        (c.type, c.display_name.strip().lower()) for c in db.execute(select(Contact).where(Contact.organization_id == org_id)).scalars()
    }
    next_code: Dict[str, int] = dict(_CODE_BASE)
    ledgers = root.iter("LEDGER")
    for ledger in ledgers:
        name = (ledger.get("NAME") or _text(ledger, "NAME")).strip()
        parent = _text(ledger, "PARENT")
        if not name:
            result.skipped += 1
            continue
        group = parent.lower()
        if group in ("sundry debtors", "sundry creditors"):
            kind = "customer" if group == "sundry debtors" else "vendor"
            if (kind, name.lower()) in contacts:
                result.skipped += 1
                continue
            gstin = _text(ledger, "PARTYGSTIN") or _text(ledger, "GSTIN") or None
            email = _text(ledger, "EMAIL") or None
            db.add(Contact(organization_id=org_id, type=kind, display_name=name[:200], gstin=gstin, email=email))
            contacts.add((kind, name.lower()))
            if kind == "customer":
                result.customers_created += 1
            else:
                result.vendors_created += 1
            continue
        if name.lower() in accounts:
            result.skipped += 1
            continue
        if group in _BANK_GROUPS:
            result.skipped += 1
            result.errors.append(f"{name}: add bank and cash accounts in Banking")
            continue
        mapped: Optional[tuple] = _GROUP_TYPES.get(group)
        if mapped is None:
            result.skipped += 1
            result.errors.append(f"{name}: group '{parent or '?'}' is not a Tally primary group, skipped")
            continue
        acct_type, subtype = mapped
        code = next_code[acct_type]
        while str(code) in codes:
            code += 1
        next_code[acct_type] = code + 1
        codes.add(str(code))
        acct = Account(
            organization_id=org_id,
            code=str(code),
            name=name[:120],
            type=acct_type,
            subtype=subtype,
            description=f"Imported from Tally ({parent})",
        )
        db.add(acct)
        accounts[name.lower()] = acct
        result.accounts_created += 1
    db.flush()
    return result
