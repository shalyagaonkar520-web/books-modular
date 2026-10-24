"""GST returns and e-documents built from issued invoices, credit notes, bills and expenses.

- GSTR-1 (outward supplies): B2B, B2CL, B2CS, exports, credit notes (CDNR /
  CDNUR), HSN summary (B2B / B2C) and documents issued, in the GSTN offline
  tool JSON shape, plus a per-section summary for the screen.
- GSTR-3B: outward tax (3.1), inter-state supplies to unregistered persons
  (3.2), input tax credit (4), exempt inward supplies (5) and the tax payable
  after setting ITC off in the order the law prescribes (6.1).
- E-invoice (IRP schema 1.1) and e-way bill (bulk upload) JSON for an invoice.

Tax is split into CGST / SGST or IGST per document with services/gst.
"""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Dict, Iterable, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.models import (
    Bill,
    BillLine,
    CreditNote,
    CreditNoteLine,
    Expense,
    Invoice,
    InvoiceLine,
    Organization,
    VendorCredit,
    VendorCreditLine,
)
from backend.services import gst
from backend.services.money import money

ZERO = Decimal("0")
# Invoices to unregistered persons above this value, inter-state, are B2CL (from 1 Aug 2024).
B2CL_THRESHOLD = Decimal("100000")
_UQC = {"pcs": "NOS", "nos": "NOS", "kg": "KGS", "gm": "GMS", "ltr": "LTR", "box": "BOX", "set": "SET", "mtr": "MTR"}
_PIN = re.compile(r"\b(\d{6})\b")


def _r(value: Decimal) -> float:
    return float(money(value))


def _gst_date(d: date) -> str:
    return d.strftime("%d-%m-%Y")


@dataclass
class TaxLine:
    """One document line after its share of the document discount."""

    rate: Decimal
    taxable: Decimal
    tax: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    hsn: str
    description: str
    quantity: Decimal
    unit: str
    is_service: bool
    unit_price: Decimal
    gross: Decimal
    discount: Decimal


@dataclass
class TaxDoc:
    kind: str  # invoice | credit_note | bill | vendor_credit
    id: str
    number: str
    date: date
    contact_name: str
    gstin: Optional[str]
    treatment: str
    pos: Optional[str]
    inter_state: bool
    total: Decimal
    lines: List[TaxLine] = field(default_factory=list)
    reverse_charge: bool = False
    status: str = ""

    @property
    def registered(self) -> bool:
        return bool(self.gstin) and self.treatment in ("registered_business", "sez")

    def totals(self) -> Tuple[Decimal, Decimal, Decimal, Decimal]:
        """(taxable, cgst, sgst, igst)"""
        return (
            money(sum((line.taxable for line in self.lines), ZERO)),
            money(sum((line.cgst for line in self.lines), ZERO)),
            money(sum((line.sgst for line in self.lines), ZERO)),
            money(sum((line.igst for line in self.lines), ZERO)),
        )

    def by_rate(self) -> Dict[Decimal, Tuple[Decimal, Decimal, Decimal, Decimal]]:
        out: Dict[Decimal, List[Decimal]] = defaultdict(lambda: [ZERO, ZERO, ZERO, ZERO])
        for line in self.lines:
            acc = out[line.rate]
            acc[0] += line.taxable
            acc[1] += line.cgst
            acc[2] += line.sgst
            acc[3] += line.igst
        return {rate: tuple(money(v) for v in vals) for rate, vals in out.items()}


def _discount_shares(lines, discount: Decimal) -> List[Decimal]:
    """The per-line discount split exactly as services/documents.compute_lines does it."""
    shares = [ZERO] * len(lines)
    discount = money(discount or 0)
    subtotal = money(sum((line.amount for line in lines), ZERO))
    if discount <= 0 or subtotal <= 0:
        return shares
    valued = [i for i, line in enumerate(lines) if line.amount > 0]
    remaining = discount
    for n, i in enumerate(valued):
        share = remaining if n == len(valued) - 1 else money(discount * lines[i].amount / subtotal)
        share = min(share, lines[i].amount)
        shares[i] = money(share)
        remaining -= share
    return shares


