"""Branches (P&L by branch), serial numbers, mileage claims, project profitability,
contact statements and bank statement import with auto-matching."""

from datetime import date, timedelta

import pytest

from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today()
D = TODAY.isoformat()


@pytest.fixture
def books(client):
    ctx = register_org(client, "P7")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Current", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2025-01-01"},
    ).json()
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Asha Stores", "email": "a@x.com"}).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Parts Co"}).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "bank": bank, "customer": customer, "vendor": vendor, "accounts": accounts}


def _invoice(client, b, amount, **extra):
    body = {
        "customerId": b["customer"]["id"],
        "date": D,
        "status": "sent",
        "lines": [{"description": "Work", "quantity": 1, "rate": amount, "taxRate": 0}],
        **extra,
    }
    res = client.post("/api/invoices", headers=b["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _bill(client, b, amount, **extra):
    body = {
        "vendorId": b["vendor"]["id"],
        "date": D,
        "status": "open",
        "lines": [
            {
                "accountId": b["accounts"]["6000"]["id"] if "6000" in b["accounts"] else None,
                "description": "Cost",
                "quantity": 1,
                "rate": amount,
                "taxRate": 0,
            }
        ],
        **extra,
    }
    res = client.post("/api/bills", headers=b["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_profit_and_loss_by_branch(client, books):
    b, h = books, books["h"]
    pune = client.post("/api/branches", headers=h, json={"name": "Pune", "code": "PUN"}).json()
    goa = client.post("/api/branches", headers=h, json={"name": "Goa"}).json()
    assert client.post("/api/branches", headers=h, json={"name": "pune"}).status_code == 409
    _invoice(client, b, 1000, branchId=pune["id"])
    voided = _invoice(client, b, 700, branchId=pune["id"])
    _invoice(client, b, 400, branchId=goa["id"])
    _invoice(client, b, 50)
    client.post(f"/api/invoices/{voided['id']}/status", headers=h, json={"status": "void"})
    client.post(
        "/api/expenses",
        headers=h,
        json={
            "date": D,
            "accountId": b["accounts"]["6500"]["id"],
            "paidThroughAccountId": b["bank"]["id"],
            "amount": 300,
            "branchId": pune["id"],
        },
    )

    def pnl(branch=None):
        params = {"startDate": D, "endDate": D}
        if branch:
            params["branchId"] = branch
        return client.get("/api/reports/profit-and-loss", headers=h, params=params).json()

    pune_pnl = pnl(pune["id"])
    # The voided invoice and its reversal both carry the branch, so they cancel out.
    assert pune_pnl["income"]["total"] == 1000
    assert pune_pnl["operatingExpenses"]["total"] == 300
    assert pune_pnl["netProfit"] == 700
    assert pnl(goa["id"])["netProfit"] == 400
    assert pnl()["income"]["total"] == 1450
    # A used branch is deactivated, not deleted.
    assert "deactivated" in client.delete(f"/api/branches/{goa['id']}", headers=h).json()["message"]
    assert [x["name"] for x in client.get("/api/branches", headers=h).json()] == ["Pune"]
    assert trial_balance_ok(client, h)


def test_manual_journal_branch(client, books):
    b, h = books, books["h"]
    branch = client.post("/api/branches", headers=h, json={"name": "HQ"}).json()
    res = client.post(
        "/api/accounting/journals",
        headers=h,
        json={
            "date": D,
            "branchId": branch["id"],
            "lines": [
                {"accountId": b["accounts"]["6500"]["id"], "debit": 120, "credit": 0},
                {"accountId": b["accounts"]["3000"]["id"], "debit": 0, "credit": 120},
            ],
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["branchId"] == branch["id"]
    pnl = client.get("/api/reports/profit-and-loss", headers=h, params={"startDate": D, "endDate": D, "branchId": branch["id"]}).json()
    assert pnl["operatingExpenses"]["total"] == 120


def test_serial_numbers_bought_sold_and_returned(client, books):
    b, h = books, books["h"]
    phone = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "Phone",
            "sku": "PH-1",
            "type": "goods",
            "sellingPrice": 500,
            "costPrice": 300,
            "trackInventory": True,
            "trackSerial": True,
        },
    ).json()
    assert phone["trackSerial"] is True
    line = {"itemId": phone["id"], "description": "Phone", "quantity": 2, "rate": 300, "taxRate": 0}
    wrong = client.post(
        "/api/bills",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "date": D, "status": "open", "lines": [{**line, "serialNumbers": "SN1"}]},
    )
    assert wrong.status_code == 400 and "serial number" in wrong.json()["detail"]
    bill = client.post(
        "/api/bills",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "date": D, "status": "open", "lines": [{**line, "serialNumbers": "SN1, SN2"}]},
    )
    assert bill.status_code == 201, bill.text
    assert bill.json()["lines"][0]["serialNumbers"] == "SN1, SN2"
    serials = client.get("/api/stock/serials", headers=h, params={"itemId": phone["id"]}).json()
    assert {(s["serialNumber"], s["status"]) for s in serials} == {("SN1", "in_stock"), ("SN2", "in_stock")}

    sale = {"customerId": b["customer"]["id"], "date": D, "status": "sent"}
    unknown = client.post(
        "/api/invoices", headers=h, json={**sale, "lines": [{**line, "quantity": 1, "rate": 500, "serialNumbers": "SN9"}]}
    )
    assert unknown.status_code == 400 and "SN9" in unknown.json()["detail"]
    inv = client.post("/api/invoices", headers=h, json={**sale, "lines": [{**line, "quantity": 1, "rate": 500, "serialNumbers": "SN2"}]})
    assert inv.status_code == 201, inv.text
    statuses = {s["serialNumber"]: s["status"] for s in client.get("/api/stock/serials", headers=h).json()}
    assert statuses == {"SN1": "in_stock", "SN2": "out"}
    # The same unit cannot be sold twice.
    again = client.post("/api/invoices", headers=h, json={**sale, "lines": [{**line, "quantity": 1, "rate": 500, "serialNumbers": "SN2"}]})
    assert again.status_code == 400
    # Voiding the sale puts the unit back in stock.
    client.post(f"/api/invoices/{inv.json()['id']}/status", headers=h, json={"status": "void"})
    assert {s["serialNumber"]: s["status"] for s in client.get("/api/stock/serials", headers=h).json()}["SN2"] == "in_stock"
    # Receiving a serial that is already in stock is refused.
    dup = client.post(
        "/api/bills",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "date": D, "status": "open", "lines": [{**line, "quantity": 1, "serialNumbers": "SN1"}]},
    )
    assert dup.status_code == 400 and "already in stock" in dup.json()["detail"]
    assert trial_balance_ok(client, h)


def test_register_serials_for_opening_stock(client, books):
    h = books["h"]
    item = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "Laptop",
            "sku": "LP-1",
            "type": "goods",
            "costPrice": 1000,
            "trackInventory": True,
            "trackSerial": True,
            "openingStock": 2,
            "openingStockRate": 1000,
        },
    ).json()
    too_many = client.post("/api/stock/serials/register", headers=h, json={"itemId": item["id"], "serialNumbers": "A\nB\nC"})
    assert too_many.status_code == 400
    ok = client.post("/api/stock/serials/register", headers=h, json={"itemId": item["id"], "serialNumbers": "A\nB"})
    assert ok.status_code == 200, ok.text
    assert len(client.get("/api/stock/serials", headers=h, params={"status": "in_stock"}).json()) == 2


