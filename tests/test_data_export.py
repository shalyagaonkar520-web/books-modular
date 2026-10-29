"""Export all books: one workbook with every record of the organization, and nothing else."""

import io
from datetime import date

from openpyxl import load_workbook

from tests.conftest import auth, invite_and_accept, register_org

D = date.today().isoformat()


def _books(client, name):
    ctx = register_org(client, name)
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Bank", "type": "bank", "openingBalance": 5000, "openingBalanceDate": "2026-01-01"},
    ).json()
    cust = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": f"{name} Buyer"}).json()
    vend = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": f"{name} Supplier"}).json()
    item = client.post(
        "/api/items", headers=h, json={"name": f"{name} Widget", "sku": f"{name}-W", "type": "goods", "sellingPrice": 100, "taxRate": 18}
    ).json()
    line = {"itemId": item["id"], "description": "Widget", "quantity": 2, "rate": 100, "taxRate": 18}
    inv = client.post("/api/invoices", headers=h, json={"customerId": cust["id"], "date": D, "status": "sent", "lines": [line]}).json()
    client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": cust["id"], "invoiceId": inv["id"], "bankAccountId": bank["id"], "date": D, "amount": 100, "mode": "upi"},
    )
    client.post("/api/bills", headers=h, json={"vendorId": vend["id"], "date": D, "lines": [{**line, "rate": 50}]})
    return ctx, h


def _sheets(content: bytes):
    wb = load_workbook(io.BytesIO(content), read_only=True)
    return {ws.title: [list(r) for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}


def test_export_has_every_kind_of_record_and_finance_summaries(client):
    _, h = _books(client, "Exporta")
    _books(client, "Otherco")
    res = client.get("/api/organization/export", headers=h)
    assert res.status_code == 200, res.text
    assert "spreadsheetml" in res.headers["content-type"] and "books" in res.headers["content-disposition"]
    sheets = _sheets(res.content)
    for name in (
        "Read me",
        "Trial balance",
        "Customer balances",
        "Vendor balances",
        "Organization",
        "Customers & vendors",
        "Items",
        "Invoices",
        "Invoice lines",
        "Customer payments",
        "Bills",
        "Bill lines",
        "Chart of accounts",
        "Journal entries",
        "Journal lines",
        "Bank accounts",
        "Users",
    ):
        assert name in sheets, name

    # Only this organization's records.
    flat = str(sheets)
    assert "Exporta Buyer" in flat and "Otherco" not in flat
    # Lines follow their documents: one invoice, one line.
    assert len(sheets["Invoices"]) == 2 and len(sheets["Invoice lines"]) == 2
    # The trial balance balances.
    total = sheets["Trial balance"][-1]
    assert total[1] == "Total" and abs(total[3] - total[4]) < 0.01
    # Customer balance: 236 invoiced, 100 paid.
    buyer = next(r for r in sheets["Customer balances"] if r[0] == "Exporta Buyer")
    assert buyer[2] == 236 and buyer[3] == 136
    # No secrets anywhere.
    for title, rows in sheets.items():
        assert not any("hash" in str(c).lower() or "token" in str(c).lower() for c in rows[0]), title
    assert "Refresh tokens" not in sheets and "App connections" not in sheets


def test_export_is_for_administrators_only(client):
    ctx, h = _books(client, "Exportb")
    invite_and_accept(client, h, "Sam Staff", "sam.staff@exportb.example.com", "staff", "Staff1Pass!")
    staff = auth(
        client.post("/api/auth/login", json={"email": "sam.staff@exportb.example.com", "password": "Staff1Pass!"}).json()["accessToken"]
    )
    assert client.get("/api/organization/export", headers=staff).status_code == 403

    role = client.post(
        "/api/roles", headers=h, json={"name": "All edit", "permissions": {"invoices": "edit", "banking": "edit", "accounting": "edit"}}
    ).json()
    invite_and_accept(client, h, "Cora Custom", "cora@exportb.example.com", "custom", "Cora1Pass!", custom_role_id=role["id"])
    custom = auth(
        client.post("/api/auth/login", json={"email": "cora@exportb.example.com", "password": "Cora1Pass!"}).json()["accessToken"]
    )
    assert client.get("/api/organization/export", headers=custom).status_code == 403