def _tax_doc(kind: str, doc, contact, number: str, supplier_state: Optional[str], pos_override: Optional[str] = None) -> TaxDoc:
    pos = gst.contact_state(contact, pos_override)
    inter = gst.is_inter_state(supplier_state, pos) or contact.gst_treatment in ("overseas", "sez")
    out = TaxDoc(
        kind=kind,
        id=doc.id,
        number=number,
        date=doc.date,
        contact_name=contact.display_name,
        gstin=(contact.gstin or "").strip().upper() or None,
        treatment=contact.gst_treatment,
        pos=pos or supplier_state,
        inter_state=inter,
        total=money(doc.total),
        reverse_charge=bool(getattr(doc, "reverse_charge", False)),
        status=doc.status,
    )
    shares = _discount_shares(doc.lines, doc.discount_amount)
    for line, share in zip(doc.lines, shares, strict=True):
        item = line.item
        taxable = money(line.amount - share)
        cgst, sgst, igst = gst.split(line.tax_amount, inter)
        out.lines.append(
            TaxLine(
                rate=Decimal(str(line.tax_rate)).quantize(Decimal("0.01")),
                taxable=taxable,
                tax=money(line.tax_amount),
                cgst=cgst,
                sgst=sgst,
                igst=igst,
                hsn=(item.hsn_sac or "").strip() if item else "",
                description=line.description,
                quantity=Decimal(str(line.quantity)),
                unit=item.unit if item else "nos",
                is_service=bool(item and item.type == "service"),
                unit_price=money(line.rate),
                gross=money(line.amount),
                discount=share,
            )
        )
    return out


def _org(db: Session, org_id: str) -> Organization:
    return db.get(Organization, org_id)


def invoices_in(db: Session, org_id: str, start: date, end: date) -> List[TaxDoc]:
    org = _org(db, org_id)
    supplier = gst.org_state(org)
    rows = db.execute(
        select(Invoice)
        .where(Invoice.organization_id == org_id, Invoice.status.notin_(("draft", "void")), Invoice.date >= start, Invoice.date <= end)
        .options(selectinload(Invoice.customer), selectinload(Invoice.lines).selectinload(InvoiceLine.item))
        .order_by(Invoice.date, Invoice.invoice_number)
    ).scalars()
    return [_tax_doc("invoice", inv, inv.customer, inv.invoice_number, supplier, inv.place_of_supply) for inv in rows]


def credit_notes_in(db: Session, org_id: str, start: date, end: date) -> List[TaxDoc]:
    org = _org(db, org_id)
    supplier = gst.org_state(org)
    rows = db.execute(
        select(CreditNote)
        .where(
            CreditNote.organization_id == org_id,
            CreditNote.status.in_(("open", "closed")),
            CreditNote.date >= start,
            CreditNote.date <= end,
        )
        .options(
            selectinload(CreditNote.customer),
            selectinload(CreditNote.invoice),
            selectinload(CreditNote.lines).selectinload(CreditNoteLine.item),
        )
        .order_by(CreditNote.date, CreditNote.credit_note_number)
    ).scalars()
    return [
        _tax_doc("credit_note", cn, cn.customer, cn.credit_note_number, supplier, cn.invoice.place_of_supply if cn.invoice else None)
        for cn in rows
    ]


def bills_in(db: Session, org_id: str, start: date, end: date) -> List[TaxDoc]:
    org = _org(db, org_id)
    supplier = gst.org_state(org)
    rows = db.execute(
        select(Bill)
        .where(Bill.organization_id == org_id, Bill.status.notin_(("draft", "void")), Bill.date >= start, Bill.date <= end)
        .options(selectinload(Bill.vendor), selectinload(Bill.lines).selectinload(BillLine.item))
        .order_by(Bill.date)
    ).scalars()
    # For purchases the "supplier state" is the vendor's and the place of supply ours.
    out = []
    for bill in rows:
        vendor_state = gst.contact_state(bill.vendor, None)
        doc = _tax_doc(
            "bill", bill, bill.vendor, bill.vendor_bill_number or bill.bill_number, vendor_state, bill.place_of_supply or supplier
        )
        out.append(doc)
    return out


