"""AI assistant built on the Claude API.

- Read a receipt or bill (photo or PDF) into a draft bill / expense the user reviews.
- Suggest the ledger account for bank or statement lines.
- Answer questions about the books, using read-only tools over this
  organization's own data (reports, invoices, bills, balances).

Nothing here posts to the books: extraction and categorisation return
suggestions, and the question tools only read. With no ANTHROPIC_API_KEY the
endpoints answer 503 and the rest of the app is unaffected.
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import date
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional

import anthropic
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.config import get_settings
from backend.models import Account, Bill, Contact, Invoice, Organization, User

logger = logging.getLogger("roomanbooks.ai")

# Models that accept the server-side refusal fallback (fallbacks: "default").
_FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
PDF_TYPE = "application/pdf"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_TOOL_TURNS = 8
MAX_TOOL_RESULT_CHARS = 20000

# Tests replace this to avoid the network.
client_factory: Callable[[], Any] = lambda: anthropic.Anthropic(api_key=get_settings().anthropic_api_key)  # noqa: E731


def configured() -> bool:
    return bool(get_settings().anthropic_api_key)


def _client():
    if not configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The AI assistant is not set up: ask the administrator to add an ANTHROPIC_API_KEY"
        )
    return client_factory()


def create(**kwargs):
    """One Messages API call with the configured model, refusal fallback, and error mapping."""
    model = get_settings().ai_model
    extra: Dict[str, Any] = {}
    if model in _FALLBACK_MODELS:
        # If a safety classifier declines, the API re-runs the request on a suitable model.
        extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    try:
        response = _client().beta.messages.create(model=model, **extra, **kwargs)
    except anthropic.AuthenticationError as exc:
        logger.error("Claude API rejected the API key: %s", exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The AI assistant's API key is not valid") from exc
    except anthropic.RateLimitError as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "The AI assistant is busy; try again in a minute") from exc
    except anthropic.BadRequestError as exc:
        logger.warning("Claude API bad request: %s", exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The AI assistant could not process this request") from exc
    except anthropic.APIStatusError as exc:
        logger.warning("Claude API error %s: %s", exc.status_code, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI service had a problem; try again shortly") from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not reach the AI service") from exc
    if response.stop_reason == "refusal":
        detail = getattr(response.stop_details, "explanation", None) if response.stop_details else None
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail or "The AI assistant declined this request")
    return response


def _text(response) -> str:
    return "".join(block.text for block in response.content if block.type == "text")


def _json(response) -> Dict[str, Any]:
    if response.stop_reason == "max_tokens":
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI answer was cut short; try a smaller file")
    try:
        return json.loads(_text(response))
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI answer could not be read") from exc


def _accounts(db: Session, org_id: str, types: tuple) -> List[Account]:
    return list(
        db.execute(
            select(Account)
            .where(Account.organization_id == org_id, Account.is_active.is_(True), Account.type.in_(types))
            .order_by(Account.code)
        ).scalars()
    )


def _account_list(accounts: List[Account]) -> str:
    return "\n".join(f"{a.code}: {a.name} ({a.type})" for a in accounts)


# --------------------------------------------------------------------------- #
# Receipt / bill reading
# --------------------------------------------------------------------------- #
_LINE_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "hsn_sac": {"type": "string"},
        "quantity": {"type": "number"},
        "rate": {"type": "number"},
        "tax_rate": {"type": "number"},
        "amount": {"type": "number"},
        "account_code": {"type": "string"},
    },
    "required": ["description", "hsn_sac", "quantity", "rate", "tax_rate", "amount", "account_code"],
    "additionalProperties": False,
}
_DOCUMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "document_type": {"type": "string", "enum": ["bill", "expense_receipt", "not_a_bill"]},
        "vendor_name": {"type": "string"},
        "vendor_gstin": {"type": "string"},
        "bill_number": {"type": "string"},
        "date": {"type": "string"},
        "due_date": {"type": "string"},
        "currency": {"type": "string"},
        "subtotal": {"type": "number"},
        "discount": {"type": "number"},
        "tax_total": {"type": "number"},
        "total": {"type": "number"},
        "payment_method": {"type": "string"},
        "category": {"type": "string"},
        "lines": {"type": "array", "items": _LINE_SCHEMA},
        "notes": {"type": "string"},
    },
    "required": [
        "document_type",
        "vendor_name",
        "vendor_gstin",
        "bill_number",
        "date",
        "due_date",
        "currency",
        "subtotal",
        "discount",
        "tax_total",
        "total",
        "payment_method",
        "category",
        "lines",
        "notes",
    ],
    "additionalProperties": False,
}


def extract_document(db: Session, org_id: str, data: bytes, media_type: str) -> Dict[str, Any]:
    """Read a bill or receipt into a draft; matches the vendor and validates the suggested accounts."""
    if media_type not in IMAGE_TYPES and media_type != PDF_TYPE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload a JPG, PNG, WEBP or GIF photo, or a PDF")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is larger than 10 MB")
    accounts = _accounts(db, org_id, ("expense", "asset"))
    encoded = base64.standard_b64encode(data).decode("ascii")
    source = {"type": "base64", "media_type": media_type, "data": encoded}
    block = {"type": "document", "source": source} if media_type == PDF_TYPE else {"type": "image", "source": source}
    instructions = (
        "Read this purchase document (a vendor bill, tax invoice or receipt) for an Indian business's books.\n"
        "Copy figures exactly as printed. Dates as YYYY-MM-DD; use an empty string for anything not shown and 0 for missing amounts.\n"
        "tax_rate is the GST percentage of each line (CGST + SGST, or IGST). amount is the line value before tax.\n"
        "For each line choose the best account_code from this chart of accounts (expense or asset accounts only):\n"
        f"{_account_list(accounts)}\n"
        "category is a short expense heading such as Travel, Office Supplies or Rent. "
        "document_type is expense_receipt for a paid receipt, bill for an invoice to be paid later, not_a_bill if this is not a purchase document."
    )
    response = create(
        max_tokens=8000,
        messages=[{"role": "user", "content": [block, {"type": "text", "text": instructions}]}],
        output_config={"format": {"type": "json_schema", "schema": _DOCUMENT_SCHEMA}},
    )
    draft = _json(response)
    by_code = {a.code: a for a in accounts}
    for line in draft.get("lines", []):
        account = by_code.get(str(line.get("account_code", "")).strip())
        line["account_id"] = account.id if account else None
        line["account_name"] = account.name if account else None
    draft["vendor_id"] = _match_contact(db, org_id, "vendor", draft.get("vendor_gstin"), draft.get("vendor_name"))
    return draft


def _match_contact(db: Session, org_id: str, kind: str, gstin: Optional[str], name: Optional[str]) -> Optional[str]:
    gstin = (gstin or "").strip().upper()
    if gstin:
        found = (
            db.execute(
                select(Contact.id).where(Contact.organization_id == org_id, Contact.type == kind, func.upper(Contact.gstin) == gstin)
            )
            .scalars()
            .first()
        )
        if found:
            return found
    name = (name or "").strip().lower()
    if name:
        return (
            db.execute(
                select(Contact.id).where(Contact.organization_id == org_id, Contact.type == kind, func.lower(Contact.display_name) == name)
            )
            .scalars()
            .first()
        )
    return None


# --------------------------------------------------------------------------- #
# Categorisation
# --------------------------------------------------------------------------- #
_CATEGORY_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "account_code": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                    "reason": {"type": "string"},
                },
                "required": ["index", "account_code", "confidence", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["suggestions"],
    "additionalProperties": False,
}


def categorize(db: Session, org_id: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Suggest the counter-account for each bank / statement line."""
    accounts = [
        a
        for a in _accounts(db, org_id, ("income", "expense", "asset", "liability", "equity"))
        if a.subtype not in ("bank", "cash", "credit_card")
    ]
    listing = "\n".join(f"{i}: {r.get('type', '')} {r.get('amount', '')} - {r.get('description', '')}" for i, r in enumerate(rows))
    response = create(
        max_tokens=8000,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": _CATEGORY_SCHEMA}},
        messages=[
            {
                "role": "user",
                "content": (
                    "These are lines from an Indian business's bank statement (deposit = money in, withdrawal = money out). "
                    "For every line give the account it should be booked against, from this chart of accounts:\n"
                    f"{_account_list(accounts)}\n\n"
                    "Use 1100 Accounts Receivable for customer payments and 2000 Accounts Payable for vendor payments only when the line clearly names one. "
                    "Say low confidence when the description does not make it clear.\n\nLines:\n" + listing
                ),
            }
        ],
    )
    by_code = {a.code: a for a in accounts}
    out = []
    for s in _json(response).get("suggestions", []):
        account = by_code.get(str(s.get("account_code", "")).strip())
        index = s.get("index")
        if account is None or not isinstance(index, int) or not 0 <= index < len(rows):
            continue
        out.append(
            {
                "index": index,
                "account_id": account.id,
                "account_code": account.code,
                "account_name": account.name,
                "confidence": s.get("confidence"),
                "reason": s.get("reason", ""),
            }
        )
    return sorted(out, key=lambda s: s["index"])


