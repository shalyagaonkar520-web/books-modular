"""Add the texts for the frontend fixes (delete confirmations, "Show on PDF" for
custom fields) to both copies of the default app content. Run from the repo root:
python scripts/content_frontend_fixes.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "automation.entity.invoice": "Invoice",
    "automation.entity.bill": "Bill",
    "automation.entity.estimate": "Quote",
    "automation.entity.payment_received": "Payment received",
    "automation.entity.payment_made": "Payment made",
    "automation.entity.expense": "Expense",
    "automation.entity.contact": "Customer or vendor",
    "automation.trigger.created": "created",
    "automation.trigger.updated": "updated",
    "automation.trigger.deleted": "deleted",
    "automation.trigger.overdue": "overdue",
    "common.readOnly.title": "Read-only access",
    "common.readOnly.body": "Your account can view records but not create or change them. Ask an administrator if you need access.",
    "automation.confirmDelete.body": "Delete “{name}” permanently? This cannot be undone.",
    "automation.fields.showOnPdf": "Show on PDF",
    "inventory.warehouse.confirmDelete": "Delete the warehouse “{name}”? This cannot be undone.",
    "inventory.priceList.confirmDelete": "Delete the price list “{name}”? This cannot be undone.",
}

if __name__ == "__main__":
    main(TEXTS)
