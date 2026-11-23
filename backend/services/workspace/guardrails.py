"""Strict guardrails around the assistant. All of it is plain code, so it costs nothing and cannot be talked out of.

Input   what an employee types is checked BEFORE it is stored or sent anywhere: secrets (API keys, passwords,
        card numbers) are refused and never saved; jailbreak phrases, harmful requests and off-topic jobs
        (writing code, essays) get a short local refusal and no model call.
Output  what the model writes is cleaned before it is shown: links, HTML, key-like strings and prompt-leak
        phrases are removed and the length is capped.
Action  limits on what can be changed through the assistant: changes per hour, emails per day, document
        value, stock-change size, and an invoice can only be emailed to an address the user typed or the
        customer's own saved address. Higher limits need the Approve permission (or Manual mode).
Every block is written to the audit log (never the blocked text itself).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import AuditLog, Contact, Invoice

MAX_CHANGES_PER_HOUR = 60
MAX_EMAILS_PER_DAY = 20
MAX_DOCUMENT_VALUE = 500_000  # rupees, before it needs the Approve permission
MAX_STOCK_CHANGE = 10_000
MAX_OPENING_STOCK = 100_000
MAX_REPLY_CHARS = 700

_KEY = re.compile(r"\b(sk-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9\-]{10,}|rzp_(live|test)_[A-Za-z0-9]{8,})\b")
_PRIVATE_KEY = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
_PASSWORD = re.compile(r"\b(my |the |our )?(password|passwd|pwd|passcode|pin|otp|cvv|secret key|api key)\b\s*(is|=|:)\s*\S+", re.I)
_CARD = re.compile(r"\b(?:\d[ -]?){13,19}\b")

_JAILBREAK = re.compile(
    r"(ignore|forget|disregard|override|bypass|disable|turn off).{0,40}(instruction|rule|permission|restriction|guardrail|safety|previous|above|system|polic)|"
    r"(system prompt|developer message|you are now|act as (an? )?(admin|owner|root|dan)|pretend (you are|to be)|jailbreak|sudo|developer mode|reveal your (prompt|instructions|rules))|"
    r"(show|print|repeat|tell me).{0,25}(your|the) (system |hidden |initial )?(prompt|instructions)",
    re.I,
)
_HARMFUL = re.compile(
    r"\b(bomb|explosive|malware|ransomware|keylogger|phishing|hack into|hack (a|the|someone)|steal (money|data|passwords)|launder|evade tax|tax evasion|fake (invoice|bill|receipt)|forge|counterfeit|"
    r"false (invoice|bill)|bribe|kill|suicide|self.harm|nude|porn|sex(ual)? )\b",
    re.I,
)
_OFF_TOPIC = re.compile(
    r"\b(write|generate|create|give me|build)\b.{0,25}\b(python|javascript|java|c\+\+|html|css|sql|code|script|program|app|website|poem|song|story|essay|homework|assignment|cover letter|resume)\b|"
    r"\b(who will win|election|prime minister|president of|horoscope|lottery numbers|medical advice|diagnos|prescribe|legal advice|stock tips|crypto|bitcoin)\b",
    re.I,
)

REFUSAL_SECRET = "Please don't type passwords, API keys or card numbers here. I never need them. I did not save that message; remove the secret and try again."
REFUSAL_JAILBREAK = "I work within the permissions your administrator set, and nothing typed here can change them. Tell me what you'd like to do and I'll check what's allowed."
REFUSAL_HARMFUL = "I can't help with that. I'm here for your business work: sales, stock, customers, purchases and records."
REFUSAL_OFF_TOPIC = "That's outside what I'm here for. I can help with your business: sales, invoices, stock, customers, purchases, and general business advice."


def _luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
        alt = not alt
    return total % 10 == 0


def has_secret(text: str) -> bool:
    if _KEY.search(text) or _PRIVATE_KEY.search(text) or _PASSWORD.search(text):
        return True
    mentions_card = bool(re.search(r"\b(card|cvv|expiry|debit|credit)\b", text, re.I))
    for m in _CARD.finditer(text):
        raw = m.group()
        digits = re.sub(r"\D", "", raw)
        grouped = bool(re.search(r"\d{4}[ -]\d{4}[ -]\d{4}", raw))
        # A bare run of digits is a barcode or phone number unless the message talks about a card.
        if 13 <= len(digits) <= 19 and _luhn_ok(digits) and (grouped or mentions_card):
            return True
    return False


def input_problem(text: str) -> Optional[Dict[str, str]]:
    """{"reason": ..., "reply": ...} when the message must not go any further, else None."""
    if has_secret(text):
        return {"reason": "secret", "reply": REFUSAL_SECRET}
    if _JAILBREAK.search(text):
        return {"reason": "jailbreak", "reply": REFUSAL_JAILBREAK}
    if _HARMFUL.search(text):
        return {"reason": "harmful", "reply": REFUSAL_HARMFUL}
    if _OFF_TOPIC.search(text):
        return {"reason": "off_topic", "reply": REFUSAL_OFF_TOPIC}
    return None


_URL = re.compile(r"(https?://\S+|www\.\S+|\b[\w.-]+\.(com|net|org|io|in|co|xyz|ru|top|link)/\S*)", re.I)
_TAG = re.compile(r"<[^>]{1,200}>")
_LEAK = re.compile(r"(cache_control|input_schema|tool_use|system prompt|you are buddy|you are the rooman box assistant|untrusted text)", re.I)


def clean_output(text: str) -> str:
    """What the model wrote, made safe to show: no links, markup, secrets or prompt text; short."""
    out = _TAG.sub("", text or "")
    out = _URL.sub("[link removed]", out)
    out = _KEY.sub("[removed]", out)
    if _LEAK.search(out):
        out = "I can't share how I work inside, but I'm happy to help with your business. What would you like to do?"
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out[:MAX_REPLY_CHARS] + ("…" if len(out) > MAX_REPLY_CHARS else "")


def record_block(db: Session, user: Any, reason: str) -> None:
    from backend.services import audit

    audit.record(db, user, "denied", "ai_guardrail", None, f"AI guardrail blocked a request ({reason})")


# ---------------------------------------------------------------- actions
def _since(db: Session, user_id: str, org_id: str, delta: timedelta, like: str) -> int:
    return db.execute(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.organization_id == org_id, AuditLog.user_id == user_id, AuditLog.created_at >= datetime.now(UTC) - delta, AuditLog.summary.like(like)
        )
    ).scalar_one()


def write_limit_problem(db: Session, user_id: str, org_id: str, tool_name: str) -> Optional[str]:
    if _since(db, user_id, org_id, timedelta(hours=1), "AI workspace%") >= MAX_CHANGES_PER_HOUR:
        return f"That's a lot of changes in an hour (limit {MAX_CHANGES_PER_HOUR}). Take a short break, or continue in Manual mode."
    if tool_name == "send_invoice_email" and _since(db, user_id, org_id, timedelta(days=1), "AI workspace%Emailed invoice%") >= MAX_EMAILS_PER_DAY:
        return f"You've reached today's limit of {MAX_EMAILS_PER_DAY} emails sent through the assistant. Use Manual mode for more."
    return None


def value_problem(total: Any, can_approve: bool, what: str) -> Optional[str]:
    if float(total) > MAX_DOCUMENT_VALUE and not can_approve:
        return f"A {what} above ₹{MAX_DOCUMENT_VALUE:,.0f} needs someone with approval rights. Create it in Manual mode so it can be reviewed."
    return None


def email_problem(text: str, steps: List[Dict[str, Any]]) -> Optional[str]:
    """An invoice may only be emailed to an address the user typed in this message (or the customer's saved one)."""
    low = (text or "").lower()
    for st in steps:
        if st.get("tool") != "send_invoice_email":
            continue
        to = str((st.get("args") or {}).get("to_email") or "").strip().lower()
        if to and to not in low:
            return "I'll only email an invoice to the customer's saved address or an address you type yourself. Please give me the email address."
    return None


def customer_email_matches(db: Session, org_id: str, invoice: Invoice, to: str) -> bool:
    c = db.get(Contact, invoice.customer_id)
    return bool(c and c.email and c.email.strip().lower() == to.strip().lower())