def test_mileage_claim(client, books):
    b, h = books, books["h"]
    no_rate = client.post("/api/expenses/mileage", headers=h, json={"date": D, "distanceKm": 40, "paidThroughAccountId": b["bank"]["id"]})
    assert no_rate.status_code == 400
    assert client.put("/api/organization", headers=h, json={"mileageRate": 9.5}).json()["mileageRate"] == 9.5
    res = client.post(
        "/api/expenses/mileage",
        headers=h,
        json={
            "date": D,
            "distanceKm": 42.5,
            "paidThroughAccountId": b["bank"]["id"],
            "fromPlace": "Office",
            "toPlace": "Client",
            "purpose": "Demo",
        },
    )
    assert res.status_code == 201, res.text
    e = res.json()
    assert e["total"] == 403.75 and e["distanceKm"] == 42.5 and e["ratePerKm"] == 9.5
    assert e["accountName"] == "Travel Expense" and e["category"] == "Mileage"
    assert "Office to Client" in e["notes"]
    assert trial_balance_ok(client, h)


def test_project_profitability(client, books):
    b, h = books, books["h"]
    project = client.post(
        "/api/projects", headers=h, json={"name": "Website", "customerId": b["customer"]["id"], "hourlyRate": 1000, "costRate": 400}
    ).json()
    assert project["costRate"] == 400
    _invoice(client, b, 20000, projectId=project["id"])
    _bill(client, b, 3000, projectId=project["id"])
    client.post(
        "/api/expenses",
        headers=h,
        json={
            "date": D,
            "accountId": b["accounts"]["6500"]["id"],
            "paidThroughAccountId": b["bank"]["id"],
            "amount": 500,
            "projectId": project["id"],
        },
    )
    client.post("/api/time-entries", headers=h, json={"projectId": project["id"], "date": D, "hours": 10, "isBillable": True})
    p = client.get(f"/api/projects/{project['id']}/profitability", headers=h).json()
    assert p["revenue"] == 20000 and p["billCosts"] == 3000 and p["expenseCosts"] == 500
    assert p["labourHours"] == 10 and p["labourCost"] == 4000
    assert p["totalCost"] == 7500 and p["profit"] == 12500 and p["marginPercent"] == 62.5
    assert p["unbilledAmount"] == 10000
    assert {c["kind"] for c in p["costs"]} == {"bill", "expense"}


