"""Deterministic understanding of everyday requests: zero API cost.

Most of what employees ask ("today's sales", "low stock", "pending invoices", "find ... in the
cosmetics category") is matched here with plain patterns and answered by backend functions.
Claude is consulted only when nothing here matches.

Also here: the topic guard that refuses restricted subjects (payroll, profit, bank balance...)
without any model call when the employee's workspace does not include them.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

CONFIRM_WORDS = {"yes", "y", "confirm", "confirmed", "ok", "okay", "go ahead", "proceed", "do it", "yes please", "sure", "create it", "add it", "save it", "yep", "correct"}
CANCEL_WORDS = {"no", "n", "cancel", "stop", "discard", "never mind", "nevermind", "don't", "dont", "abort", "no thanks"}
GREETINGS = re.compile(r"^(hi|hii|hello|hey|good (morning|afternoon|evening)|namaste|help|what can you do|menu)\b[\s!.?]*$", re.I)

# subject words -> (feature key, human label). A subject the workspace lacks is refused locally.
RESTRICTED_TOPICS = (
    (re.compile(r"\b(payroll|salary|salaries|payslip|pay slip|wages|employee pay)\b", re.I), "payroll", "payroll"),
    (re.compile(r"\b(profit|loss|p\s*&\s*l|balance sheet|trial balance|net income|gross margin|margin)\b", re.I), "reports", "financial reports"),
    (re.compile(r"\b(bank balance|bank account|bank statement|cash balance|razorpay)\b", re.I), "banking", "banking"),
    (re.compile(r"\b(gstr|gst return|gst filing|itc)\b", re.I), "gst", "GST filing"),
    (re.compile(r"\b(journal|chart of accounts|ledger)\b", re.I), "accounting", "accounting"),
    (re.compile(r"\b(cost price|purchase price|buying price)\b", re.I), "financial", "cost prices"),
)

# Attempts to talk the assistant out of its rules. They are not "answered" differently by the
# code (permissions never depend on the prompt); this just avoids spending a model call on them.
INJECTION = re.compile(
    r"(ignore|forget|disregard|override|bypass).{0,40}(instruction|rule|permission|restriction|previous|above|system)|"
    r"(system prompt|developer message|you are now|act as (an? )?(admin|owner)|pretend (you are|to be)|jailbreak|sudo|reveal your (prompt|instructions))",
    re.I,
)


_ACTION_WORDS = re.compile(r"\b(create|add|make|raise|send|email|mail|invoice|bill|order|update|change|set|remove|cancel|schedule|remind|transfer|record|pay|issue)\b", re.I)
_THINK_WORDS = re.compile(r"\b(analy[sz]e|analysis|compare|comparison|forecast|predict|plan|strategy|summari[sz]e|trend|breakdown|reconcile|recommend|evaluate|why did|what if|insight|report on)\b", re.I)


def is_hard(text: str) -> bool:
    """A job worth the larger model: several steps chained together, analysis / reasoning, or a long detailed brief.

    Plain pattern check (no AI, no cost). Everything else - greetings, single questions, one simple action -
    stays on the small, cheap model.
    """
    t = text.strip()
    steps = len(_ACTION_WORDS.findall(t))
    chained = bool(re.search(r"\b(and then|then|after that|and also|also|afterwards|and send|and email|and mail|and bill)\b", t, re.I))
    if _THINK_WORDS.search(t):
        return True
    if steps >= 3 or (steps >= 2 and chained):
        return True
    return len(t.split()) > 45


def is_confirm(text: str) -> bool:
    return text.strip().lower().strip("!. ") in CONFIRM_WORDS


def is_cancel(text: str) -> bool:
    return text.strip().lower().strip("!. ") in CANCEL_WORDS


def is_injection(text: str) -> bool:
    return bool(INJECTION.search(text))


def _period(t: str) -> Optional[str]:
    if "yesterday" in t:
        return "yesterday"
    if "last month" in t or "previous month" in t:
        return "last_month"
    if "this month" in t or "month" in t:
        return "month"
    if "this week" in t or "week" in t:
        return "week"
    if "this year" in t or "year" in t:
        return "year"
    if "today" in t or "so far" in t:
        return "today"
    return None


def restricted_topic(text: str) -> Optional[Dict[str, str]]:
    for pattern, feature, label in RESTRICTED_TOPICS:
        if pattern.search(text):
            return {"feature": feature, "label": label}
    return None


def route(text: str) -> Optional[Dict[str, Any]]:
    """{"tool": name, "args": {...}} for a request we can answer without a model, else None."""
    t = re.sub(r"\s+", " ", text.lower()).strip(" ?!.")
    if not t:
        return None
    # Chatty or advice-seeking messages are conversation, not a data question: leave them to the assistant.
    if len(t.split()) > 14 or re.search(r"\b(tip|tips|advice|advise|suggest|idea|ideas|why|explain|strategy|how to|how can|improve|increase|festive|season)\b", t):
        return None
    writing = re.search(r"\b(create|make|raise|add|new|generate|prepare|update|change|edit|set)\b", t)
    mine = bool(re.search(r"\b(my|mine|i have|i made|i created)\b", t))

    if re.search(r"\b(low stock|running low|running out|out of stock|reorder|below reorder|need(s)? restock|stock alert)\b", t):
        return {"tool": "low_stock_products", "args": {}}
    if re.search(r"\b(stock updates?|stock changes|stock movements?|stock adjustments?|inventory updates?)\b", t) and not writing:
        return {"tool": "stock_updates", "args": {"period": _period(t) or "today"}}
    if re.search(r"\b(categories|category list)\b", t) and not re.search(r"\bin the\b", t) and not writing:
        return {"tool": "product_categories", "args": {}}

    m = re.search(r"(?:products?|items?|stock)\s+(?:in|under|of|from)\s+(?:the\s+)?(.+?)\s+categor(?:y|ies)", t) or re.search(r"(.+?)\s+categor(?:y|ies)\s+products?", t)
    if m and not writing:
        cat = re.sub(r"^(find|show|list|search|get|display|me|all|the)\s+", "", m.group(1)).strip()
        cat = re.sub(r"^(find|show|list|search|get|display|me|all|the)\s+", "", cat).strip()
        return {"tool": "search_products", "args": {"category": cat}}

    if re.search(r"\b(best|top|biggest|largest|main)\b.*\bcustomers?\b|\bcustomers?\b.*\b(spend|buy|buys|bought)\b.*\bmost\b", t):
        return {"tool": "top_customers", "args": {"period": _period(t) or "year"}}
    if re.search(r"\b(receivables?|owed to us|customers owe|outstanding (amount|balance|payments?)|who owes)\b", t):
        return {"tool": "receivables_summary", "args": {}}
    if re.search(r"\b(overdue)\b.*\binvoices?\b|\binvoices?\b.*\boverdue\b", t):
        return {"tool": "list_invoices", "args": {"status": "overdue", "mine": mine}}
    if re.search(r"\b(pending|unpaid|open|outstanding)\b.*\binvoices?\b|\binvoices?\b.*\b(pending|unpaid|outstanding)\b", t) and not writing:
        return {"tool": "list_invoices", "args": {"status": "pending", "mine": mine}}
    if re.search(r"\b(show|list|see|view)\b.*\b(my |recent |latest )?invoices\b", t) and not writing:
        return {"tool": "list_invoices", "args": {"status": "recent", "mine": mine}}
    if re.search(r"\b(sales performance|my performance|how am i doing|my sales)\b", t) and not writing:
        return {"tool": "sales_summary", "args": {"period": _period(t) or "month", "mine": True}}
    if re.search(r"\b(sales|sold|sell|revenue|turnover)\b", t) and not writing and re.search(r"\b(what|how|show|total|much|today|month|week|year|yesterday)\b", t):
        return {"tool": "sales_summary", "args": {"period": _period(t) or "today", "mine": mine}}

    if re.search(r"\bpurchase orders?\b|\bpos\b.*\bpending\b", t) and not writing:
        return {"tool": "list_purchase_orders", "args": {}}
    if re.search(r"\b(show|list|pending|unpaid)\b.*\bbills\b", t) and not writing:
        return {"tool": "list_bills", "args": {"status": "pending" if re.search(r"pending|unpaid", t) else "all"}}
    m = re.search(r"\b(?:suppliers?|vendors?)\b(?:\s+(?:named|called|for))?\s*(.*)$", t)
    if m and not writing and re.search(r"\b(find|show|list|search|who|details)\b", t):
        return {"tool": "find_customers", "args": {"query": m.group(1).strip() or "", "kind": "vendor"}} if m.group(1).strip() else {"tool": "find_customers", "args": {"query": "a", "kind": "vendor"}}

    m = re.search(r"\bcustomers?\b(?:\s+(?:named|called|details|info|for|of))*\s*(.*)$", t)
    if m and not writing and re.search(r"\b(find|show|search|details|info|look up|who is|contact|phone|number)\b", t):
        query = re.sub(r"^(details|info|for|of|named|called)\s+", "", m.group(1)).strip()
        if query:
            return {"tool": "find_customers", "args": {"query": query, "kind": "customer"}}

    m = re.match(r"^(?:find|search(?: for)?|look up|lookup|show me|show|list|get)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:products?|items?)?\s*(?:named|called|like|matching|with)?\s*(.+)$", t)
    if m and not writing:
        query = m.group(1).strip()
        if query and not re.search(r"\b(invoices?|sales|customers?|suppliers?|orders?|bills?)\b", query):
            return {"tool": "search_products", "args": {"query": query}}
    return None


# --------------------------------------------------------------------------- #
# Filling in a product draft from free text ("price 450, GST 18%, stock 100")
# --------------------------------------------------------------------------- #
_NUM = r"([0-9][0-9,]*(?:\.[0-9]+)?)"


def parse_product_fields(text: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    t = text.strip()
    low = t.lower()

    m = re.search(r"(?:selling\s+price|sale\s+price|mrp|price|rate|sells?\s+for|cost)\s*(?:is|=|:|of|at)?\s*(?:rs\.?|inr|₹)?\s*" + _NUM, low) or re.search(r"(?:rs\.?|inr|₹)\s*" + _NUM, low)
    if m:
        out["selling_price"] = m.group(1).replace(",", "")
    m = re.search(r"(?:gst|tax|vat)\s*(?:rate)?\s*(?:is|=|:|of|at)?\s*" + _NUM + r"\s*%?", low) or re.search(_NUM + r"\s*%\s*(?:gst|tax)?", low)
    if m:
        out["tax_rate"] = m.group(1).replace(",", "")
    m = re.search(r"(?:opening\s+stock|stock|quantity|qty|units?|pieces?|pcs)\s*(?:is|=|:|of|-)?\s*" + _NUM, low) or re.search(_NUM + r"\s*(?:units?|pieces?|pcs|nos)\b", low)
    if m:
        out["opening_stock"] = m.group(1).replace(",", "")
    m = re.search(r"\bsku\s*(?:is|=|:)?\s*([A-Za-z0-9][A-Za-z0-9\-_/.]{1,48})", t, re.I)
    if m:
        out["sku"] = m.group(1).upper()
    m = re.search(r"\bbarcode\s*(?:is|=|:)?\s*([0-9]{6,20})", low)
    if m:
        out["barcode"] = m.group(1)
    m = re.search(r"\bcategory\s*(?:is|=|:)?\s*([A-Za-z][A-Za-z &/\-]{1,60}?)(?:[,.;]|\s+(?:and|with|price|gst|tax|stock|sku|brand|name)\b|$)", t, re.I)
    if m:
        out["category"] = m.group(1).strip()
    m = re.search(r"\bbrand\s*(?:is|=|:)?\s*([A-Za-z0-9][A-Za-z0-9 &'\-]{1,60}?)(?:[,.;]|\s+(?:and|with|price|gst|tax|stock|sku|category|name)\b|$)", t, re.I)
    if m:
        out["brand"] = m.group(1).strip()
    m = re.search(r"\b(?:name|called|named)\s*(?:is|=|:)?\s*([A-Za-z0-9][A-Za-z0-9 &'\-./]{1,100}?)(?:[,;]|\s+(?:and|with|price|gst|tax|stock|sku|category|brand)\b|$)", t, re.I)
    if m:
        out["name"] = m.group(1).strip()
    m = re.search(r"\bhsn\s*(?:code)?\s*(?:is|=|:)?\s*([0-9]{4,8})", low)
    if m:
        out["hsn_sac"] = m.group(1)
    if re.search(r"\b(add anyway|create anyway|it is different|it's different|new product anyway)\b", low):
        out["allow_duplicate"] = True
    return out


def quick_numbers(text: str) -> Optional[Dict[str, str]]:
    """A bare reply like "450, 18, 100" answering price, tax, stock in that order."""
    parts = [p for p in re.split(r"[,\s/]+", text.strip().replace("%", "")) if p]
    if 1 <= len(parts) <= 3 and all(re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", p) for p in parts):
        keys = ("selling_price", "tax_rate", "opening_stock")
        return dict(zip(keys, parts))
    return None
