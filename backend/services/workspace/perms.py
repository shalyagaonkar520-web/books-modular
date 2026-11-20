"""Fine-grained permissions of an AI workspace.

A workspace holds ``{"features": {feature key: [actions]}, "financial": bool}`` where
the actions are view / create / edit / delete / approve / export (any of create, edit, delete,
approve and export implies view). ``financial`` unlocks the money-sensitive features
(reports, banking, accounting, payroll...) and cost / margin figures.

The same data is enforced twice, both on the server:
- the hidden OrgRole built from it plugs into the existing API guards (permissions.py), and
  ``api_error`` here adds the finer checks (create vs edit vs delete, export, approve, financial);
- every AI tool call goes through ``tools.execute``, which asks ``can`` first.
The AI itself never decides anything: it only proposes a tool, the code disposes.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Optional

from backend.services import permissions as base

VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT = "view", "create", "edit", "delete", "approve", "export"
ACTIONS = (VIEW, CREATE, EDIT, DELETE, APPROVE, EXPORT)
ACTION_LABELS = {
    VIEW: "View",
    CREATE: "Create",
    EDIT: "Edit",
    DELETE: "Delete",
    APPROVE: "Approve",
    EXPORT: "Export",
}

# Features that expose company money: closed unless the workspace has the Financial data switch.
FINANCIAL_FEATURES = frozenset(
    {
        "reports",
        "insights",
        "banking",
        "razorpay",
        "financialHub",
        "receivablesPayables",
        "accounting",
        "fixedAssets",
        "budgets",
        "gst",
        "incomeTax",
        "payroll",
    }
)
# Never grantable to an employee workspace.
EXCLUDED_FEATURES = frozenset({"ai", "integrations", "automation", "branches"})


def grantable_features() -> List[base.PermissionFeature]:
    return [f for f in base.FEATURES if f.key not in EXCLUDED_FEATURES]


GRANTABLE_KEYS = tuple(f.key for f in grantable_features())


def normalize(raw: Any) -> Dict[str, Any]:
    """A clean {"features": {...}, "financial": bool}; unknown keys / actions dropped."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = {}
    raw = raw if isinstance(raw, dict) else {}
    feats_in = raw.get("features") if isinstance(raw.get("features"), dict) else {}
    financial = bool(raw.get("financial"))
    feats: Dict[str, List[str]] = {}
    for key in GRANTABLE_KEYS:
        acts = feats_in.get(key)
        if not isinstance(acts, (list, tuple, set)):
            continue
        chosen = {a for a in acts if a in ACTIONS}
        if not chosen:
            continue
        chosen.add(VIEW)
        feats[key] = [a for a in ACTIONS if a in chosen]
    return {"features": feats, "financial": financial}


def effective(perm: Dict[str, Any]) -> Dict[str, List[str]]:
    """The features the workspace can really use: financial ones are dropped without the switch."""
    financial = bool(perm.get("financial"))
    return {k: list(v) for k, v in perm.get("features", {}).items() if financial or k not in FINANCIAL_FEATURES}


def can(perm: Dict[str, Any], feature: str, action: str = VIEW) -> bool:
    return action in effective(perm).get(feature, ())


def can_see_financial(perm: Dict[str, Any]) -> bool:
    return bool(perm.get("financial"))


def role_levels(perm: Dict[str, Any]) -> Dict[str, str]:
    """The {feature: none|view|edit} map for the hidden OrgRole (existing API guards)."""
    out = {key: base.NONE for key in base.FEATURE_KEYS}
    for key, acts in effective(perm).items():
        out[key] = base.EDIT if set(acts) & {CREATE, EDIT, DELETE} else base.VIEW
    return out


