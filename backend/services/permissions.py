"""Custom roles: what a user with role "custom" may see and change.

An organization admin defines roles (e.g. "Cashier", "Accountant") that give
each feature No access, View or Edit. A user on such a role has
``User.role == "custom"`` and ``User.custom_role_id`` set; every request they
make is checked here (from deps.require_roles):

- the request's API path names the feature (``FEATURES[...].api``);
- a read (GET) needs View or Edit, anything else needs Edit;
- admin-only areas (users, roles, company settings, the subscription) stay
  closed whatever the role says;
- lookups other screens need (pick an item, a customer, an account, a
  warehouse...) stay readable, as reads of other modules already are for staff.

The frontend mirrors this with the same keys (utils/permissions.ts).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

NONE, VIEW, EDIT = "none", "view", "edit"
LEVELS = (NONE, VIEW, EDIT)
_RANK = {NONE: 0, VIEW: 1, EDIT: 2}


@dataclass(frozen=True)
class PermissionFeature:
    key: str
    label: str
    group: str
    # API path prefixes it owns (empty for screens that only read other features).
    api: Tuple[str, ...] = ()


FEATURES: Tuple[PermissionFeature, ...] = (
    # Sales
    PermissionFeature("customers", "Customers & vendors", "Sales", ("/api/contacts",)),
    PermissionFeature("quotes", "Quotes", "Sales", ("/api/estimates",)),
    PermissionFeature("salesOrders", "Sales orders", "Sales", ("/api/sales-orders",)),
    PermissionFeature("deliveryChallans", "Delivery challans", "Sales", ("/api/delivery-challans",)),
    PermissionFeature("invoices", "Invoices", "Sales", ("/api/invoices", "/api/share")),
    PermissionFeature("recurring", "Recurring invoices, bills & journals", "Sales", ("/api/recurring-profiles",)),
    PermissionFeature("creditNotes", "Credit notes", "Sales", ("/api/credit-notes",)),
    PermissionFeature("paymentsReceived", "Payments received", "Sales", ("/api/customer-payments",)),
    PermissionFeature("refunds", "Refunds & advances", "Sales", ("/api/refunds", "/api/advances", "/api/credit-applications")),
    PermissionFeature("pos", "Point of Sale", "Sales", ("/api/pos",)),
    # Purchases
    PermissionFeature("purchaseOrders", "Purchase orders", "Purchases", ("/api/purchase-orders",)),
    PermissionFeature("bills", "Bills", "Purchases", ("/api/bills",)),
    PermissionFeature("vendorCredits", "Vendor credits", "Purchases", ("/api/vendor-credits",)),
    PermissionFeature("paymentsMade", "Payments made", "Purchases", ("/api/vendor-payments",)),
    PermissionFeature("expenses", "Expenses", "Purchases", ("/api/expenses",)),
    # Stock
    PermissionFeature("items", "Items", "Stock", ("/api/items", "/api/inventory-adjustments")),
    PermissionFeature(
        "inventory",
        "Inventory control",
        "Stock",
        ("/api/warehouses", "/api/transfer-orders", "/api/composite-items", "/api/price-lists", "/api/stock"),
    ),
    # Money
    PermissionFeature("banking", "Banking", "Money", ("/api/banking",)),
    PermissionFeature("razorpay", "Razorpay payments", "Money", ("/api/razorpay", "/api/payments")),
    PermissionFeature("financialHub", "Financial hub", "Money"),
    PermissionFeature("receivablesPayables", "Receivables & payables", "Money"),
    PermissionFeature("accounting", "Accountant (chart of accounts, journals)", "Money", ("/api/accounting", "/api/currencies")),
    PermissionFeature("fixedAssets", "Fixed assets", "Money", ("/api/fixed-assets",)),
    PermissionFeature("budgets", "Budgets", "Money", ("/api/budgets",)),
    # Tax
    PermissionFeature("gst", "GST filing", "Tax", ("/api/gst",)),
    PermissionFeature("incomeTax", "Income tax calculator", "Tax"),
    # Reports
    PermissionFeature("reports", "Reports", "Reports", ("/api/reports", "/api/report-schedules")),
    PermissionFeature("insights", "Insights", "Reports", ("/api/insights",)),
    PermissionFeature("ai", "AI assistant", "Reports", ("/api/ai",)),
    # Work
    PermissionFeature("timeTracking", "Time tracking & projects", "Work", ("/api/projects", "/api/time-entries")),
    PermissionFeature("documents", "Documents", "Work", ("/api/documents",)),
    PermissionFeature("payroll", "Payroll", "Work", ("/api/payroll",)),
    # Setup
    PermissionFeature(
        "automation",
        "Automation (workflows, approvals, custom fields)",
        "Setup",
        ("/api/workflow-rules", "/api/approvals", "/api/custom-fields"),
    ),
    PermissionFeature("branches", "Branches", "Setup", ("/api/branches",)),
    PermissionFeature("integrations", "Integrations (Tally, WhatsApp)", "Setup", ("/api/integrations",)),
)
FEATURE_KEYS = tuple(f.key for f in FEATURES)

# Never open to a custom role: managing people, roles, the company and its plan.
ADMIN_ONLY = ("/api/users", "/api/roles", "/api/audit-logs", "/api/subscription", "/api/document-branding", "/api/organization/lock-date")
# Read by every signed-in user (the shell of the app, and pickers on other screens).
ALWAYS_READABLE = (
    "/api/auth",
    "/api/me",
    "/api/app-content",
    "/api/dashboard",
    "/api/organization",
    "/api/subscription",
    "/api/document-branding",
    "/api/items",
    "/api/contacts",
    "/api/accounting/account-options",
    "/api/banking/account-options",
    "/api/branches",
    "/api/warehouses",
    "/api/price-lists",
    "/api/currencies",
    "/api/custom-fields",
    "/api/stock/summary",
)

_BY_PREFIX = sorted(((p, f.key) for f in FEATURES for p in f.api), key=lambda pair: -len(pair[0]))


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def feature_for_path(path: str) -> Optional[str]:
    for prefix, key in _BY_PREFIX:
        if _under(path, prefix):
            return key
    return None


def normalize(raw) -> Dict[str, str]:
    """A complete {feature: level} map from stored JSON or a request body; unknown keys dropped, missing = none."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = {}
    raw = raw if isinstance(raw, dict) else {}
    return {key: (raw.get(key) if raw.get(key) in LEVELS else NONE) for key in FEATURE_KEYS}


def level(permissions: Dict[str, str], key: str) -> str:
    return permissions.get(key, NONE)


def allows(permissions: Dict[str, str], key: str, needed: str) -> bool:
    return _RANK[level(permissions, key)] >= _RANK[needed]


def request_error(permissions: Dict[str, str], method: str, path: str) -> Optional[str]:
    """Why a custom-role user may not make this request (the 403 detail), else None."""
    reading = method.upper() in ("GET", "HEAD", "OPTIONS")
    if any(_under(path, p) for p in ADMIN_ONLY) and not (reading and any(_under(path, p) for p in ALWAYS_READABLE)):
        return "Only an administrator can do this."
    feature = feature_for_path(path)
    if reading and any(_under(path, p) for p in ALWAYS_READABLE):
        return None
    if feature is None:
        # Shared screens (the dashboard, your own profile) stay readable; nothing else.
        return None if reading else "Your role does not allow this."
    if allows(permissions, feature, VIEW if reading else EDIT):
        return None
    label = next(f.label for f in FEATURES if f.key == feature)
    return f"Your role does not allow {'viewing' if reading else 'changing'} {label}."


def catalog() -> list:
    return [{"key": f.key, "label": f.label, "group": f.group} for f in FEATURES]
