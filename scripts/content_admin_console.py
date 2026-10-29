"""Add the Admin console, Reviewer and Support texts to both copies of the default app content.
Run from the repo root: python scripts/content_admin_console.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import FILES, main  # noqa: E402

TEXTS = {
    "settings.invite.role.reviewer": "Reviewer — reviews the work of the roles or people you pick",
    "settings.users.role.reviewer": "Reviewer",
    "settings.users.reviewScope": "Reviews {count} · change",
    "header.profile.adminConsole": "Admin console",
    "header.profile.reviews": "Reviews",
    "header.profile.support": "Support",
}

# Existing texts that now say more.
CHANGED = {
    "settings.users.subtitle": "Administrators manage everything, staff record transactions, viewers are read-only, reviewers check other people's changes",
}

if __name__ == "__main__":
    main(TEXTS)
    for path in FILES:
        raw = path.read_bytes().decode("utf-8")
        for key, value in CHANGED.items():
            doc = json.loads(raw)
            old = f"{json.dumps(key)}: {json.dumps(doc['texts'][key], ensure_ascii=False)}"
            assert raw.count(old) == 1, (path, key)
            raw = raw.replace(old, f"{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}")
        json.loads(raw)
        path.write_bytes(raw.encode("utf-8"))