def vendor_credits_in(db: Session, org_id: str, start: date, end: date) -> List[TaxDoc]:
    org = _org(db, org_id)
    supplier = gst.org_state(org)
    rows = db.execute(
        select(VendorCredit)
        .where(
            VendorCredit.organization_id == org_id,
            VendorCredit.status.in_(("open", "closed")),
            VendorCredit.date >= start,
            VendorCredit.date <= end,
        )
        .options(selectinload(VendorCredit.vendor), selectinload(VendorCredit.lines).selectinload(VendorCreditLine.item))
    ).scalars()
    return [_tax_doc("vendor_credit", vc, vc.vendor, vc.vendor_credit_number, gst.contact_state(vc.vendor, None), supplier) for vc in rows]


# --------------------------------------------------------------------------- #
# GSTR-1
# --------------------------------------------------------------------------- #
def _itms(doc: TaxDoc, sign: int = 1) -> List[dict]:
    items = []
    for n, (rate, (txval, cgst, sgst, igst)) in enumerate(sorted(doc.by_rate().items()), start=1):
        det = {"rt": float(rate), "txval": _r(txval) * sign, "iamt": _r(igst) * sign, "csamt": 0}
        if not doc.inter_state:
            det.update(camt=_r(cgst) * sign, samt=_r(sgst) * sign)
        items.append({"num": n, "itm_det": det})
    return items


def _section_summary(docs: Iterable[TaxDoc]) -> dict:
    docs = list(docs)
    taxable = cgst = sgst = igst = ZERO
    for doc in docs:
        t, c, s, i = doc.totals()
        taxable, cgst, sgst, igst = taxable + t, cgst + c, sgst + s, igst + i
    return {
        "count": len(docs),
        "taxable": _r(taxable),
        "cgst": _r(cgst),
        "sgst": _r(sgst),
        "igst": _r(igst),
        "total": _r(sum((d.total for d in docs), ZERO)),
    }


def _uqc(line: TaxLine) -> str:
    return "NA" if line.is_service else _UQC.get((line.unit or "").lower(), "OTH")