# --------------------------------------------------------------------------- #
# Ask your books
# --------------------------------------------------------------------------- #
def _date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"'{value}' is not a YYYY-MM-DD date") from exc


def _dump(model) -> Any:
    return model.model_dump(mode="json", by_alias=False) if hasattr(model, "model_dump") else model


_PERIOD = {
    "type": "object",
    "properties": {
        "start_date": {"type": "string", "description": "YYYY-MM-DD; defaults to the start of the financial year"},
        "end_date": {"type": "string", "description": "YYYY-MM-DD; defaults to today"},
    },
    "additionalProperties": False,
}
_AS_OF = {
    "type": "object",
    "properties": {"as_of": {"type": "string", "description": "YYYY-MM-DD; defaults to today"}},
    "additionalProperties": False,
}
_DOC_SEARCH = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "description": "draft, sent/open, partially_paid, paid, void, or 'unpaid' for anything still owed"},
        "contact_name": {"type": "string", "description": "Part of the customer / vendor name"},
        "start_date": {"type": "string"},
        "end_date": {"type": "string"},
        "limit": {"type": "integer", "description": "At most 50"},
    },
    "additionalProperties": False,
}

TOOLS = [
    {
        "name": "profit_and_loss",
        "description": "Income, cost of goods sold, expenses and net profit for a period, by account.",
        "input_schema": _PERIOD,
        "financial": True,
    },
    {
        "name": "balance_sheet",
        "description": "Assets, liabilities and equity as of a date, by account.",
        "input_schema": _AS_OF,
        "financial": True,
    },
    {
        "name": "cash_flow",
        "description": "Cash-flow statement for a period: operating, investing, financing and opening / closing cash.",
        "input_schema": _PERIOD,
        "financial": True,
    },
    {
        "name": "receivables_aging",
        "description": "What customers owe, by customer and by how overdue.",
        "input_schema": _AS_OF,
        "financial": False,
    },
    {
        "name": "payables_aging",
        "description": "What is owed to vendors, by vendor and by how overdue.",
        "input_schema": _AS_OF,
        "financial": False,
    },
    {"name": "sales_by_customer", "description": "Sales totals per customer for a period.", "input_schema": _PERIOD, "financial": False},
    {"name": "purchases_by_vendor", "description": "Purchase totals per vendor for a period.", "input_schema": _PERIOD, "financial": False},
    {
        "name": "expenses_by_category",
        "description": "Expense totals per category for a period.",
        "input_schema": _PERIOD,
        "financial": False,
    },
    {
        "name": "gst_summary",
        "description": "GSTR-3B style summary for a period: output tax, input credit, tax payable.",
        "input_schema": _PERIOD,
        "financial": True,
    },
    {
        "name": "search_invoices",
        "description": "Find sales invoices by status, customer and date.",
        "input_schema": _DOC_SEARCH,
        "financial": False,
    },
    {
        "name": "search_bills",
        "description": "Find vendor bills by status, vendor and date.",
        "input_schema": _DOC_SEARCH,
        "financial": False,
    },
    {
        "name": "account_balance",
        "description": "Balance of ledger accounts whose code or name matches, as of a date.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Account code or part of its name"}, "as_of": {"type": "string"}},
            "required": ["query"],
            "additionalProperties": False,
        },
        "financial": True,
    },
]


