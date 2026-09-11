"""Column mapping and validation for the Excel / CSV data import.

The previous importer guessed fields with loose substring matching over
whatever column happened to come first ("name" matched *Item* Name before
*Customer* Name, "rate" matched *Tax* Rate before Amount), and the commit
step invented values for anything missing. That silently produced wrong
books, so mapping here is explicit: a column is recognised only if its header
matches a known alias, required columns are reported to the user instead of
being defaulted, and values are parsed to real dates/decimals up front.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

CATEGORIES = ("customers", "vendors", "invoices", "bills", "expenses")


@dataclass(frozen=True)
class ColumnRule:
    """One importable field and the header spellings accepted for it."""

    field: str
    label: str
    aliases: Tuple[str, ...]
    required: bool = False
    kind: str = "text"  # text | amount | date | email


def _r(field_name: str, label: str, aliases: str, required: bool = False, kind: str = "text") -> ColumnRule:
    return ColumnRule(field_name, label, tuple(a.strip() for a in aliases.split(",")), required, kind)


CATEGORY_RULES: Dict[str, List[ColumnRule]] = {
    "customers": [
        _r("display_name", "Display Name", "display_name,customer_name,name,customer,party_name,client_name,account_name", required=True),
        _r("company_name", "Company Name", "company_name,company,legal_name,business_name"),
        _r("email", "Email", "email,email_address,e_mail,mail,contact_email", kind="email"),
        _r("phone", "Phone", "phone,phone_number,mobile,mobile_number,contact_number,telephone"),
        _r("gstin", "GSTIN", "gstin,gst_number,gst_no,gst"),
        _r("pan", "PAN", "pan,pan_number,pan_no"),
        _r("billing_address", "Billing Address", "billing_address,address,billing,street_address,postal_address"),
    ],
    "vendors": [
        _r("display_name", "Vendor Name", "vendor_name,display_name,supplier_name,name,vendor,supplier,party_name", required=True),
        _r("company_name", "Company Name", "company_name,company,legal_name,business_name"),
        _r("email", "Email", "email,email_address,e_mail,mail,contact_email", kind="email"),
        _r("phone", "Phone", "phone,phone_number,mobile,mobile_number,contact_number,telephone"),
        _r("gstin", "GSTIN", "gstin,gst_number,gst_no,gst"),
        _r("pan", "PAN", "pan,pan_number,pan_no"),
        _r("billing_address", "Billing Address", "billing_address,address,billing,street_address,postal_address"),
    ],
    "invoices": [
        _r("display_name", "Customer Name", "customer_name,customer,display_name,client_name,party_name,billed_to,bill_to", required=True),
        _r("amount", "Amount", "amount,total,total_amount,invoice_amount,grand_total,value", required=True, kind="amount"),
        _r("date", "Date", "date,invoice_date,issue_date,bill_date,document_date", required=True, kind="date"),
        _r("due_date", "Due Date", "due_date,payment_due,due,due_on", kind="date"),
        _r("email", "Email", "email,email_address,e_mail,customer_email,contact_email", kind="email"),
        _r("invoice_number", "Invoice Number", "invoice_number,invoice_no,invoice,inv_no,document_number,reference"),
        _r("notes", "Notes", "notes,note,description,particulars,remarks,details,narration"),
    ],
    "bills": [
        _r("display_name", "Vendor Name", "vendor_name,vendor,supplier_name,supplier,display_name,party_name,billed_by", required=True),
        _r("amount", "Amount", "amount,total,total_amount,bill_amount,grand_total,value", required=True, kind="amount"),
        _r("date", "Date", "date,bill_date,invoice_date,issue_date,document_date", required=True, kind="date"),
        _r("due_date", "Due Date", "due_date,payment_due,due,due_on", kind="date"),
        _r("bill_number", "Bill Number", "bill_number,bill_no,vendor_bill_number,reference,document_number"),
        _r("notes", "Notes", "notes,note,description,particulars,remarks,details,narration"),
    ],
    "expenses": [
        _r("amount", "Amount", "amount,total,total_amount,expense_amount,value,spent", required=True, kind="amount"),
        _r("date", "Date", "date,expense_date,paid_on,payment_date,document_date", required=True, kind="date"),
        _r("category", "Category", "category,expense_category,head,expense_head,type"),
        _r("payee", "Payee", "payee,paid_to,vendor_name,vendor,supplier,merchant,party_name"),
        _r("notes", "Notes", "notes,note,description,particulars,remarks,details,narration"),
    ],
}


def normalise_header(header: str) -> str:
    """"Due Date " -> "due_date" so spelling/spacing differences still match."""
    return re.sub(r"[^a-z0-9]+", "_", str(header or "").strip().lower()).strip("_")


def detect_category(sheet_name: str, headers: List[str]) -> Optional[str]:
    """Work out which module a sheet belongs to, by sheet name then headers."""
    name = normalise_header(sheet_name)
    for category in CATEGORIES:
        if category[:-1] in name or category in name:  # "invoice" in "invoices_q3"
            return category
    if "sale" in name:
        return "invoices"
    if "purchase" in name:
        return "bills"
    if "client" in name:
        return "customers"
    if "supplier" in name:
        return "vendors"

    normalised = {normalise_header(h) for h in headers if str(h or "").strip()}
    # Score each category by how many of its columns are actually present,
    # rather than letting one loose keyword decide.
    best, best_score = None, 0
    for category, rules in CATEGORY_RULES.items():
        score = sum(1 for rule in rules if normalised & set(rule.aliases))
        required_hit = all(normalised & set(r.aliases) for r in rules if r.required)
        if required_hit and score > best_score:
            best, best_score = category, score
    return best


@dataclass
class ColumnMapping:
    category: str
    sheet_name: str
    headers: List[str]
    mapped: Dict[str, str] = field(default_factory=dict)  # field -> the header it came from
    missing_required: List[str] = field(default_factory=list)  # human labels
    unmapped_headers: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.missing_required


def map_columns(headers: List[str], category: str, sheet_name: str = "") -> ColumnMapping:
    """Match each header to at most one field, exactly, by alias."""
    rules = CATEGORY_RULES[category]
    normalised = [(idx, normalise_header(h)) for idx, h in enumerate(headers)]

    mapping = ColumnMapping(category=category, sheet_name=sheet_name, headers=list(headers))
    used_indexes: set[int] = set()

    for rule in rules:
        for idx, norm in normalised:
            if idx in used_indexes or not norm:
                continue
            if norm in rule.aliases:
                mapping.mapped[rule.field] = headers[idx]
                used_indexes.add(idx)
                break

    for rule in rules:
        if rule.required and rule.field not in mapping.mapped:
            mapping.missing_required.append(rule.label)

    mapping.unmapped_headers = [
        headers[idx] for idx, norm in normalised if idx not in used_indexes and norm
    ]
    return mapping


def coerce_amount(value: Any) -> Optional[Decimal]:
    """"₹ 1,25,000.50" -> Decimal("125000.50"); returns None when unusable."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return Decimal(str(value))
    text = re.sub(r"[^\d.\-]", "", str(value).strip())
    if not text or text in {"-", ".", "-."}:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


_DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y", "%b %d, %Y")


def coerce_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


@dataclass
class ParsedRow:
    row_number: int
    data: Dict[str, Any]
    errors: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def parse_rows(
    raw_rows: List[List[str]],
    headers: List[str],
    mapping: ColumnMapping,
    first_data_row: int = 2,
) -> List[ParsedRow]:
    """Turn spreadsheet rows into typed dicts, recording per-row problems."""
    rules = {rule.field: rule for rule in CATEGORY_RULES[mapping.category]}
    index_of = {header: idx for idx, header in enumerate(headers)}
    parsed: List[ParsedRow] = []

    for offset, raw in enumerate(raw_rows):
        row = ParsedRow(row_number=first_data_row + offset, data={})
        for field_name, header in mapping.mapped.items():
            idx = index_of.get(header)
            raw_value = raw[idx] if idx is not None and idx < len(raw) else ""
            rule = rules[field_name]

            if rule.kind == "amount":
                amount = coerce_amount(raw_value)
                if amount is None:
                    if rule.required:
                        row.errors.append(f"{rule.label} is missing or not a number")
                elif amount < 0:
                    row.errors.append(f"{rule.label} cannot be negative")
                else:
                    row.data[field_name] = amount
            elif rule.kind == "date":
                parsed_date = coerce_date(raw_value)
                if parsed_date is None:
                    if rule.required:
                        row.errors.append(f"{rule.label} is missing or not a recognisable date")
                else:
                    row.data[field_name] = parsed_date
            else:
                text = str(raw_value or "").strip()
                if not text and rule.required:
                    row.errors.append(f"{rule.label} is blank")
                elif text:
                    row.data[field_name] = text

        if not row.data and not row.errors:
            continue  # entirely blank row
        parsed.append(row)

    return parsed


def rules_for_display(category: str) -> Dict[str, List[Dict[str, Any]]]:
    """The column contract, for showing the user what a sheet must contain."""
    return {
        "required": [
            {"label": rule.label, "accepts": list(rule.aliases), "type": rule.kind}
            for rule in CATEGORY_RULES[category]
            if rule.required
        ],
        "optional": [
            {"label": rule.label, "accepts": list(rule.aliases), "type": rule.kind}
            for rule in CATEGORY_RULES[category]
            if not rule.required
        ],
    }
