"""Check events against the shared contracts (contracts/events/*.v<N>.schema.json).

Incoming events must match their contract before any handler runs. The
schemas are found in EVENT_CONTRACTS_DIR, or by walking up from this file to
the monorepo's contracts/events.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from backend.config import get_settings


class ContractError(ValueError):
    """The event does not match its contract (the 422 detail)."""


def contracts_dir() -> Optional[Path]:
    configured = get_settings().event_contracts_dir.strip()
    if configured:
        path = Path(configured)
        return path if (path / "envelope.schema.json").is_file() else None
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "contracts" / "events"
        if (candidate / "envelope.schema.json").is_file():
            return candidate
    return None


@lru_cache
def _registry_and_dir():
    from referencing import Registry, Resource  # jsonschema's companion; only needed with integration on

    folder = contracts_dir()
    if folder is None:
        raise ContractError("The event contracts (contracts/events) were not found. Set EVENT_CONTRACTS_DIR.")
    envelope = json.loads((folder / "envelope.schema.json").read_text(encoding="utf-8"))
    registry = (
        Registry()
        .with_resource("envelope.schema.json", Resource.from_contents(envelope))
        .with_resource(envelope["$id"], Resource.from_contents(envelope))
    )
    return registry, folder


@lru_cache
def _validator(event_type: str, version: int):
    from jsonschema import Draft202012Validator, FormatChecker

    registry, folder = _registry_and_dir()
    path = folder / f"{event_type}.v{version}.schema.json"
    if not path.is_file():
        return None
    schema = json.loads(path.read_text(encoding="utf-8"))
    return Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())


def has_contract(event_type: str, version: int) -> bool:
    try:
        return _validator(event_type, version) is not None
    except ContractError:
        return False  # contracts folder missing: validate() reports it for events Books handles


def validate(event: dict[str, Any]) -> None:
    """Raise ContractError unless ``event`` matches the contract for its type and version."""
    validator = _validator(str(event.get("type")), int(event.get("version") or 0))
    if validator is None:
        raise ContractError(f"There is no contract for {event.get('type')} v{event.get('version')}.")
    errors = sorted(validator.iter_errors(event), key=lambda e: list(e.absolute_path))
    if errors:
        first = errors[0]
        where = ".".join(str(p) for p in first.absolute_path) or "event"
        raise ContractError(f"{where}: {first.message}")
