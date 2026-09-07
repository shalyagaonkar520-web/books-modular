"""
Default seed data for Business Automation Engine:
- Automation Rules (IF-THEN)
- Bank Reconciliation Transactions with Fuzzy Matches
- Audit Trail with AI/Rule rationale and confidence
- AI Category Memory (Learnings)
- Proactive Business Insights & Anomalies
"""
from datetime import datetime, timedelta
import json

def get_initial_automation_rules():
    now = datetime.utcnow().isoformat() + "Z"
    return [
        {
            "id": "rule-101",
            "name": "Auto-Categorize Hardware Purchases (Dell, HP, Apple)",
            "trigger_event": "on_purchase",
            "condition_field": "vendor",
            "operator": "contains",
            "condition_value": "Dell",
            "action_type": "categorize_as",
            "action_value": "Computer Equipment",
            "is_active": 1,
            "execution_count": 28,
            "created_at": now,
        },
        {
            "id": "rule-102",
            "name": "Auto-Reconcile Bank Transfers Matching Invoice #",
            "trigger_event": "on_bank_feed",
            "condition_field": "description",
            "operator": "contains",
            "condition_value": "INV-",
            "action_type": "auto_reconcile",
            "action_value": "settle_matching_invoice",
            "is_active": 1,
            "execution_count": 45,
            "created_at": now,
        },
        {
            "id": "rule-103",
            "name": "High-Value Procurement Approval Gate (> ₹1,00,000)",
            "trigger_event": "on_purchase",
            "condition_field": "amount",
            "operator": "greater_than",
            "condition_value": "100000",
            "action_type": "require_approval",
            "action_value": "finance_head_approval",
            "is_active": 1,
            "execution_count": 12,
            "created_at": now,
        },
        {
            "id": "rule-104",
            "name": "Overdue Invoices (> 7 Days) Auto-Remind Client",
            "trigger_event": "on_invoice_overdue",
            "condition_field": "due_days",
            "operator": "greater_than",
            "condition_value": "7",
            "action_type": "send_payment_reminder",
            "action_value": "polite_whatsapp_email",
            "is_active": 1,
            "execution_count": 19,
            "created_at": now,
        },
        {
            "id": "rule-105",
            "name": "Low Stock Reorder Trigger (< Safety Stock)",
            "trigger_event": "on_inventory_low",
            "condition_field": "stock_level",
            "operator": "less_than",
            "condition_value": "reorder_level",
            "action_type": "create_reorder_po",
            "action_value": "suggest_purchase_order",
            "is_active": 1,
            "execution_count": 8,
            "created_at": now,
        },
    ]


def get_initial_bank_reconciliations():
    now = datetime.utcnow()
    d1 = (now - timedelta(days=1)).strftime("%d %b %Y")
    d2 = (now - timedelta(days=3)).strftime("%d %b %Y")
    d3 = (now - timedelta(days=4)).strftime("%d %b %Y")
    d4 = (now - timedelta(days=5)).strftime("%d %b %Y")
    d5 = (now - timedelta(days=7)).strftime("%d %b %Y")

    return [
        {
            "id": "recon-101",
            "bank_trans_date": d1,
            "bank_description": "UPI/INFOSYS BPM/INV-00104/HDFC0000053",
            "bank_amount": 185000.0,
            "trans_type": "credit",
            "matched_entity_type": "invoice",
            "matched_entity_id": "INV-00104",
            "matched_entity_name": "Infosys BPM Limited",
            "confidence": 0.98,
            "status": "suggested",
            "reconciled_at": None,
        },
        {
            "id": "recon-102",
            "bank_trans_date": d2,
            "bank_description": "IMPS/TATA CONSULT/ERP-SECURITY/INV-00103",
            "bank_amount": 342000.0,
            "trans_type": "credit",
            "matched_entity_type": "invoice",
            "matched_entity_id": "INV-00103",
            "matched_entity_name": "Tata Consultancy Services",
            "confidence": 0.99,
            "status": "auto_reconciled",
            "reconciled_at": d2,
        },
        {
            "id": "recon-103",
            "bank_trans_date": d3,
            "bank_description": "UPI/RAHUL KUMAR/PAYMENT-FOR-EQUIPMENT",
            "bank_amount": 12500.0,
            "trans_type": "credit",
            "matched_entity_type": "customer",
            "matched_entity_id": "cust-rahul",
            "matched_entity_name": "Rahul Kumar",
            "confidence": 0.91,
            "status": "suggested",
            "reconciled_at": None,
        },
        {
            "id": "recon-104",
            "bank_trans_date": d4,
            "bank_description": "CMS/AMAZON WEB SERVICES/INVOICE-82914",
            "bank_amount": 48500.0,
            "trans_type": "debit",
            "matched_entity_type": "expense",
            "matched_entity_id": None,
            "matched_entity_name": "AWS Cloud Infrastructure",
            "confidence": 0.62,
            "status": "unmatched",
            "reconciled_at": None,
        },
        {
            "id": "recon-105",
            "bank_trans_date": d5,
            "bank_description": "IMPS/WIPRO DIG/SETTLEMENT-PARTIAL",
            "bank_amount": 98500.0,
            "trans_type": "credit",
            "matched_entity_type": "invoice",
            "matched_entity_id": "INV-00102",
            "matched_entity_name": "Wipro Digital Labs",
            "confidence": 0.94,
            "status": "suggested",
            "reconciled_at": None,
        },
    ]


