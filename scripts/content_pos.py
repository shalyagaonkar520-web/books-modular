"""Add the Point of Sale texts to both copies of the default app content.
Run from the repo root: python scripts/content_pos.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "pos.item.barcode": "Barcode",
    "pos.item.barcodeHint": "The number under the product's barcode, scanned at the Point of Sale. Unique for each item.",
}

if __name__ == "__main__":
    main(TEXTS)
