"""Add the "Coming soon" texts (features waiting for their service key) to both
copies of the default app content. Run from the repo root:
python scripts/content_coming_soon.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "comingSoon.badge": "Coming soon",
    "comingSoon.note": "This switches on automatically once it is enabled for your account.",
    "comingSoon.ai.ask": "Ask questions about your business in plain words and get answers straight from your books.",
    "comingSoon.ai.scan": "Photograph a bill or receipt and get a ready-to-check draft bill in seconds.",
    "comingSoon.razorpay": "Sync Razorpay payments, match them to invoices and reconcile settlements automatically.",
}

if __name__ == "__main__":
    main(TEXTS)