def parse_role_actions(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    return normalize(raw)


# --------------------------------------------------------------------------- #
# Request-level check (manual mode / direct API calls)
# --------------------------------------------------------------------------- #
_ID_SEGMENT = re.compile(r"^[0-9a-f]{32}$|^[0-9a-f-]{36}$|^\d+$")
# Reads that are not a plain "view": they hand out files or bulk data.
_EXPORT_WORDS = ("export", "pdf", "excel", "download", "csv", "print")
_APPROVE_WORDS = ("approve", "approvals", "reject")
# The pickers other screens need, readable only together with a feature that uses them.
_PICKERS = {
    "/api/items": (
        "items",
        "inventory",
        "invoices",
        "quotes",
        "salesOrders",
        "deliveryChallans",
        "purchaseOrders",
        "bills",
        "pos",
        "creditNotes",
        "vendorCredits",
    ),
    "/api/contacts": (
        "customers",
        "invoices",
        "quotes",
        "salesOrders",
        "deliveryChallans",
        "purchaseOrders",
        "bills",
        "pos",
        "creditNotes",
        "vendorCredits",
        "paymentsReceived",
        "paymentsMade",
    ),
    "/api/warehouses": ("inventory", "items", "invoices", "purchaseOrders", "bills", "pos"),
    "/api/price-lists": ("inventory", "invoices", "quotes", "salesOrders", "pos"),
    "/api/stock/summary": ("inventory", "items"),
    "/api/currencies": ("accounting", "invoices", "bills"),
    "/api/accounting/account-options": ("invoices", "bills", "expenses", "items", "paymentsReceived", "paymentsMade"),
    "/api/banking/account-options": ("paymentsReceived", "paymentsMade", "expenses"),
    "/api/custom-fields": tuple(base.FEATURE_KEYS),
    "/api/branches": tuple(base.FEATURE_KEYS),
}
# Always open to a signed-in workspace employee: the shell of the app and the workspace itself.
_OPEN_PREFIXES = ("/api/auth", "/api/me", "/api/app-content", "/api/organization", "/api/subscription", "/api/workspace", "/api/support")


def action_for_request(method: str, path: str, feature_prefixes: Iterable[str]) -> str:
    method = method.upper()
    lowered = [s.lower() for s in path.strip("/").split("/") if s]
    if method != "GET" and any(w in seg for seg in lowered for w in _APPROVE_WORDS):
        return APPROVE
    if method in ("GET", "HEAD", "OPTIONS"):
        return EXPORT if any(w in seg for seg in lowered[2:] for w in _EXPORT_WORDS) else VIEW
    if method == "DELETE":
        return DELETE
    if method == "POST":
        prefix = next((p for p in feature_prefixes if path == p or path.startswith(p + "/")), None)
        rest = [s for s in path[len(prefix) :].strip("/").split("/") if s] if prefix else lowered[2:]
        # POST on the collection (or a named collection action) creates; POST on one record edits it.
        return EDIT if any(_ID_SEGMENT.match(s) for s in rest) else CREATE
    return EDIT  # PUT / PATCH


def api_error(perm: Dict[str, Any], method: str, path: str) -> Optional[str]:
    """Why a workspace employee may not make this API request (the 403 detail), else None."""
    if any(path == p or path.startswith(p + "/") for p in _OPEN_PREFIXES):
        return None
    method = method.upper()
    reading = method in ("GET", "HEAD", "OPTIONS")
    eff = effective(perm)
    feature = base.feature_for_path(path)
    if reading:
        for prefix, users in _PICKERS.items():
            if path == prefix or path.startswith(prefix + "/"):
                # A picker is readable together with any feature that uses it.
                if any(k in eff for k in users):
                    return None
                break
    if path == "/api/dashboard" or path.startswith("/api/dashboard/"):
        return None if (can_see_financial(perm) and "reports" in eff) else "The business dashboard is not part of your workspace."
    if feature is None:
        return "Your workspace does not include this."
    label = next((f.label for f in base.FEATURES if f.key == feature), feature)
    if feature in FINANCIAL_FEATURES and feature not in eff:
        return "This holds financial data your workspace is not allowed to see."
    if feature not in eff:
        return f"Your workspace does not include {label}."
    prefixes = [p for f in base.FEATURES if f.key == feature for p in f.api]
    needed = action_for_request(method, path, prefixes)
    if needed in eff[feature]:
        return None
    return f"Your workspace may not {needed} {label}."


# --------------------------------------------------------------------------- #
# Catalog and presets for the owner's editor
# --------------------------------------------------------------------------- #
def catalog() -> Dict[str, Any]:
    return {
        "actions": [{"key": a, "label": ACTION_LABELS[a]} for a in ACTIONS],
        "features": [{"key": f.key, "label": f.label, "group": f.group, "financial": f.key in FINANCIAL_FEATURES} for f in grantable_features()],
    }


def _preset(features: Dict[str, List[str]], financial: bool = False) -> Dict[str, Any]:
    return normalize({"features": features, "financial": financial})


PRESETS: Dict[str, Dict[str, Any]] = {
    "sales": {
        "name": "Sales Workspace",
        "department": "Sales",
        "description": "Sales invoices, customers and sales reports. No warehouse or accounting access.",
        "permissions": _preset(
            {
                "customers": [VIEW, CREATE],
                "quotes": [VIEW, CREATE, EDIT],
                "salesOrders": [VIEW, CREATE, EDIT],
                "invoices": [VIEW, CREATE, EDIT, EXPORT],
                "items": [VIEW],
                "paymentsReceived": [VIEW],
                "reports": [VIEW],
            },
            financial=True,
        ),
    },
    "warehouse": {
        "name": "Warehouse Workspace",
        "department": "Warehouse",
        "description": "Products, photographs and stock. No sales financial reports and no accounting.",
        "permissions": _preset({"items": [VIEW, CREATE, EDIT], "inventory": [VIEW, CREATE, EDIT]}),
    },
    "purchase": {
        "name": "Purchase Workspace",
        "department": "Purchase",
        "description": "Purchase orders, bills and suppliers. No payroll or restricted modules.",
        "permissions": _preset(
            {
                "customers": [VIEW, CREATE, EDIT],
                "purchaseOrders": [VIEW, CREATE, EDIT],
                "bills": [VIEW, CREATE, EDIT],
                "vendorCredits": [VIEW],
                "items": [VIEW],
            }
        ),
    },
    "support": {
        "name": "Customer Support Workspace",
        "department": "Customer Support",
        "description": "Look up customers, invoices and stock to answer questions. Read only.",
        "permissions": _preset({"customers": [VIEW], "invoices": [VIEW], "items": [VIEW], "salesOrders": [VIEW]}),
    },
    "finance": {
        "name": "Finance Workspace",
        "department": "Finance",
        "description": "Payments, expenses, banking and reports with financial data.",
        "permissions": _preset(
            {
                "invoices": [VIEW, EXPORT],
                "bills": [VIEW, EXPORT],
                "paymentsReceived": [VIEW, CREATE],
                "paymentsMade": [VIEW, CREATE],
                "expenses": [VIEW, CREATE, EDIT],
                "banking": [VIEW],
                "reports": [VIEW, EXPORT],
                "customers": [VIEW],
            },
            financial=True,
        ),
    },
}


# --------------------------------------------------------------------------- #
# Financial figures in ordinary API answers
# --------------------------------------------------------------------------- #
COST_FIELDS = frozenset({"costPrice", "openingStockRate", "purchaseDescription", "purchaseAccountId", "purchaseAccountName"})


def strip_cost(value: Any) -> Any:
    """The JSON value without the purchase-cost fields (for an employee without Financial data)."""
    if isinstance(value, dict):
        return {k: strip_cost(v) for k, v in value.items() if k not in COST_FIELDS}
    if isinstance(value, list):
        return [strip_cost(v) for v in value]
    return value