def gstr1(db: Session, org_id: str, start: date, end: date) -> dict:
    org = _org(db, org_id)
    invoices = invoices_in(db, org_id, start, end)
    notes = credit_notes_in(db, org_id, start, end)

    b2b: Dict[str, List[dict]] = defaultdict(list)
    b2cl: Dict[str, List[dict]] = defaultdict(list)
    b2cs: Dict[Tuple[str, str, float], List[Decimal]] = defaultdict(lambda: [ZERO, ZERO, ZERO, ZERO])
    exp: List[dict] = []
    sections: Dict[str, List[TaxDoc]] = defaultdict(list)

    def add_b2cs(doc: TaxDoc, sign: int) -> None:
        for rate, (txval, cgst, sgst, igst) in doc.by_rate().items():
            acc = b2cs[(doc.pos or "", "INTER" if doc.inter_state else "INTRA", float(rate))]
            acc[0] += txval * sign
            acc[1] += cgst * sign
            acc[2] += sgst * sign
            acc[3] += igst * sign

    for doc in invoices:
        if doc.treatment == "overseas":
            sections["exp"].append(doc)
            exp.append(
                {
                    "inum": doc.number,
                    "idt": _gst_date(doc.date),
                    "val": _r(doc.total),
                    "itms": [
                        {"rt": float(rate), "txval": _r(v[0]), "iamt": _r(v[3]), "csamt": 0} for rate, v in sorted(doc.by_rate().items())
                    ],
                }
            )
        elif doc.registered:
            sections["b2b"].append(doc)
            b2b[doc.gstin].append(
                {
                    "inum": doc.number,
                    "idt": _gst_date(doc.date),
                    "val": _r(doc.total),
                    "pos": doc.pos or "",
                    "rchrg": "N",
                    "inv_typ": "SEWOP" if doc.treatment == "sez" else "R",
                    "itms": _itms(doc),
                }
            )
        elif doc.inter_state and doc.total > B2CL_THRESHOLD:
            sections["b2cl"].append(doc)
            b2cl[doc.pos or ""].append({"inum": doc.number, "idt": _gst_date(doc.date), "val": _r(doc.total), "itms": _itms(doc)})
        else:
            sections["b2cs"].append(doc)
            add_b2cs(doc, 1)

    cdnr: Dict[str, List[dict]] = defaultdict(list)
    cdnur: List[dict] = []
    for doc in notes:
        note = {"nt_num": doc.number, "nt_dt": _gst_date(doc.date), "ntty": "C", "val": _r(doc.total)}
        if doc.registered:
            sections["cdnr"].append(doc)
            cdnr[doc.gstin].append({**note, "pos": doc.pos or "", "rchrg": "N", "inv_typ": "R", "itms": _itms(doc)})
        elif doc.treatment == "overseas" or (doc.inter_state and doc.total > B2CL_THRESHOLD):
            sections["cdnur"].append(doc)
            cdnur.append({**note, "typ": "EXPWOP" if doc.treatment == "overseas" else "B2CL", "pos": doc.pos or "", "itms": _itms(doc)})
        else:
            # Small credit notes to consumers reduce the B2CS figures.
            sections["b2cs_credit"].append(doc)
            add_b2cs(doc, -1)

    hsn: Dict[str, Dict[Tuple[str, str, float], List[Decimal]]] = {
        "b2b": defaultdict(lambda: [ZERO] * 6),
        "b2c": defaultdict(lambda: [ZERO] * 6),
    }
    for doc, sign in [(d, 1) for d in invoices] + [(d, -1) for d in notes]:
        table = hsn["b2b" if doc.registered else "b2c"]
        for line in doc.lines:
            acc = table[(line.hsn or "NA", _uqc(line), float(line.rate))]
            acc[0] += (ZERO if line.is_service else line.quantity) * sign
            acc[1] += line.taxable * sign
            acc[2] += line.igst * sign
            acc[3] += line.cgst * sign
            acc[4] += line.sgst * sign
            acc[5] += (line.taxable + line.tax) * sign

    def hsn_rows(table) -> List[dict]:
        rows = []
        for n, ((code, uqc, rate), v) in enumerate(sorted(table.items()), start=1):
            rows.append(
                {
                    "num": n,
                    "hsn_sc": code,
                    "uqc": uqc,
                    "qty": float(v[0]),
                    "rt": rate,
                    "txval": _r(v[1]),
                    "iamt": _r(v[2]),
                    "camt": _r(v[3]),
                    "samt": _r(v[4]),
                    "csamt": 0,
                }
            )
        return rows

    numbers = sorted(d.number for d in invoices)
    voided = (
        db.execute(
            select(Invoice.invoice_number).where(
                Invoice.organization_id == org_id, Invoice.status == "void", Invoice.date >= start, Invoice.date <= end
            )
        )
        .scalars()
        .all()
    )
    all_numbers = sorted(numbers + list(voided))
    doc_issue = {"doc_det": []}
    if all_numbers:
        doc_issue["doc_det"].append(
            {
                "doc_num": 1,
                "docs": [
                    {
                        "num": 1,
                        "from": all_numbers[0],
                        "to": all_numbers[-1],
                        "totnum": len(all_numbers),
                        "cancel": len(voided),
                        "net_issue": len(numbers),
                    }
                ],
            }
        )

    payload = {
        "gstin": (org.gstin or "").upper(),
        "fp": end.strftime("%m%Y"),
        "version": "GST3.2.1",
        "hash": "hash",
        "b2b": [{"ctin": ctin, "inv": invs} for ctin, invs in sorted(b2b.items())],
        "b2cl": [{"pos": pos, "inv": invs} for pos, invs in sorted(b2cl.items())],
        "b2cs": [
            {
                "sply_ty": sply,
                "pos": pos,
                "typ": "OE",
                "rt": rate,
                "txval": _r(v[0]),
                "iamt": _r(v[3]),
                "camt": _r(v[1]),
                "samt": _r(v[2]),
                "csamt": 0,
            }
            for (pos, sply, rate), v in sorted(b2cs.items())
            if any(v)
        ],
        "exp": [{"exp_typ": "WOPAY", "inv": exp}] if exp else [],
        "cdnr": [{"ctin": ctin, "nt": nts} for ctin, nts in sorted(cdnr.items())],
        "cdnur": cdnur,
        "hsn": {"hsn_b2b": hsn_rows(hsn["b2b"]), "hsn_b2c": hsn_rows(hsn["b2c"])},
        "doc_issue": doc_issue,
    }
    summary = {name: _section_summary(sections.get(name, [])) for name in ("b2b", "b2cl", "b2cs", "exp", "cdnr", "cdnur", "b2cs_credit")}
    warnings = []
    if not org.gstin:
        warnings.append("The organization has no GSTIN; add it in Settings before filing.")
    if not gst.org_state(org):
        warnings.append("The organization's state is unknown, so every supply is treated as intra-state.")
    missing_hsn = sorted({d.number for d in invoices for line in d.lines if not line.hsn})
    if missing_hsn:
        warnings.append(f"{len(missing_hsn)} invoice(s) have lines without an HSN/SAC code: {', '.join(missing_hsn[:5])}")
    return {"period": {"start": start.isoformat(), "end": end.isoformat()}, "summary": summary, "warnings": warnings, "json": payload}


