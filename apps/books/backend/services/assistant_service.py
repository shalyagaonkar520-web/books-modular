"""
Natural Language Business Assistant Service
Answers business owner queries directly using real ledger, invoice, inventory, and tax data.
"""
from typing import Dict, Any, List
from datetime import datetime
from backend.database import (
    get_all_invoices,
    get_all_items,
    get_trial_balance,
    get_general_ledger,
    update_invoice_status,
)
from backend.services.event_engine import EventEngine


class AssistantService:
    @classmethod
    def answer_query(cls, query: str) -> Dict[str, Any]:
        q = query.strip()
        lower = q.lower()

        # 1. Unpaid / Overdue Invoices
        if any(w in lower for w in ["unpaid", "haven't paid", "overdue", "who owes", "owe me"]):
            invoices = get_all_invoices()
            unpaid = [i for i in invoices if i.get("status") in ("Sent", "Overdue", "Draft")]
            total_unpaid = sum(i.get("amount", 0.0) for i in unpaid)

            items_summary = [
                f"• {i['client']}: ₹{i['amount']:,.2f} ({i['status']}, due {i['due']})"
                for i in unpaid[:5]
            ]
            reply = f"You currently have {len(unpaid)} unpaid invoices totaling ₹{total_unpaid:,.2f}:\n" + "\n".join(items_summary)

            return {
                "intent": "unpaid_invoices",
                "reply": reply,
                "data": unpaid,
                "actionType": "navigate",
                "actionLabel": "Open Billing & Receivables",
                "actionPayload": {"module": "sales", "subItem": "invoices"},
            }

        # 2. GST Calculation Query ("How much GST do I owe?")
        if any(w in lower for w in ["gst", "tax", "itc", "gstr"]):
            tb = get_trial_balance()
            accounts = tb.get("accounts", [])

            output_gst = sum(a["credit"] for a in accounts if "Output" in a["account"])
            input_gst = sum(a["debit"] for a in accounts if "Input" in a["account"])
            net_gst = max(0.0, output_gst - input_gst)

            reply = (
                f"Based on your current ledger activity:\n"
                f"• Total Output GST Liability: ₹{output_gst:,.2f}\n"
                f"• Input Tax Credit (ITC) Available: ₹{input_gst:,.2f}\n"
                f"• Estimated Net GST Payable to Govt: ₹{net_gst:,.2f}\n"
                f"All transactions are auto-split across CGST & SGST."
            )

            return {
                "intent": "gst_liability",
                "reply": reply,
                "data": {
                    "outputGst": output_gst,
                    "inputGst": input_gst,
                    "netPayable": net_gst,
                },
                "actionType": "navigate",
                "actionLabel": "View GST Compliance Reports",
                "actionPayload": {"module": "reports", "tab": "tax"},
            }

        # 3. Inventory Stockout / Reorder Query
        if any(w in lower for w in ["inventory", "run out", "low stock", "stockout", "reorder"]):
            items = get_all_items()
            low_stock = []
            for item in items:
                if item.get("type") == "goods":
                    inv = item.get("inventoryInfo") or {}
                    stock = inv.get("openingStock", 0.0)
                    reorder = inv.get("reorderLevel", 5.0)
                    if stock <= reorder:
                        low_stock.append({
                            "id": item["id"],
                            "name": item["name"],
                            "stock": stock,
                            "reorder": reorder,
                        })

            if low_stock:
                summary = [f"• {i['name']}: {int(i['stock'])} units remaining (reorder point: {int(i['reorder'])})" for i in low_stock]
                reply = f"You have {len(low_stock)} SKUs at or below safety stock:\n" + "\n".join(summary)
            else:
                reply = "All tracked goods currently have healthy inventory levels above their reorder thresholds."

            return {
                "intent": "inventory_risk",
                "reply": reply,
                "data": low_stock,
                "actionType": "navigate",
                "actionLabel": "Create Reorder Purchase Order",
                "actionPayload": {"module": "purchases", "subItem": "purchase_orders"},
            }

        # 4. Expenses Query ("What were my expenses?")
        if any(w in lower for w in ["expenses", "spent", "spending", "overhead"]):
            tb = get_trial_balance()
            accounts = tb.get("accounts", [])
            expense_accounts = [a for a in accounts if any(w in a["account"].lower() for w in ["expense", "salaries", "hosting", "hardware", "meals"])]
            total_exp = sum(a["debit"] for a in expense_accounts)

            summary = [f"• {a['account']}: ₹{a['debit']:,.2f}" for a in expense_accounts[:5]]
            reply = f"Total categorized business expenses currently stand at ₹{total_exp:,.2f}:\n" + "\n".join(summary)

            return {
                "intent": "expenses_summary",
                "reply": reply,
                "data": expense_accounts,
                "actionType": "navigate",
                "actionLabel": "View Expense Analysis",
                "actionPayload": {"module": "reports", "tab": "expenses"},
            }

        # 5. Mark invoice as paid ("Mark invoice INV-00102 as paid")
        if "mark" in lower and "paid" in lower:
            import re
            inv_match = re.search(r'INV-[0-9]+', q, re.IGNORECASE)
            if inv_match:
                inv_id = inv_match.group(0).upper()
                update_invoice_status(inv_id, "Paid")
                return {
                    "intent": "mark_invoice_paid",
                    "reply": f"Invoice {inv_id} has been marked as Paid. Accounts Receivable and cash flow metrics have been updated automatically.",
                    "data": {"invoiceId": inv_id, "status": "Paid"},
                    "actionType": "toast",
                    "actionLabel": "View Invoice",
                    "actionPayload": {"invoiceId": inv_id},
                }

        # 6. Action Intent: "Bought ...", "Sold ...", "Paid ..."
        if any(w in lower for w in ["bought", "purchased", "sold", "paid"]):
            result = EventEngine.process_event("natural_language_assistant", q)
            intent = result["extracted"]["intent"]
            amt = result["extracted"]["amount"]
            party = result["extracted"]["party"]

            if result["status"] == "auto_processed":
                reply = (
                    f"Successfully processed {intent.replace('_', ' ')} of ₹{amt:,.2f} with {party}. "
                    f"Double-entry journal entries and tax breakdown have been posted to your ledger."
                )
            else:
                reply = (
                    f"I detected {intent} of ₹{amt:,.2f} with {party}, but sent it to 'Needs Your Attention' "
                    f"due to: {result['reviewReason']}."
                )

            return {
                "intent": f"execute_{intent}",
                "reply": reply,
                "data": result,
                "actionType": "navigate",
                "actionLabel": "View in General Ledger",
                "actionPayload": {"module": "accountant"},
            }

        # Default Fallback: Overview
        return {
            "intent": "general_help",
            "reply": (
                "I am your Natural Language Business Assistant. You can ask me questions or instruct me in plain English:\n"
                "• 'Show unpaid invoices'\n"
                "• 'How much GST do I owe this month?'\n"
                "• 'Which inventory will run out soon?'\n"
                "• 'Bought 5 chairs from IKEA for ₹30,000 via HDFC'\n"
                "• 'Mark invoice INV-00102 as paid'"
            ),
            "data": None,
            "actionType": None,
            "actionLabel": None,
            "actionPayload": None,
        }
