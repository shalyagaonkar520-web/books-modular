"""Add the Export all books texts to both copies of the default app content.
Run from the repo root: python scripts/content_export_all.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "settings.export.title": "Export all books",
    "settings.export.subtitle": "Every record of your organization in one Excel file: customers, vendors, items, sales, purchases, payments, banking, the ledger, payroll and stock.",
    "settings.export.button": "Export to Excel",
    "settings.export.note": "Includes a trial balance and customer and vendor balances. One sheet per kind of record; passwords and keys are never included. Large organizations may take a minute.",
    "settings.export.done": "Your books are downloading.",
}

if __name__ == "__main__":
    main(TEXTS)