# --------------------------------------------------------------------------- #
# GSTR-3B
# --------------------------------------------------------------------------- #
def _heads(docs: Iterable[TaxDoc], predicate=lambda line: True, sign: int = 1) -> Dict[str, Decimal]:
    out = {"taxable": ZERO, "igst": ZERO, "cgst": ZERO, "sgst": ZERO}
    for doc in docs:
        for line in doc.lines:
            if predicate(line):
                out["taxable"] += line.taxable * sign
                out["igst"] += line.igst * sign
                out["cgst"] += line.cgst * sign
                out["sgst"] += line.sgst * sign
    return out


def _add(a: Dict[str, Decimal], b: Dict[str, Decimal]) -> Dict[str, Decimal]:
    return {k: a[k] + b[k] for k in a}


def _out(heads: Dict[str, Decimal]) -> Dict[str, float]:
    return {k: _r(v) for k, v in heads.items()}


def set_off(liability: Dict[str, Decimal], credit: Dict[str, Decimal]) -> Dict[str, Dict[str, float]]:
    """Use ITC against output tax in the statutory order (sections 49 / 49A / 49B):
    IGST credit first against IGST, then CGST, then SGST; CGST credit against
    CGST then IGST; SGST credit against SGST then IGST. CGST and SGST credit
    never cross. Returns credit used per head and the cash still payable."""
    owed = {h: max(ZERO, liability[h]) for h in ("igst", "cgst", "sgst")}
    avail = {h: max(ZERO, credit[h]) for h in ("igst", "cgst", "sgst")}
    used = {h: ZERO for h in owed}

    def use(src: str, dst: str) -> None:
        take = min(avail[src], owed[dst])
        avail[src] -= take
        owed[dst] -= take
        used[dst] += take

    for dst in ("igst", "cgst", "sgst"):
        use("igst", dst)
    use("cgst", "cgst")
    use("cgst", "igst")
    use("sgst", "sgst")
    use("sgst", "igst")
    return {
        "creditUsed": {h: _r(v) for h, v in used.items()},
        "cashPayable": {h: _r(v) for h, v in owed.items()},
        "creditCarriedForward": {h: _r(v) for h, v in avail.items()},
    }


