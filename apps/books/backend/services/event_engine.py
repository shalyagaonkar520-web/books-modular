"""
Universal Event Engine
Handles:
- Natural Language Business Activity Parsing
- Entity & Intent Extraction (Amounts, Quantities, Parties, Payment Modes)
- AI Categorization & Historical Learning Memory
- Deterministic Rule Evaluation (IF-THEN)
- Duplicate Detection & Anomaly Screening
- Confidence Engine (Auto-process vs. Needs Review)
"""
import re
import uuid
from typing import Dict, Any, Tuple, Optional, List
from datetime import datetime
from backend.database import (
    record_business_event,
    record_audit_log,
    get_automation_rules,
    get_ai_learnings,
    get_business_events,
    get_all_invoices,
    update_invoice_status,
)
from backend.services.accounting_engine import AccountingEngine


class EventEngine:
    KNOWN_ENTITIES = {
        "ikea": {"type": "vendor", "category": "Office Furniture", "account": "Furniture & Fixtures"},
        "dell": {"type": "vendor", "category": "Computer Equipment", "account": "Computer Hardware"},
        "staples": {"type": "vendor", "category": "Office Supplies", "account": "Office Supplies Expense"},
        "amazon": {"type": "vendor", "category": "Cloud Infrastructure", "account": "Technology & Hosting"},
        "swiggy": {"type": "vendor", "category": "Business Meals", "account": "Meals & Hospitality Expense"},
        "wipro": {"type": "customer", "category": "Consulting Services", "account": "Accounts Receivable"},
        "infosys": {"type": "customer", "category": "Enterprise Services", "account": "Accounts Receivable"},
        "tata": {"type": "customer", "category": "ERP Architecture", "account": "Accounts Receivable"},
        "abc": {"type": "customer", "category": "Trade Customer", "account": "Accounts Receivable"},
        "rahul": {"type": "customer", "category": "Direct Client", "account": "Accounts Receivable"},
    }

    @classmethod
    def parse_natural_language(cls, text: str) -> Dict[str, Any]:
        """Extracts intent, amount, quantity, party, item, and payment mode from natural text."""
        clean = text.strip()
        lower = clean.lower()

        # 1. Detect Intent
        intent = "expense"
        if any(w in lower for w in ["bought", "purchased", "procured", "buy", "purchase"]):
            intent = "purchase"
        elif any(w in lower for w in ["sold", "sale", "invoice for", "bill for", "client order"]):
            intent = "sale"
        elif any(w in lower for w in ["paid", "received", "settled", "cleared", "remitted"]):
            # Check if received from customer or paid to vendor
            if any(w in lower for w in ["from", "paid me", "received", "by customer"]):
                intent = "customer_payment"
            elif any(w in lower for w in ["to", "vendor", "supplier"]):
                intent = "vendor_payment"
            else:
                intent = "customer_payment"

        # 2. Extract Amount
        # Look for ₹, Rs, INR, or number
        amount = 0.0
        amt_match = re.search(r'(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:k|thousand|lakh|crore)?', clean, re.IGNORECASE)
        if amt_match:
            raw_amt_str = amt_match.group(1).replace(",", "")
            try:
                val = float(raw_amt_str)
                # Check multiplier
                if "lakh" in lower:
                    val *= 100000
                elif "k" in lower:
                    val *= 1000
                amount = val
            except ValueError:
                amount = 0.0

        # Refined regex for standalone amounts like "₹30,000" or "50000"
        standalone = re.search(r'₹\s*([0-9,]+(?:\.[0-9]{1,2})?)', clean)
        if standalone:
            amount = float(standalone.group(1).replace(",", ""))

        # 3. Extract Quantity
        quantity = 1.0
        qty_match = re.search(r'\b([0-9]+)\s*(?:pcs|units|items|chairs|monitors|laptops|boxes|desks)\b', lower)
        if qty_match:
            quantity = float(qty_match.group(1))

        # 4. Extract Party (Vendor or Customer)
        party = "Unknown Entity"
        party_category = "General Business Operations"
        for k, v in cls.KNOWN_ENTITIES.items():
            if k in lower:
                party = k.title()
                party_category = v["category"]
                break

        # Check AI Learnings from DB for learned entities
        try:
            learnings = get_ai_learnings()
            for l in learnings:
                if l["patternKey"].lower() in lower:
                    party = l["patternKey"]
                    party_category = l["category"]
                    break
        except Exception:
            pass

        # If party still unknown, extract capitalized names or words following "from" or "to"
        if party == "Unknown Entity":
            target_match = re.search(r'(?:from|to|for|with)\s+([A-Z][a-zA-Z0-9\s]{2,20})', clean)
            if target_match:
                party = target_match.group(1).strip()

        # 5. Extract Item or Description
        item = "General Goods"
        if "chair" in lower:
            item = "Ergonomic Office Chair"
        elif "monitor" in lower:
            item = "Dell UltraSharp 27 Monitor"
        elif "laptop" in lower or "macbook" in lower:
            item = "Workstation Laptop"
        elif "stationery" in lower or "paper" in lower:
            item = "Office Consumables"
        elif "cloud" in lower or "aws" in lower or "hosting" in lower:
            item = "Cloud Server Infrastructure"
        elif "electricity" in lower or "utility" in lower:
            item = "Facility Electricity"

        # 6. Extract Payment Mode
        payment_mode = "credit"
        if any(w in lower for w in ["hdfc", "bank", "neft", "rtgs", "imps"]):
            payment_mode = "bank"
        elif any(w in lower for w in ["upi", "gpay", "phonepe", "paytm"]):
            payment_mode = "upi"
        elif "cash" in lower:
            payment_mode = "cash"

        return {
            "intent": intent,
            "amount": amount,
            "quantity": quantity,
            "party": party,
            "category": party_category,
            "item": item,
            "payment_mode": payment_mode,
        }

    @classmethod
    def check_duplicate(cls, vendor: str, amount: float) -> Tuple[bool, Optional[str]]:
        """Checks recent events to prevent double-billing."""
        recent_events = get_business_events(limit=20)
        for ev in recent_events:
            if ev.get("status") != "rejected":
                extracted = ev.get("extractedData", {})
                if (extracted.get("party", "").lower() == vendor.lower() and
                    abs(float(ev.get("amount", 0.0)) - amount) < 0.01):
                    return True, f"Possible duplicate: A similar transaction of ₹{amount:,.2f} for {vendor} was recorded on {ev.get('createdAt')}."
        return False, None

    @classmethod
    def evaluate_rules(cls, intent: str, party: str, amount: float) -> Dict[str, Any]:
        """Evaluates deterministic IF-THEN rules."""
        rules = get_automation_rules()
        active_rules = [r for r in rules if r.get("isActive")]

        requires_approval = False
        approval_reason = None
        categorize_override = None

        for r in active_rules:
            # Check high-value approval
            if r["actionType"] == "require_approval" and r["conditionField"] == "amount":
                threshold = float(r["conditionValue"])
                if r["operator"] == "greater_than" and amount > threshold:
                    requires_approval = True
                    approval_reason = f"Exceeds rule '{r['name']}' threshold of ₹{threshold:,.2f}"

            # Check categorization rule
            if r["actionType"] == "categorize_as" and r["conditionField"] == "vendor":
                if r["conditionValue"].lower() in party.lower():
                    categorize_override = r["actionValue"]

        return {
            "requires_approval": requires_approval,
            "approval_reason": approval_reason,
            "category_override": categorize_override,
        }

    @classmethod
    def process_event(cls, source: str, raw_text: str, event_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        End-to-End Event Pipeline:
        Input -> Entity Extraction -> Duplicate Check -> Rule Evaluation ->
        Accounting Generation -> Audit Logging -> Status Return
        """
        extracted = cls.parse_natural_language(raw_text)
        if event_data:
            extracted.update(event_data)

        intent = extracted["intent"]
        amount = extracted["amount"]
        party = extracted["party"]
        item = extracted["item"]
        qty = extracted["quantity"]
        payment_mode = extracted["payment_mode"]

        # Duplicate detection
        is_dup, dup_reason = cls.check_duplicate(party, amount)

        # Rule evaluation
        rule_eval = cls.evaluate_rules(intent, party, amount)
        if rule_eval["category_override"]:
            extracted["category"] = rule_eval["category_override"]

        # Confidence assessment
        confidence = 0.96
        if is_dup:
            confidence = 0.65
        elif rule_eval["requires_approval"]:
            confidence = 0.75
        elif amount <= 0.0:
            confidence = 0.50

        # Exception routing
        if confidence >= 0.85 and not rule_eval["requires_approval"] and not is_dup:
            status = "auto_processed"
            review_reason = None
        else:
            status = "needs_review"
            review_reason = dup_reason or rule_eval["approval_reason"] or "Transaction requires manual verification"

        # Record incoming business event
        ev = record_business_event({
            "source": source,
            "rawText": raw_text,
            "eventType": intent,
            "amount": amount,
            "currency": "INR",
            "extractedData": extracted,
            "confidence": confidence,
            "status": status,
            "reviewReason": review_reason,
        })

        accounting_result = None

        # If high confidence, automatically execute accounting postings
        if status == "auto_processed":
            if intent == "purchase":
                accounting_result = AccountingEngine.process_purchase({
                    "event_id": ev["id"],
                    "vendor": party,
                    "amount": amount,
                    "item": item,
                    "quantity": qty,
                    "payment_mode": payment_mode,
                })
            elif intent == "sale":
                accounting_result = AccountingEngine.process_sale({
                    "event_id": ev["id"],
                    "customer": party,
                    "amount": amount,
                    "item": item,
                    "quantity": qty,
                    "payment_mode": payment_mode,
                })
            elif intent == "customer_payment":
                accounting_result = AccountingEngine.process_customer_payment({
                    "event_id": ev["id"],
                    "customer": party,
                    "amount": amount,
                })
                # Check and mark matching invoice as Paid if exists
                cls._match_and_settle_invoice(party, amount)
            else:
                accounting_result = AccountingEngine.process_expense({
                    "event_id": ev["id"],
                    "vendor": party,
                    "amount": amount,
                    "category": extracted.get("category", "General Expense"),
                })
        else:
            # Low confidence or exception: Log review request
            record_audit_log({
                "eventId": ev["id"],
                "action": "Queued to Needs Review Queue",
                "actor": "Confidence & Exception Gate",
                "rationale": f"Event '{raw_text}' yielded {int(confidence * 100)}% confidence: {review_reason}.",
                "confidence": confidence,
                "status": "Needs Review",
            })

        return {
            "event": ev,
            "status": status,
            "confidence": confidence,
            "reviewReason": review_reason,
            "extracted": extracted,
            "accounting": accounting_result,
        }

    @classmethod
    def _match_and_settle_invoice(cls, customer_name: str, amount: float):
        """Finds matching customer invoice and marks it paid."""
        try:
            invoices = get_all_invoices()
            for inv in invoices:
                if (customer_name.lower() in inv.get("client", "").lower() or
                    inv.get("client", "").lower() in customer_name.lower()):
                    if abs(float(inv.get("amount", 0.0)) - amount) < 1.0:
                        update_invoice_status(inv["id"], "Paid")
                        break
        except Exception:
            pass
