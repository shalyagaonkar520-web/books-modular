"""UUID helpers. Books stores UUIDs as 32 hex characters; events and Core use the canonical form."""

from __future__ import annotations

import uuid


def canonical_uuid(value: str | uuid.UUID) -> str:
    """Return the canonical 36-character form; accepts 32-hex or dashed input. Raises ValueError otherwise."""
    if isinstance(value, uuid.UUID):
        return str(value)
    return str(uuid.UUID(str(value).strip()))


def hex_uuid(value: str | uuid.UUID) -> str:
    """Return the 32-character hex form used by Books' String(32) ids."""
    return uuid.UUID(canonical_uuid(value)).hex