def gstr3b(db: Session, org_id: str, start: date, end: date) -> dict:
    invoices = invoices_in(db, org_id, start, end)
    notes = credit_notes_in(db, org_id, start, end)
    bills = bills_in(db, org_id, start, end)
    vcredits = vendor_credits_in(db, org_id, start, end)
    expenses = (
        db.execute(select(Expense).where(Expense.organization_id == org_id, Expense.date >= start, Expense.date <= end)).scalars().all()
    )

    domestic = [d for d in invoices if d.treatment not in ("overseas", "sez")]
    zero_rated_docs = [d for d in invoices if d.treatment in ("overseas", "sez")]
    domestic_notes = [d for d in notes if d.treatment not in ("overseas", "sez")]
    taxed = lambda line: line.rate > 0  # noqa: E731
    nil = lambda line: line.rate == 0  # noqa: E731

    a = _add(_heads(domestic, taxed), _heads(domestic_notes, taxed, -1))
    b = _add(_heads(zero_rated_docs), _heads([d for d in notes if d.treatment in ("overseas", "sez")], sign=-1))
    c = _add(_heads(domestic, nil), _heads(domestic_notes, nil, -1))
    rcm_bills = [d for d in bills if d.reverse_charge]
    d = _heads(rcm_bills)

    # 3.2: inter-state supplies to unregistered persons, by place of supply.
    by_pos: Dict[str, List[Decimal]] = defaultdict(lambda: [ZERO, ZERO])
    for doc in domestic:
        if doc.inter_state and not doc.registered:
            taxable, _, _, igst = doc.totals()
            by_pos[doc.pos or ""][0] += taxable
            by_pos[doc.pos or ""][1] += igst

    itc_rcm = {k: d[k] for k in ("igst", "cgst", "sgst")}
    other = _heads([x for x in bills if not x.reverse_charge])
    for e in expenses:
        # Expenses carry no vendor state: treated as intra-state purchases.
        cg, sg, ig = gst.split(e.tax_amount, False)
        other["igst"] += ig
        other["cgst"] += cg
        other["sgst"] += sg
    itc_other = {k: other[k] for k in ("igst", "cgst", "sgst")}
    reversed_ = _heads(vcredits)
    reversed_itc = {k: reversed_[k] for k in ("igst", "cgst", "sgst")}
    net_itc = {k: itc_rcm[k] + itc_other[k] - reversed_itc[k] for k in itc_rcm}

    exempt_inward = sum((line.taxable for doc in bills for line in doc.lines if line.rate == 0), ZERO)
    liability = {k: a[k] + b[k] for k in ("igst", "cgst", "sgst")}
    payment = set_off(liability, net_itc)
    # Reverse-charge tax must be paid in cash; it cannot be set off.
    payment["reverseChargeCash"] = {k: _r(itc_rcm[k]) for k in itc_rcm}

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "outward": {"taxable": _out(a), "zeroRated": _out(b), "nilExempt": _out(c), "inwardReverseCharge": _out(d)},
        "interStateUnregistered": [
            {"pos": pos, "state": gst.state_label(pos), "taxable": _r(v[0]), "igst": _r(v[1])} for pos, v in sorted(by_pos.items())
        ],
        "itc": {
            "reverseCharge": {k: _r(v) for k, v in itc_rcm.items()},
            "allOther": {k: _r(v) for k, v in itc_other.items()},
            "reversed": {k: _r(v) for k, v in reversed_itc.items()},
            "net": {k: _r(v) for k, v in net_itc.items()},
        },
        "exemptInward": _r(exempt_inward),
        "payment": payment,
    }


# --------------------------------------------------------------------------- #
# Registers
# --------------------------------------------------------------------------- #
def tds_register(db: Session, org_id: str, start: date, end: date) -> dict:
    bills = (
        db.execute(
            select(Bill)
            .where(
                Bill.organization_id == org_id,
                Bill.status.notin_(("draft", "void")),
                Bill.tds_amount > 0,
                Bill.date >= start,
                Bill.date <= end,
            )
            .options(selectinload(Bill.vendor))
            .order_by(Bill.date)
        )
        .scalars()
        .all()
    )
    rows = [
        {
            "billId": b.id,
            "date": b.date.isoformat(),
            "billNumber": b.bill_number,
            "vendorName": b.vendor.display_name,
            "vendorPan": b.vendor.pan,
            "section": b.tds_section,
            "rate": float(b.tds_rate),
            "taxable": _r(b.subtotal - b.discount_amount),
            "tds": _r(b.tds_amount),
        }
        for b in bills
    ]
    by_section: Dict[str, List[Decimal]] = defaultdict(lambda: [ZERO, ZERO])
    for b in bills:
        by_section[b.tds_section or ""][0] += b.subtotal - b.discount_amount
        by_section[b.tds_section or ""][1] += b.tds_amount
    invoices = (
        db.execute(
            select(Invoice)
            .where(
                Invoice.organization_id == org_id,
                Invoice.status.notin_(("draft", "void")),
                Invoice.tcs_amount > 0,
                Invoice.date >= start,
                Invoice.date <= end,
            )
            .options(selectinload(Invoice.customer))
            .order_by(Invoice.date)
        )
        .scalars()
        .all()
    )
    tcs = [
        {
            "invoiceId": i.id,
            "date": i.date.isoformat(),
            "invoiceNumber": i.invoice_number,
            "customerName": i.customer.display_name,
            "customerPan": i.customer.pan,
            "rate": float(i.tcs_rate),
            "tcs": _r(i.tcs_amount),
        }
        for i in invoices
    ]
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "tds": rows,
        "tdsBySection": [{"section": s, "taxable": _r(v[0]), "tds": _r(v[1])} for s, v in sorted(by_section.items())],
        "tdsTotal": _r(sum((b.tds_amount for b in bills), ZERO)),
        "tcs": tcs,
        "tcsTotal": _r(sum((i.tcs_amount for i in invoices), ZERO)),
        "missingPan": sorted({b.vendor.display_name for b in bills if not b.vendor.pan}),
    }


