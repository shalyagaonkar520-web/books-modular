"""Feature registry: every Books feature declared once, in one place.

A feature is what a plan sells (``plan_keys``, the module_pricing.json keys
whose writes it needs), what main.py mounts (``routers``) and what a connected
app may be granted (``<key>:read`` / ``<key>:write`` scopes on the API paths
under ``paths``).

To add a feature: write its router, add one ``Feature`` here (and its module to
module_pricing.json if it is sold separately). It is then mounted with the
app-access and plan guards, appears in the connected-app scope list and the
``/api/connect/v1/capabilities`` answer, and its API is usable by any app
granted its scope - nothing else to wire.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass, field
from typing import Optional, Sequence, Tuple

from fastapi import APIRouter


@dataclass(frozen=True)
class Feature:
    key: str
    label: str
    # "module:attribute" of the routers main.py mounts behind
    # require_full_app_access (+ require_module when plan_keys is set). Empty
    # when the routes are mounted elsewhere (payments). Strings, so this
    # registry imports no router (the routers import deps, which use it).
    routers: Sequence[str] = field(default_factory=tuple)
    # Writes need one of these modules in the organization's plan.
    plan_keys: Tuple[str, ...] = ()
    # API path prefixes a connected app reaches with this feature's scope;
    # empty = never available to connected apps.
    paths: Tuple[str, ...] = ()
    description: str = ""

    @property
    def connectable(self) -> bool:
        return bool(self.paths)

    def load_routers(self) -> list[APIRouter]:
        out = []
        for ref in self.routers:
            module, attr = ref.split(":")
            out.append(getattr(importlib.import_module(f"backend.routers.{module}"), attr))
        return out


FEATURES: Tuple[Feature, ...] = (
    Feature(
        "items",
        "Items",
        ("items:router", "items:adjustments_router"),
        ("items",),
        ("/api/items", "/api/inventory-adjustments"),
        "Products and services, prices, tax rates and stock.",
    ),
    Feature(
        "contacts",
        "Customers & vendors",
        ("contacts:router",),
        ("customers", "vendors"),
        ("/api/contacts",),
        "Customer and vendor records, balances and statements.",
    ),
    Feature("invoices", "Invoices", ("invoices:router",), ("invoices",), ("/api/invoices",), "GST invoices, credit notes and reminders."),
    Feature(
        "paymentsReceived",
        "Payments received",
        (),
        ("paymentsReceived",),
        ("/api/customer-payments",),
        "Customer payments, applied to the oldest unpaid invoices first.",
    ),
    Feature("bills", "Bills", ("bills:router",), ("bills",), ("/api/bills",), "Vendor bills and due dates."),
    Feature(
        "paymentsMade",
        "Payments made",
        (),
        ("paymentsMade",),
        ("/api/vendor-payments",),
        "Payments to vendors against bills.",
    ),
    Feature("expenses", "Expenses", ("expenses:router",), ("expenses",), ("/api/expenses",), "Business expenses with receipts."),
    Feature("banking", "Banking", ("banking:router",), ("banking",), ("/api/banking",), "Bank accounts, transactions and reconciliation."),
    Feature(
        "accounting",
        "Accountant",
        ("accounting:router",),
        ("accounting",),
        ("/api/accounting",),
        "Chart of accounts, manual journals and ledgers.",
    ),
    Feature(
        "timeTracking",
        "Time tracking",
        ("projects:router",),
        ("timeTracking",),
        ("/api/projects", "/api/time-entries"),
        "Projects, timesheets and billable hours.",
    ),
    Feature("documents", "Documents", ("documents:router",), ("documents",), ("/api/documents",), "Business documents."),
    Feature("payroll", "Payroll", ("payroll:router",), ("payroll",), ("/api/payroll",), "Employees, salary runs and payslips."),
    Feature("reports", "Reports", ("reports:router",), (), ("/api/reports",), "Profit and loss, balance sheet, GST and more."),
    # Mounted for the app, never offered to connected apps.
    Feature("dashboard", "Dashboard", ("dashboard:router",)),
    Feature("organization", "Organization settings", ("organization:router",)),
)

ACCESS_LEVELS = ("read", "write")


def connectable() -> Tuple[Feature, ...]:
    return tuple(f for f in FEATURES if f.connectable)


def by_key(key: str) -> Optional[Feature]:
    return next((f for f in FEATURES if f.key == key), None)


def scope_catalog() -> list[str]:
    """Every scope a connected app can be granted, e.g. ``invoices:write``."""
    return [f"{f.key}:{level}" for f in connectable() for level in ACCESS_LEVELS]


def feature_for_path(path: str) -> Optional[Feature]:
    """The connectable feature that owns an API path (longest prefix wins), else None."""
    best: Optional[Feature] = None
    best_len = -1
    for f in connectable():
        for prefix in f.paths:
            if (path == prefix or path.startswith(prefix + "/")) and len(prefix) > best_len:
                best, best_len = f, len(prefix)
    return best