def get_initial_audit_logs():
    now = datetime.utcnow()
    return [
        {
            "id": "audit-101",
            "event_id": "evt-001",
            "action": "Automatic Categorization & Ledger Posting",
            "actor": "Automation Engine (Rule #101)",
            "rationale": "Vendor 'Dell' was categorized as 'Computer Equipment' based on 28 prior purchases and rule #101.",
            "confidence": 0.97,
            "status": "Success",
            "timestamp": (now - timedelta(hours=2)).strftime("%d %b %Y, %H:%M"),
        },
        {
            "id": "audit-102",
            "event_id": "evt-002",
            "action": "Bank Feed Auto-Reconciliation",
            "actor": "Smart Reconciliation Engine",
            "rationale": "Bank credit of ₹3,42,000 matched invoice INV-00103 reference and customer amount with 99% confidence.",
            "confidence": 0.99,
            "status": "Success",
            "timestamp": (now - timedelta(hours=6)).strftime("%d %b %Y, %H:%M"),
        },
        {
            "id": "audit-103",
            "event_id": "evt-003",
            "action": "Input Tax Credit (ITC) CGST/SGST Calculation",
            "actor": "GST Compliance Engine",
            "rationale": "Calculated 9% CGST (₹4,500) and 9% SGST (₹4,500) for intra-state Karnataka procurement (HSN 8471).",
            "confidence": 1.0,
            "status": "Success",
            "timestamp": (now - timedelta(hours=14)).strftime("%d %b %Y, %H:%M"),
        },
        {
            "id": "audit-104",
            "event_id": "evt-004",
            "action": "Low-Stock Reorder Suggestion Generated",
            "actor": "Inventory Watchdog",
            "rationale": "Stock level for 'Dell UltraSharp 27 Monitor' reached 4 units (below safety reorder threshold of 5 units).",
            "confidence": 1.0,
            "status": "Alert",
            "timestamp": (now - timedelta(days=1)).strftime("%d %b %Y, %H:%M"),
        },
        {
            "id": "audit-105",
            "event_id": "evt-005",
            "action": "Duplicate Invoice Detection Prevented Double Entry",
            "actor": "Fraud & Anomaly Guard",
            "rationale": "Vendor bill upload with checksum matching INV-8271 was flagged and blocked from duplicate posting.",
            "confidence": 0.98,
            "status": "Flagged",
            "timestamp": (now - timedelta(days=2)).strftime("%d %b %Y, %H:%M"),
        },
    ]


def get_initial_ai_learnings():
    now = datetime.utcnow().isoformat() + "Z"
    return [
        {
            "id": "learn-101",
            "organization": "Rooman Technologies Pvt Ltd",
            "pattern_key": "Dell",
            "category": "Computer Equipment",
            "account": "Office Assets",
            "confidence_score": 0.97,
            "occurrence_count": 28,
            "last_used": now,
        },
        {
            "id": "learn-102",
            "organization": "Rooman Technologies Pvt Ltd",
            "pattern_key": "IKEA",
            "category": "Office Furniture",
            "account": "Furniture & Fixtures",
            "confidence_score": 0.94,
            "occurrence_count": 14,
            "last_used": now,
        },
        {
            "id": "learn-103",
            "organization": "Rooman Technologies Pvt Ltd",
            "pattern_key": "Amazon Web Services",
            "category": "Cloud Infrastructure",
            "account": "Technology & Hosting",
            "confidence_score": 0.98,
            "occurrence_count": 36,
            "last_used": now,
        },
        {
            "id": "learn-104",
            "organization": "Rooman Technologies Pvt Ltd",
            "pattern_key": "Staples",
            "category": "Stationery & Consumables",
            "account": "Office Expense",
            "confidence_score": 0.92,
            "occurrence_count": 11,
            "last_used": now,
        },
        {
            "id": "learn-105",
            "organization": "Rooman Technologies Pvt Ltd",
            "pattern_key": "Swiggy",
            "category": "Client Hospitality & Meals",
            "account": "Business Meals Expense",
            "confidence_score": 0.89,
            "occurrence_count": 9,
            "last_used": now,
        },
    ]