def test_customer_statement_running_balance(client, books):
    b, h = books, books["h"]
    old = (TODAY - timedelta(days=40)).isoformat()
    _invoice(client, b, 1000, date=old)
    inv = _invoice(client, b, 2500)
    client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["customer"]["id"], "invoiceId": inv["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 2000},
    )
    start = (TODAY - timedelta(days=10)).isoformat()
    st = client.get(f"/api/contacts/{b['customer']['id']}/statement", headers=h, params={"startDate": start, "endDate": D}).json()
    assert st["openingBalance"] == 1000
    assert [r["kind"] for r in st["rows"]] == ["Invoice", "Payment received"]
    assert [r["balance"] for r in st["rows"]] == [3500, 1500]
    assert st["charges"] == 2500 and st["receipts"] == 2000 and st["closingBalance"] == 1500
    pdf = client.get(f"/api/contacts/{b['customer']['id']}/statement/pdf", headers=h, params={"startDate": start, "endDate": D})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_vendor_statement_sign(client, books):
    b, h = books, books["h"]
    _bill(client, b, 800)
    st = client.get(f"/api/contacts/{b['vendor']['id']}/statement", headers=h, params={"startDate": D, "endDate": D}).json()
    assert st["closingBalance"] == 800 and st["rows"][0]["kind"] == "Bill"


def test_send_statement_email(client, books, monkeypatch):
    b, h = books, books["h"]
    sent = {}

    def fake_send(**kwargs):
        sent.update(kwargs)
        return {"success": True}

    monkeypatch.setattr("backend.routers.contacts.send_custom_message_email", fake_send)
    _invoice(client, b, 900)
    res = client.post(f"/api/contacts/{b['customer']['id']}/statement/send", headers=h, json={})
    assert res.status_code == 200, res.text
    assert sent["to_email"] == "a@x.com" and sent["attachment"][1][:4] == b"%PDF"
    assert "900.00" in sent["message"]


CSV = """Account Statement for A/c 1234
Date,Narration,Chq./Ref.No.,Withdrawal Amt.,Deposit Amt.,Closing Balance
{d},NEFT ASHA STORES {inv},UTR1,,2500.00,102500.00
{d},BANK CHARGES,,59.00,,102441.00
{d},UPI SALARY REFUND,,1200.00,,101241.00
{d},INTEREST CREDIT,,,"1,234.50",102475.50
,Closing balance,,,,102475.50
"""