# --------------------------------------------------------------------------- #
# E-invoice and e-way bill
# --------------------------------------------------------------------------- #
def _pin(*texts: Optional[str]) -> Optional[int]:
    for text in texts:
        match = _PIN.search(text or "")
        if match:
            return int(match.group(1))
    return None


def _first_line(text: Optional[str]) -> str:
    return (text or "").strip().splitlines()[0][:100] if (text or "").strip() else ""


def _load_invoice(db: Session, org_id: str, invoice_id: str) -> Invoice:
    inv = db.execute(
        select(Invoice)
        .where(Invoice.id == invoice_id, Invoice.organization_id == org_id)
        .options(selectinload(Invoice.customer), selectinload(Invoice.lines).selectinload(InvoiceLine.item))
    ).scalar_one_or_none()
    if inv is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if inv.status in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {inv.status} invoice cannot be reported to the GST portal")
    return inv


def einvoice_json(db: Session, org_id: str, invoice_id: str) -> dict:
    org = _org(db, org_id)
    inv = _load_invoice(db, org_id, invoice_id)
    cust = inv.customer
    supplier = gst.org_state(org)
    if not org.gstin or not supplier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add the organization's GSTIN in Settings before generating an e-invoice")
    doc = _tax_doc("invoice", inv, cust, inv.invoice_number, supplier, inv.place_of_supply)
    if doc.treatment not in ("registered_business", "sez", "overseas") or (doc.treatment != "overseas" and not doc.gstin):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "E-invoices are for registered businesses, SEZs and exports; this customer has no GSTIN"
        )
    sup_typ = {"sez": "SEZWOP", "overseas": "EXPWOP"}.get(doc.treatment, "B2B")
    items = []
    for n, line in enumerate(doc.lines, start=1):
        items.append(
            {
                "SlNo": str(n),
                "PrdDesc": line.description[:300],
                "IsServc": "Y" if line.is_service else "N",
                "HsnCd": line.hsn or "",
                "Qty": float(line.quantity),
                "Unit": "OTH" if line.is_service else _UQC.get((line.unit or "").lower(), "OTH"),
                "UnitPrice": _r(line.unit_price),
                "TotAmt": _r(line.gross),
                "Discount": _r(line.discount),
                "AssAmt": _r(line.taxable),
                "GstRt": float(line.rate),
                "IgstAmt": _r(line.igst),
                "CgstAmt": _r(line.cgst),
                "SgstAmt": _r(line.sgst),
                "TotItemVal": _r(line.taxable + line.tax),
            }
        )
    taxable, cgst, sgst, igst = doc.totals()
    buyer_state = "96" if doc.treatment == "overseas" else (gst.state_from_gstin(doc.gstin) or doc.pos or "")
    return {
        "Version": "1.1",
        "TranDtls": {"TaxSch": "GST", "SupTyp": sup_typ, "RegRev": "N", "IgstOnIntra": "N"},
        "DocDtls": {"Typ": "INV", "No": inv.invoice_number, "Dt": inv.date.strftime("%d/%m/%Y")},
        "SellerDtls": {
            "Gstin": org.gstin.upper(),
            "LglNm": org.legal_name or org.name,
            "Addr1": _first_line(org.address) or org.name,
            "Loc": org.city or "",
            "Pin": _pin(org.postal_code, org.address),
            "Stcd": supplier,
        },
        "BuyerDtls": {
            "Gstin": "URP" if doc.treatment == "overseas" else doc.gstin,
            "LglNm": cust.company_name or cust.display_name,
            "Pos": doc.pos or buyer_state,
            "Addr1": _first_line(cust.billing_address) or cust.display_name,
            "Loc": _first_line(cust.billing_address) or "",
            "Pin": 999999 if doc.treatment == "overseas" else _pin(cust.billing_address),
            "Stcd": buyer_state,
        },
        "ItemList": items,
        "ValDtls": {
            "AssVal": _r(taxable),
            "CgstVal": _r(cgst),
            "SgstVal": _r(sgst),
            "IgstVal": _r(igst),
            "Discount": 0,
            "OthChrg": _r(inv.tcs_amount),
            "TotInvVal": _r(inv.total),
        },
    }


