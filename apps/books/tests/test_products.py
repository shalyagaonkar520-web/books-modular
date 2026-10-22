"""Products: one Books codebase shipped as several apps, chosen by host.

Rooman Expenses (expenses + bills + vendors + reports) runs on the same
deployment, login, organizations and database as Rooman Books. A module
outside a product answers 403 there, whoever asks and whatever the page
shows; the organization's plan still applies on top; any other host is
Rooman Books with every module, exactly as before.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend import features
from backend.db import SessionLocal
from backend.main import app
from backend.models import Organization
from backend.schemas.app_content import default_document
from backend.services import module_pricing, module_registry, products
from tests.conftest import TODAY, auth, register_org

ROOT = Path(__file__).resolve().parents[1]
EXPENSES_HOST = "expenses.futureacad.ae"
EXPENSES = {"Host": EXPENSES_HOST}
NOT_IN_PRODUCT = products.NOT_IN_PRODUCT


def _on(host_headers: dict, h: dict) -> dict:
    return {**h, **host_headers}


def _refused(res) -> None:
    assert res.status_code == 403, res.text
    assert res.json()["detail"].startswith(NOT_IN_PRODUCT), res.text


@pytest.fixture(scope="module")
def tenant(client):
    """An organization on a trial (every module of its own open), with a vendor and a bank account."""
    ctx = register_org(client, "Products")
    h = auth(ctx["token"])
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Paper Mart"})
    assert vendor.status_code == 201, vendor.text
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Current", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2026-04-01"},
    )
    assert bank.status_code == 201, bank.text
    accounts = client.get("/api/accounting/accounts", headers=h).json()
    expense_account = next(a for a in accounts if a["type"] == "expense")
    return {**ctx, "h": h, "vendor": vendor.json(), "bank": bank.json(), "expense_account": expense_account}


# --------------------------------------------------------------------------- #
# Host -> product
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("host", "product"),
    [
        ("expenses.futureacad.ae", "expenses"),
        ("EXPENSES.futureacad.ae:443", "expenses"),
        ("expenses.futureacad.ae, proxy.internal", "expenses"),
        ("books.futureacad.ae", "books"),
        ("testserver", "books"),
        ("localhost:3000", "books"),
        ("10.0.0.5", "books"),
        ("[::1]:8000", "books"),
        ("", "books"),
        (None, "books"),
    ],
)
def test_host_selects_product_and_unknown_hosts_get_books(host, product):
    assert products.for_host(host).key == product


def test_forwarded_host_wins_over_host(client):
    res = client.get("/api/public/app-content", headers={"Host": "internal-api:8000", "X-Forwarded-Host": EXPENSES_HOST})
    assert res.status_code == 200 and res.json()["product"]["key"] == "expenses"
    res = client.get("/api/public/app-content", headers={"X-Forwarded-Host": "books.futureacad.ae"})
    assert "product" not in res.json()  # Rooman Books: exactly the answer it always gave


def test_books_is_the_fallback_and_has_every_module():
    books = products.fallback()
    assert books.key == "books" and books.app_key == "books" and books.is_full
    assert list(books.modules) == module_registry.keys()


def test_expenses_product_resolves_its_dependencies():
    expenses = products.get("expenses")
    assert expenses.name == "Rooman Expenses" and expenses.app_key == "expenses"
    assert set(expenses.modules) == {"expenses", "bills", "vendors", "reports"}
    assert not expenses.is_full
    # Lookups only: bills pick items and accounts, expenses pick bank accounts.
    assert {"items", "accounting", "banking"} <= expenses.uses


# --------------------------------------------------------------------------- #
# Gating per product
# --------------------------------------------------------------------------- #
def test_module_outside_the_product_is_unreachable(client, tenant):
    h = _on(EXPENSES, tenant["h"])
    for path in ("/api/invoices", "/api/customer-payments", "/api/payroll/employees", "/api/projects", "/api/documents", "/api/razorpay/overview"):
        _refused(client.get(path, headers=h))
    _refused(client.post("/api/invoices", headers=h, json={}))
    _refused(client.post("/api/payroll/employees", headers=h, json={}))
    # Reports of a module the product leaves out, even though Reports is in it.
    _refused(client.get("/api/reports/sales-by-customer", headers=h))
    _refused(client.get("/api/reports/receivables-aging", headers=h))
    # Not signed in makes no difference: the module is not there at all.
    _refused(client.get("/api/invoices", headers=EXPENSES))


def test_the_same_module_is_reachable_in_books(client, tenant):
    for path in ("/api/invoices", "/api/customer-payments", "/api/payroll/employees", "/api/projects", "/api/documents"):
        assert client.get(path, headers=tenant["h"]).status_code == 200, path
    assert client.get("/api/invoices", headers=_on({"Host": "books.futureacad.ae"}, tenant["h"])).status_code == 200


def test_product_modules_work(client, tenant):
    h = _on(EXPENSES, tenant["h"])
    expense = client.post(
        "/api/expenses",
        headers=h,
        json={
            "date": TODAY,
            "accountId": tenant["expense_account"]["id"],
            "paidThroughAccountId": tenant["bank"]["id"],
            "amount": 1180,
            "vendorId": tenant["vendor"]["id"],
        },
    )
    assert expense.status_code == 201, expense.text
    bill = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": tenant["vendor"]["id"],
            "vendorBillNumber": "PM-1",
            "date": TODAY,
            "lines": [{"description": "Paper", "quantity": 2, "rate": 500, "accountId": tenant["expense_account"]["id"]}],
        },
    )
    assert bill.status_code == 201, bill.text
    for path in ("/api/expenses", "/api/bills", "/api/reports/profit-and-loss", "/api/reports/purchases-by-vendor", "/api/dashboard/summary"):
        assert client.get(path, headers=h).status_code == 200, path


def test_lookups_are_read_only_and_core_paths_open(client, tenant):
    h = _on(EXPENSES, tenant["h"])
    # Pickers every product needs.
    assert client.get("/api/accounting/account-options", headers=h).status_code == 200
    assert client.get("/api/banking/account-options", headers=h).status_code == 200
    # Modules the product's modules look data up in: readable, not writable.
    assert client.get("/api/banking/accounts", headers=h).status_code == 200
    assert client.get("/api/items", headers=h).status_code == 200
    assert client.get("/api/vendor-payments", headers=h).status_code == 200
    _refused(client.post("/api/banking/accounts", headers=h, json={"name": "Petty", "type": "cash"}))
    _refused(client.post("/api/items", headers=h, json={"name": "Pen", "type": "goods"}))
    _refused(client.post("/api/vendor-payments", headers=h, json={}))
    # Core is in every product.
    for path in ("/api/organization", "/api/auth/me", "/api/app-content"):
        assert client.get(path, headers=h).status_code == 200, path


def test_contacts_follow_the_product_types(client, tenant):
    h = _on(EXPENSES, tenant["h"])
    created = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Ink Co"})
    assert created.status_code == 201, created.text
    _refused(client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Buyer"}))
    customer = client.post("/api/contacts", headers=tenant["h"], json={"type": "customer", "displayName": "Buyer"}).json()
    # Expenses can name the customer an expense is for (a lookup), but not change customers.
    assert client.get(f"/api/contacts/{customer['id']}", headers=h).status_code == 200
    _refused(client.put(f"/api/contacts/{customer['id']}", headers=h, json={"displayName": "Renamed"}))
    _refused(client.delete(f"/api/contacts/{customer['id']}", headers=h))


def test_dashboard_shows_only_the_product_modules(client, tenant):
    customer = client.post("/api/contacts", headers=tenant["h"], json={"type": "customer", "displayName": "Dash Buyer"}).json()
    invoice = client.post(
        "/api/invoices",
        headers=tenant["h"],
        json={"customerId": customer["id"], "date": TODAY, "lines": [{"description": "Work", "quantity": 1, "rate": 1000}]},
    )
    assert invoice.status_code == 201, invoice.text
    client.post(f"/api/invoices/{invoice.json()['id']}/status", headers=tenant["h"], json={"status": "sent"})

    books = client.get("/api/dashboard/summary", headers=tenant["h"]).json()
    assert books["receivables"]["totalUnpaidInvoices"] >= 1
    assert any(r["type"] == "invoice" for r in books["recentActivity"])

    expenses = client.get("/api/dashboard/summary", headers=_on(EXPENSES, tenant["h"])).json()
    assert expenses["receivables"]["totalUnpaidInvoices"] == 0 and expenses["topCustomers"] == []
    assert expenses["bankBalances"] is None and expenses["inventory"]["totalItemsCount"] == 0
    assert all(r["type"] in ("bill", "expense") for r in expenses["recentActivity"])


@pytest.fixture
def docs_product(monkeypatch):
    """A test-only product with Documents and Expenses but not Invoices, on docs.example.com."""
    fallback, catalog = products._catalog()
    docs = products._build({"key": "docs", "name": "Rooman Docs", "appKey": "docs", "domains": ["docs.example.com"], "modules": ["documents", "expenses"]})
    monkeypatch.setattr(products, "_catalog", lambda: (fallback, {**catalog, "docs": docs}))
    return {"Host": "docs.example.com"}


def test_import_cannot_create_records_of_another_module(client, tenant, docs_product):
    h = _on(docs_product, tenant["h"])
    # Documents itself is outside Rooman Expenses: refused before anything else.
    _refused(client.post("/api/documents/import-excel-commit", headers=_on(EXPENSES, tenant["h"]), json={"sections": []}))
    # A product with Documents still cannot import invoices when Invoices is not part of it.
    res = client.post("/api/documents/import-excel-commit", headers=h, json={"sections": [{"category": "Invoices", "sheet_name": "S", "headers": [], "rows": [], "count": 0}]})
    assert res.status_code == 403 and NOT_IN_PRODUCT in res.json()["detail"], res.text
    ok = client.post("/api/documents/import-excel-commit", headers=h, json={"sections": [{"category": "Expenses", "sheet_name": "S", "headers": [], "rows": [], "count": 0}]})
    assert ok.status_code == 200, ok.text


# --------------------------------------------------------------------------- #
# Gating per organization (the plan still applies inside a product)
# --------------------------------------------------------------------------- #
def test_organization_plan_still_applies_inside_the_product(client):
    ctx = register_org(client, "PlanInProduct")
    h = _on(EXPENSES, auth(ctx["token"]))
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Supplier"}).json()
    with SessionLocal() as db:
        org = db.get(Organization, ctx["org"]["id"])
        module_pricing.apply_to_org(db, org, ["expenses"])  # the core modules + expenses: no bills
        org.subscription_status = "active"
        db.commit()
    bill = client.post(
        "/api/bills",
        headers=h,
        json={"vendorId": vendor["id"], "vendorBillNumber": "B-1", "date": TODAY, "lines": [{"description": "x", "quantity": 1, "rate": 10}]},
    )
    assert bill.status_code == 403 and "subscription plan" in bill.json()["detail"], bill.text
    # Outside the product the product answers first; inside it, the plan does.
    _refused(client.post("/api/invoices", headers=h, json={}))
    # In Rooman Books the same organization keeps its plan's modules.
    assert client.get("/api/invoices", headers=auth(ctx["token"])).status_code == 200


# --------------------------------------------------------------------------- #
# App content carries the product (name, logo, colour, modules)
# --------------------------------------------------------------------------- #
def test_public_app_content_is_branded_by_product(client):
    books = client.get("/api/public/app-content").json()
    assert "product" not in books and books["branding"]["appName"] == default_document()["branding"]["appName"]
    assert all(books["modules"].values())

    expenses = client.get("/api/public/app-content", headers=EXPENSES).json()
    assert expenses["product"] == {
        "key": "expenses",
        "name": "Rooman Expenses",
        "modules": ["vendors", "bills", "expenses", "reports"],
    }
    assert expenses["branding"]["appName"] == "Rooman Expenses" and expenses["branding"]["primaryColor"] == "#0f766e"
    assert {k for k, on in expenses["modules"].items() if on} == {"vendors", "bills", "expenses", "reports"}


def test_org_branding_overrides_logo_and_colour_but_not_the_product_name(client, tenant):
    from backend.services.app_content import org_key
    from backend.services.platform_settings import set_value

    with SessionLocal() as db:
        overrides = {"branding": {"appName": "Acme Books", "logoUrl": "/acme.png", "primaryColor": "#112233"}}
        set_value(db, org_key(tenant["org"]["id"]), json.dumps(overrides))
        db.commit()
    try:
        books = client.get("/api/app-content", headers=tenant["h"]).json()
        assert books["branding"] == {"appName": "Acme Books", "logoUrl": "/acme.png", "primaryColor": "#112233"}
        expenses = client.get("/api/app-content", headers=_on(EXPENSES, tenant["h"])).json()
        assert expenses["branding"] == {"appName": "Rooman Expenses", "logoUrl": "/acme.png", "primaryColor": "#112233"}
    finally:
        with SessionLocal() as db:
            from backend.services.app_content import delete_org_app_content

            delete_org_app_content(db, tenant["org"]["id"])
            db.commit()


# --------------------------------------------------------------------------- #
# The registry is the one declaration
# --------------------------------------------------------------------------- #
def test_registry_keys_match_pricing_and_app_content():
    keys = module_registry.keys()
    assert keys == module_pricing.module_keys()
    assert keys == list(default_document()["modules"])
    pricing = {m["key"]: set(m.get("requires") or ()) for m in module_pricing.catalog()["modules"]}
    for module in module_registry.modules():
        assert pricing[module.key] <= set(module.depends_on), module.key
        assert set(module.depends_on) | set(module.uses) <= set(keys), module.key
        assert module.routes and module.label


def test_frontend_registry_matches_backend():
    backend = (ROOT / "backend" / "content" / "modules.json").read_bytes()
    frontend = (ROOT / "frontend" / "src" / "content" / "modules.json").read_bytes()
    assert frontend == backend, "frontend/src/content/modules.json must be a byte-for-byte copy of backend/content/modules.json"


def test_every_feature_path_belongs_to_a_module():
    for feature in features.FEATURES:
        for path in feature.paths:
            assert module_registry.owners(path), f"{feature.key}: {path} is not owned by any module in modules.json"


# Everything else under /api is core: in every product.
CORE_PREFIXES = (
    "/api/auth",
    "/api/me",  # the employee portal paths not owned by payroll / time tracking (none today)
    "/api/subscription",
    "/api/organization",
    "/api/users",
    "/api/audit-logs",
    "/api/dashboard",
    "/api/app-content",
    "/api/public",
    "/api/platform",
    "/api/org-admin",
    "/api/connect",
    "/api/integrations",
    "/api/email",
    "/api/health",
)


def test_every_api_route_is_a_module_or_core():
    """A new router must be declared in modules.json, or knowingly listed as core here."""
    unowned = []
    for path in app.openapi()["paths"]:
        concrete = path.replace("{", "x").replace("}", "")
        # /api/__test__ routes are mounted by test_error_handling for its own checks.
        if not path.startswith("/api") or path.startswith("/api/__test__") or module_registry.owners(concrete):
            continue
        if any(module_registry._under(concrete, p) for p in module_registry.core_api()):
            continue
        if not any(path == p or path.startswith(p + "/") for p in CORE_PREFIXES):
            unowned.append(path)
    assert unowned == []