def test_bank_statement_import_match_and_reconcile(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, 2500)
    # Already in the books: a 1,200 withdrawal recorded by hand two days earlier.
    tx = client.post(
        f"/api/banking/accounts/{b['bank']['id']}/transactions",
        headers=h,
        json={
            "date": (TODAY - timedelta(days=2)).isoformat(),
            "type": "withdrawal",
            "amount": 1200,
            "description": "Salary advance",
            "counterAccountId": b["accounts"]["6500"]["id"],
        },
    ).json()
    content = CSV.format(d=TODAY.strftime("%d/%m/%Y"), inv=inv["invoiceNumber"]).encode()
    url = f"/api/banking/accounts/{b['bank']['id']}/statements/import"
    res = client.post(url, headers=h, files={"file": ("st.csv", content, "text/csv")})
    assert res.status_code == 200, res.text
    assert res.json() == {"imported": 4, "duplicates": 0, "autoMatched": 1, "errors": []}
    # Importing the same file again adds nothing.
    assert client.post(url, headers=h, files={"file": ("st.csv", content, "text/csv")}).json()["duplicates"] == 4

    txs = client.get("/api/banking/transactions", headers=h, params={"bank_account_id": b["bank"]["id"]}).json()["items"]
    assert next(t for t in txs if t["id"] == tx["id"])["isReconciled"] is True

    lines = client.get(f"/api/banking/accounts/{b['bank']['id']}/statement-lines", headers=h).json()
    assert len(lines) == 3
    deposit = next(x for x in lines if x["amount"] == 2500)
    # The invoice number in the narration makes the open invoice the top suggestion.
    assert deposit["candidates"][0]["kind"] == "invoice" and deposit["candidates"][0]["id"] == inv["id"]
    applied = client.post(f"/api/banking/statement-lines/{deposit['id']}/apply", headers=h, json={"invoiceId": inv["id"]})
    assert applied.status_code == 200, applied.text
    assert applied.json()["status"] == "matched"
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] == "paid"

    charges = next(x for x in lines if x["amount"] == 59)
    booked = client.post(
        f"/api/banking/statement-lines/{charges['id']}/categorize", headers=h, json={"accountId": b["accounts"]["6500"]["id"]}
    )
    assert booked.status_code == 200, booked.text
    interest = next(x for x in lines if x["amount"] == 1234.5)
    assert interest["type"] == "deposit"
    assert client.post(f"/api/banking/statement-lines/{interest['id']}/ignore", headers=h).json()["status"] == "ignored"
    assert client.get(f"/api/banking/accounts/{b['bank']['id']}/statement-lines", headers=h).json() == []
    # Undo puts a line back and unreconciles its transaction.
    undone = client.post(f"/api/banking/statement-lines/{booked.json()['id']}/undo", headers=h).json()
    assert undone["status"] == "unmatched"
    assert trial_balance_ok(client, h)


def test_statement_signed_amount_format(client, books):
    b, h = books, books["h"]
    content = f"Txn Date;Description;Amount;Dr/Cr\n{D};Card fee;150;DR\n{D};Refund;75.25;CR\n".encode()
    res = client.post(
        f"/api/banking/accounts/{b['bank']['id']}/statements/import", headers=h, files={"file": ("s.csv", content, "text/csv")}
    )
    assert res.json()["imported"] == 2
    lines = client.get(f"/api/banking/accounts/{b['bank']['id']}/statement-lines", headers=h).json()
    assert {(x["type"], x["amount"]) for x in lines} == {("withdrawal", 150), ("deposit", 75.25)}
    bad = client.post(
        f"/api/banking/accounts/{b['bank']['id']}/statements/import", headers=h, files={"file": ("s.csv", b"a,b\n1,2\n", "text/csv")}
    )
    assert bad.status_code == 400


def test_upi_id_validation(client, books):
    h = books["h"]
    assert client.put("/api/organization", headers=h, json={"upiId": "not a upi"}).status_code == 422
    assert client.put("/api/organization", headers=h, json={"upiId": "shop@okhdfcbank"}).json()["upiId"] == "shop@okhdfcbank"
