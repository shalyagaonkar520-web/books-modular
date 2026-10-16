"""Records another Rooman app sent (e.g. Billing) are read-only in Books."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

APP_NAMES = {"billing": "Rooman Billing"}


def ensure_editable(record: Any) -> None:
    """409 when ``record`` came from another app: it is changed there, and the change flows into Books."""
    source = getattr(record, "source_app", None)
    if source:
        app = APP_NAMES.get(source, source.title())
        raise HTTPException(status.HTTP_409_CONFLICT, f"This record comes from {app} and is read-only in Books. Change it in {app}.")