def _search_docs(db: Session, user: User, model, args: Dict[str, Any]) -> List[Dict[str, Any]]:
    is_invoice = model is Invoice
    party = Invoice.customer if is_invoice else Bill.vendor
    stmt = select(model).where(model.organization_id == user.organization_id).options(selectinload(party))
    wanted = (args.get("status") or "").strip().lower()
    if wanted == "unpaid":
        stmt = stmt.where(model.status.in_(("sent", "partially_paid") if is_invoice else ("open", "partially_paid")))
    elif wanted:
        stmt = stmt.where(model.status == wanted)
    if args.get("contact_name"):
        stmt = stmt.join(Contact, Contact.id == (Invoice.customer_id if is_invoice else Bill.vendor_id)).where(
            func.lower(Contact.display_name).like(f"%{args['contact_name'].lower()}%")
        )
    if args.get("start_date"):
        stmt = stmt.where(model.date >= _date(args["start_date"]))
    if args.get("end_date"):
        stmt = stmt.where(model.date <= _date(args["end_date"]))
    limit = max(1, min(int(args.get("limit") or 20), 50))
    rows = db.execute(stmt.order_by(model.date.desc()).limit(limit)).scalars().all()
    return [
        {
            "number": d.invoice_number if is_invoice else d.bill_number,
            "contact": (d.customer if is_invoice else d.vendor).display_name,
            "date": d.date.isoformat(),
            "due_date": d.due_date.isoformat(),
            "status": d.status,
            "total": float(d.total),
            "balance_due": float(d.balance_due),
        }
        for d in rows
    ]