def eway_json(
    db: Session, org_id: str, invoice_id: str, trans_mode: str = "1", distance: int = 0, vehicle_no: Optional[str] = None
) -> dict:
    org = _org(db, org_id)
    inv = _load_invoice(db, org_id, invoice_id)
    cust = inv.customer
    supplier = gst.org_state(org)
    if not org.gstin or not supplier:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add the organization's GSTIN in Settings before generating an e-way bill")
    doc = _tax_doc("invoice", inv, cust, inv.invoice_number, supplier, inv.place_of_supply)
    goods = [line for line in doc.lines if not line.is_service]
    if not goods:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An e-way bill is only needed for goods; this invoice has only services")
    taxable, cgst, sgst, igst = doc.totals()
    to_state = int(doc.pos) if doc.pos and doc.pos.isdigit() else int(supplier)
    bill = {
        "userGstin": org.gstin.upper(),
        "supplyType": "O",
        "subSupplyType": 3 if doc.treatment == "overseas" else 1,
        "docType": "INV",
        "docNo": inv.invoice_number,
        "docDate": inv.date.strftime("%d/%m/%Y"),
        "fromGstin": org.gstin.upper(),
        "fromTrdName": org.legal_name or org.name,
        "fromAddr1": _first_line(org.address),
        "fromPlace": org.city or "",
        "fromPincode": _pin(org.postal_code, org.address),
        "fromStateCode": int(supplier),
        "actFromStateCode": int(supplier),
        "toGstin": doc.gstin or "URP",
        "toTrdName": cust.company_name or cust.display_name,
        "toAddr1": _first_line(cust.shipping_address or cust.billing_address),
        "toPlace": _first_line(cust.shipping_address or cust.billing_address),
        "toPincode": _pin(cust.shipping_address, cust.billing_address),
        "toStateCode": to_state,
        "actToStateCode": to_state,
        "transactionType": 1,
        "totalValue": _r(taxable),
        "cgstValue": _r(cgst),
        "sgstValue": _r(sgst),
        "igstValue": _r(igst),
        "cessValue": 0,
        "totInvValue": _r(inv.total),
        "transMode": trans_mode,
        "transDistance": str(max(0, distance)),
        "vehicleNo": (vehicle_no or "").replace(" ", "").upper(),
        "vehicleType": "R",
        "itemList": [
            {
                "itemNo": n,
                "productName": line.description[:100],
                "productDesc": line.description[:100],
                "hsnCode": int(line.hsn) if line.hsn.isdigit() else 0,
                "quantity": float(line.quantity),
                "qtyUnit": _UQC.get((line.unit or "").lower(), "OTH"),
                "taxableAmount": _r(line.taxable),
                "cgstRate": 0 if doc.inter_state else float(line.rate) / 2,
                "sgstRate": 0 if doc.inter_state else float(line.rate) / 2,
                "igstRate": float(line.rate) if doc.inter_state else 0,
                "cessRate": 0,
            }
            for n, line in enumerate(goods, start=1)
        ],
    }
    return {"version": "1.0.0621", "billLists": [bill]}
