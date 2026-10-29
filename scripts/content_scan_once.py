"""Add the scan-once texts (each item goes on a bill / into stock once per scan
session; more only with +) to both copies of the default app content.
Run from the repo root: python scripts/content_scan_once.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "pos.alreadyOnBill": "{name} is already on the bill. Use + to add more.",
    "pos.scan.alreadySent": "{name} is already on the bill. Use + on the counter to add more.",
    "pos.scan.alreadyAdded": "{name} was already added in this session. Change its stock in Items to add more.",
}

if __name__ == "__main__":
    main(TEXTS)