def get_initial_ai_insights():
    now = datetime.utcnow().isoformat() + "Z"
    return [
        {
            "id": "ins-101",
            "category": "expense_spike",
            "severity": "attention",
            "title": "Cloud Infrastructure Spend Spiked +38%",
            "description": "AWS Hosting charges reached ₹48,500 this month, +38% higher than 3-month trailing average of ₹35,100.",
            "metric_detail": "₹48,500 vs ₹35,100 (+38.2%)",
            "action_label": "Review Breakdown",
            "action_module": "purchases",
            "created_at": now,
        },
        {
            "id": "ins-102",
            "category": "receivable",
            "severity": "critical",
            "title": "Wipro Digital Labs Invoice Overdue (₹98,500)",
            "description": "Invoice INV-00102 is 4 days past its Net 15 terms. Client typically settles within 10 days.",
            "metric_detail": "4 days overdue",
            "action_label": "Dispatch Reminder",
            "action_module": "sales",
            "created_at": now,
        },
        {
            "id": "ins-103",
            "category": "inventory",
            "severity": "recommendation",
            "title": "Ergonomic Chairs Near Stockout (6 Days Runway)",
            "description": "Current stock is 12 units. Given average consumption of 2 units/day and vendor lead time of 5 days, stockout anticipated in 6 days.",
            "metric_detail": "12 units on hand (reorder point: 3)",
            "action_label": "Auto-Create PO",
            "action_module": "purchases",
            "created_at": now,
        },
        {
            "id": "ins-104",
            "category": "tax_compliance",
            "severity": "info",
            "title": "ITC Auto-Reconciled against GSTR-2B",
            "description": "Input Tax Credit of ₹1,28,450 successfully matched against GSTN supplier filings for August 2026.",
            "metric_detail": "₹1,28,450 ITC matched (100%)",
            "action_label": "View Tax Summary",
            "action_module": "reports",
            "created_at": now,
        },
    ]


def get_initial_journal_entries():
    now = datetime.utcnow()
    d1 = (now - timedelta(days=2)).strftime("%d %b %Y")
    d2 = (now - timedelta(days=5)).strftime("%d %b %Y")
    d3 = (now - timedelta(days=8)).strftime("%d %b %Y")

    return [
        {
            "id": "JE-2026-001",
            "event_id": "evt-init-01",
            "reference_no": "INV-00103",
            "date": d1,
            "description": "Customer Payment Settlement for Enterprise ERP Architecture",
            "source": "auto_reconciliation",
            "total_debit": 342000.0,
            "total_credit": 342000.0,
            "balanced": 1,
            "created_at": d1,
            "lines": [
                {
                    "account": "HDFC Bank Operating Account",
                    "debit": 342000.0,
                    "credit": 0.0,
                    "notes": "Direct IMPS credit received",
                },
                {
                    "account": "Accounts Receivable (Tata Consultancy Services)",
                    "debit": 0.0,
                    "credit": 342000.0,
                    "notes": "Invoice INV-00103 settled in full",
                },
            ],
        },
        {
            "id": "JE-2026-002",
            "event_id": "evt-init-02",
            "reference_no": "BILL-DELL-8910",
            "date": d2,
            "description": "Procurement of Dell 4K Displays & IT Hardware",
            "source": "auto_purchase_engine",
            "total_debit": 171100.0,
            "total_credit": 171100.0,
            "balanced": 1,
            "created_at": d2,
            "lines": [
                {
                    "account": "Inventory Asset (Computer Displays)",
                    "debit": 145000.0,
                    "credit": 0.0,
                    "notes": "5x Dell UltraSharp 27 4K Monitors",
                },
                {
                    "account": "Input CGST 9%",
                    "debit": 13050.0,
                    "credit": 0.0,
                    "notes": "Intra-state GST Input Tax Credit",
                },
                {
                    "account": "Input SGST 9%",
                    "debit": 13050.0,
                    "credit": 0.0,
                    "notes": "Intra-state GST Input Tax Credit",
                },
                {
                    "account": "Accounts Payable (TechDistro India Pvt Ltd)",
                    "debit": 0.0,
                    "credit": 171100.0,
                    "notes": "Payment terms Net 30 days",
                },
            ],
        },
        {
            "id": "JE-2026-003",
            "event_id": "evt-init-03",
            "reference_no": "PAY-SAL-AUG26",
            "date": d3,
            "description": "August 2026 Corporate Payroll Disbursement",
            "source": "payroll_automation",
            "total_debit": 850000.0,
            "total_credit": 850000.0,
            "balanced": 1,
            "created_at": d3,
            "lines": [
                {
                    "account": "Salaries & Wages Expense",
                    "debit": 850000.0,
                    "credit": 0.0,
                    "notes": "Gross monthly compensation",
                },
                {
                    "account": "Provident Fund Payable",
                    "debit": 0.0,
                    "credit": 51000.0,
                    "notes": "Employee PF deduction",
                },
                {
                    "account": "TDS Payable on Salaries",
                    "debit": 0.0,
                    "credit": 42500.0,
                    "notes": "Income tax withheld at source",
                },
                {
                    "account": "HDFC Bank Operating Account",
                    "debit": 0.0,
                    "credit": 756500.0,
                    "notes": "Direct bank salary credit",
                },
            ],
        },
    ]
