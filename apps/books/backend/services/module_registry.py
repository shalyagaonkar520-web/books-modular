"""The module registry: every switchable Books module declared once.

``backend/content/modules.json`` (mirrored byte-for-byte by the frontend in
``frontend/src/content/modules.json``) lists, per module:

- ``key``: the same keys as module_pricing.json and the app content ``modules``;
- ``dependsOn``: modules it cannot work without (a product including it gets them too);
- ``uses``: modules whose data it only looks up (account pickers, item lists):
  a product may read, but not write, those modules' API;
- ``api``: the API path prefixes it owns (longest prefix wins, so a report can
  belong to the module whose data it shows as well as to Reports);
- ``routes``, ``menu`` and ``roles``: the pages, the sidebar entry and the
  roles the sidebar shows it to (the backend checks roles in the routers).

``coreApi`` lists the few paths inside a module's prefix that every product
needs (chart-of-accounts and bank-account pickers, the Razorpay webhook, the
payment confirmation links a customer opens from an email).

Sign-in, the dashboard, settings and the organization are core, not modules:
always on, in every product.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, FrozenSet, Iterable, List, Tuple

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "content" / "modules.json"


@dataclass(frozen=True)
class Module:
    key: str
    label: str
    depends_on: Tuple[str, ...]
    uses: Tuple[str, ...]
    api: Tuple[str, ...]
    routes: Tuple[str, ...]
    roles: Tuple[str, ...]


@lru_cache
def document() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


@lru_cache
def modules() -> Tuple[Module, ...]:
    return tuple(
        Module(
            key=m["key"],
            label=m["label"],
            depends_on=tuple(m.get("dependsOn") or ()),
            uses=tuple(m.get("uses") or ()),
            api=tuple(m.get("api") or ()),
            routes=tuple(m.get("routes") or ()),
            roles=tuple(m.get("roles") or ()),
        )
        for m in document()["modules"]
    )


def keys() -> List[str]:
    return [m.key for m in modules()]


def by_key() -> Dict[str, Module]:
    return {m.key: m for m in modules()}


def core_api() -> Tuple[str, ...]:
    return tuple(document().get("coreApi") or ())


def resolve(selection: Iterable[str]) -> List[str]:
    """The selection plus everything it depends on, in registry order.

    Raises ValueError on an unknown module key.
    """
    known = by_key()
    requested = list(selection)
    unknown = sorted({k for k in requested if k not in known})
    if unknown:
        raise ValueError(f"Unknown module(s): {', '.join(unknown)}")
    selected: set[str] = set()
    pending = list(requested)
    while pending:
        key = pending.pop()
        if key not in selected:
            selected.add(key)
            pending.extend(known[key].depends_on)
    return [key for key in keys() if key in selected]


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def owners(path: str) -> List[FrozenSet[str]]:
    """Who owns an API path: one set of module keys per matching prefix.

    A request needs one module from every set (``/api/reports/sales-by-customer``
    needs Reports and Invoices; ``/api/contacts`` needs Customers or Vendors).
    Empty for a core path, which every product reaches.
    """
    matched: Dict[str, set] = {}
    for module in modules():
        for prefix in module.api:
            if _under(path, prefix):
                matched.setdefault(prefix, set()).add(module.key)
    core = [prefix for prefix in core_api() if _under(path, prefix)]
    if core and max(map(len, core)) >= max(map(len, matched), default=-1):
        return []
    return [frozenset(matched[prefix]) for prefix in sorted(matched)]