def run_tool(db: Session, user: User, name: str, args: Dict[str, Any]) -> Any:
    from backend.routers import reports
    from backend.services import gst_returns, ledger

    spec = next((t for t in TOOLS if t["name"] == name), None)
    if spec is None:
        raise ValueError(f"Unknown tool {name}")
    if spec["financial"] and user.role not in ("admin", "viewer"):
        raise PermissionError("Your role cannot see ledger balances; ask an admin")
    start, end, as_of = _date(args.get("start_date")), _date(args.get("end_date")), _date(args.get("as_of"))
    if name == "profit_and_loss":
        return _dump(reports.profit_and_loss(start_date=start, end_date=end, start_date_snake=None, end_date_snake=None, user=user, db=db))
    if name == "balance_sheet":
        return _dump(reports.balance_sheet(as_of=as_of, user=user, db=db))
    if name == "cash_flow":
        return _dump(reports.cash_flow(start_date=start, end_date=end, user=user, db=db))
    if name == "receivables_aging":
        return _dump(reports.receivables_aging(as_of=as_of, user=user, db=db))
    if name == "payables_aging":
        return _dump(reports.payables_aging(as_of=as_of, user=user, db=db))
    if name in ("sales_by_customer", "purchases_by_vendor", "expenses_by_category"):
        return _dump(getattr(reports, name)(start_date=start, end_date=end, user=user, db=db))
    if name == "gst_summary":
        s, e = reports._default_range(user, start, end)
        return gst_returns.gstr3b(db, user.organization_id, s, e)
    if name == "search_invoices":
        return _search_docs(db, user, Invoice, args)
    if name == "search_bills":
        return _search_docs(db, user, Bill, args)
    if name == "account_balance":
        q = args["query"].strip().lower()
        accounts = (
            db.execute(
                select(Account)
                .where(
                    Account.organization_id == user.organization_id,
                    or_(func.lower(Account.code) == q, func.lower(Account.name).like(f"%{q}%")),
                )
                .limit(10)
            )
            .scalars()
            .all()
        )
        balances = ledger.account_balances(db, user.organization_id, end=as_of or date.today(), account_ids=[a.id for a in accounts])
        return [
            {
                "code": a.code,
                "name": a.name,
                "type": a.type,
                "balance": float(ledger.natural_balance(a.type, *balances.get(a.id, (Decimal("0"), Decimal("0"))))),
            }
            for a in accounts
        ]
    raise ValueError(f"Unknown tool {name}")


def ask(db: Session, user: User, question: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """Answer a question about the books; Claude calls the read-only tools above as it needs."""
    org = db.get(Organization, user.organization_id)
    system = (
        f"You are the bookkeeping assistant inside Rooman Books for {org.name}, an Indian business. "
        f"Its books are in {org.currency or 'INR'} and its financial year starts in month {org.fiscal_year_start_month}. "
        "Answer from the tools' data only - never guess figures - and say plainly when the data does not answer the question. "
        "Be concise: lead with the answer, then the few figures that support it. Format amounts the Indian way (e.g. Rs 1,25,000)."
    )
    tools = [{k: v for k, v in t.items() if k != "financial"} for t in TOOLS]
    messages: List[Dict[str, Any]] = []
    for turn in (history or [])[-10:]:
        if turn.get("role") in ("user", "assistant") and turn.get("content"):
            messages.append({"role": turn["role"], "content": str(turn["content"])[:4000]})
    messages.append({"role": "user", "content": f"Today is {date.today().isoformat()}.\n\n{question}"})
    used: List[str] = []
    for _ in range(MAX_TOOL_TURNS):
        response = create(max_tokens=16000, system=system, tools=tools, messages=messages)
        if response.stop_reason != "tool_use":
            return {"answer": _text(response).strip() or "I could not find an answer in your books.", "tools_used": used}
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            used.append(block.name)
            try:
                payload = json.dumps(run_tool(db, user, block.name, dict(block.input or {})), default=str)[:MAX_TOOL_RESULT_CHARS]
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": payload})
            except (ValueError, PermissionError, HTTPException) as exc:
                detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": f"Error: {detail}", "is_error": True})
        messages.append({"role": "user", "content": results})
    return {"answer": "That question needed more steps than I can take at once; try asking something narrower.", "tools_used": used}
