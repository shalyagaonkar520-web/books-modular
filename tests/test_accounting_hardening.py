"""Pre-production accounting fixes: advances, reconciled movements, statement undo and
duplicates, serials on transfers and credits, tax summary, ageing as of a date,
disposals, statement totals and Tally ledger names."""

import xml.etree.ElementTree as ET
from datetime import date, timedelta

import pytest

from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today()
D = (TODAY - timedelta(days=10)).isoformat()


@pytest.fixture
def books(client):
    ctx = register_org(client, "Acct")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Current", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2026-01-01", "isPrimary": True},
    ).json()
    cust = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Globex"}).json()
    vend = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Supp"}).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "bank": bank, "cust": cust, "vend": vend, "accounts": accounts}


def _bal(client, h, code):
    return next(a for a in client.get("/api/accounting/accounts", headers=h).json() if a["code"] == code)["balance"]


def _invoice(client, b, amount, day=D, tax=0, **extra):
    res = client.post(
        "/api/invoices",
        headers=b["h"],
        json={
            "customerId": b["cust"]["id"],
            "date": day,
            "status": "sent",
            "lines": [{"description": "Svc", "quantity": 1, "rate": amount, "taxRate": tax}],
            **extra,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _import(client, b, csv_text):
    url = f"/api/banking/accounts/{b['bank']['id']}/statements/import"
    return client.post(url, headers=b["h"], files={"file": ("s.csv", csv_text.encode(), "text/csv")}).json()


def test_applied_advance_cannot_be_deleted(client, books):
    b, h = books, books["h"]
    adv = client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["cust"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 1000},
    ).json()
    inv = _invoice(client, b, 1000)
    applied = client.post(
        "/api/advances/apply",
        headers=h,
        json={"partyType": "customer", "contactId": b["cust"]["id"], "documentId": inv["id"], "amount": 1000},
    )
    assert applied.status_code == 201, applied.text
    res = client.delete(f"/api/customer-payments/{adv['id']}", headers=h)
    assert res.status_code == 400 and "already been applied" in res.json()["detail"]
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] == "paid"
    assert _bal(client, h, "2400") == 0

    vadv = client.post(
        "/api/vendor-payments", headers=h, json={"vendorId": b["vend"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 700}
    ).json()
    bill = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": b["vend"]["id"],
            "date": D,
            "status": "open",
            "lines": [{"accountId": b["accounts"]["6000"]["id"], "description": "x", "quantity": 1, "rate": 700, "taxRate": 0}],
        },
    ).json()
    client.post(
        "/api/advances/apply",
        headers=h,
        json={"partyType": "vendor", "contactId": b["vend"]["id"], "documentId": bill["id"], "amount": 700},
    )
    assert client.delete(f"/api/vendor-payments/{vadv['id']}", headers=h).status_code == 400
    assert trial_balance_ok(client, h)


def test_reconciled_expense_cannot_be_changed_silently(client, books):
    b, h = books, books["h"]
    body = {"date": D, "accountId": b["accounts"]["6200"]["id"], "paidThroughAccountId": b["bank"]["id"], "amount": 500}
    e = client.post("/api/expenses", headers=h, json=body).json()
    assert _import(client, b, f"Date,Narration,Withdrawal,Deposit\n{D},SHOP,500.00,\n")["autoMatched"] == 1
    res = client.put(f"/api/expenses/{e['id']}", headers=h, json={**body, "notes": "typo"})
    assert res.status_code == 400 and "reconciled" in res.json()["detail"]
    # Undo the match, then the edit goes through.
    line = client.get(f"/api/banking/accounts/{b['bank']['id']}/statement-lines", headers=h, params={"status": "matched"}).json()[0]
    client.post(f"/api/banking/statement-lines/{line['id']}/undo", headers=h)
    assert client.put(f"/api/expenses/{e['id']}", headers=h, json={**body, "notes": "typo"}).status_code == 200


def test_statement_undo_removes_what_it_created(client, books):
    b, h = books, books["h"]
    _import(client, b, f"Date,Narration,Withdrawal,Deposit\n{D},BANK CHARGES,250.00,\n")
    line = client.get(f"/api/banking/accounts/{b['bank']['id']}/statement-lines", headers=h).json()[0]
    fees = b["accounts"]["6100"]["id"]
    assert client.post(f"/api/banking/statement-lines/{line['id']}/categorize", headers=h, json={"accountId": fees}).status_code == 200
    assert client.post(f"/api/banking/statement-lines/{line['id']}/undo", headers=h).json()["status"] == "unmatched"
    assert client.post(f"/api/banking/statement-lines/{line['id']}/categorize", headers=h, json={"accountId": fees}).status_code == 200
    assert _bal(client, h, "6100") == 250  # booked once, not twice
    bank = next(a for a in client.get("/api/banking/accounts", headers=h).json() if a["id"] == b["bank"]["id"])
    assert bank["currentBalance"] == 100000 - 250

    # Undo of a payment recorded from a line deletes that payment and reopens the invoice.
    inv = _invoice(client, b, 4720)
    _import(client, b, f"Date,Narration,Withdrawal,Deposit\n{D},UPI CR GLOBEX,,4720.00\n")
    dep = next(x for x in client.get(f"/api/banking/accounts/{b['bank']['id']}/statement-lines", headers=h).json() if x["amount"] == 4720)
    client.post(f"/api/banking/statement-lines/{dep['id']}/apply", headers=h, json={"invoiceId": inv["id"]})
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] == "paid"
    client.post(f"/api/banking/statement-lines/{dep['id']}/undo", headers=h)
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] in ("sent", "overdue")
    assert trial_balance_ok(client, h)


def test_identical_rows_in_one_statement_are_both_imported(client, books):
    csv = f"Date,Narration,Withdrawal,Deposit\n{D},SMS CHARGES,15.00,\n{D},SMS CHARGES,15.00,\n"
    assert _import(client, books, csv) == {"imported": 2, "duplicates": 0, "autoMatched": 0, "errors": []}
    again = _import(client, books, csv)
    assert again["imported"] == 0 and again["duplicates"] == 2


def _phone(client, b):
    h = b["h"]
    phone = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "Phone",
            "sku": "PH-X",
            "type": "goods",
            "sellingPrice": 500,
            "costPrice": 300,
            "trackInventory": True,
            "trackSerial": True,
        },
    ).json()
    line = {"itemId": phone["id"], "description": "Phone", "quantity": 2, "rate": 300, "taxRate": 0}
    assert (
        client.post(
            "/api/bills",
            headers=h,
            json={"vendorId": b["vend"]["id"], "date": D, "status": "open", "lines": [{**line, "serialNumbers": "SN1, SN2"}]},
        ).status_code
        == 201
    )
    return phone, line


def _serials(client, h, item):
    return {
        s["serialNumber"]: (s["status"], s["warehouseName"])
        for s in client.get("/api/stock/serials", headers=h, params={"itemId": item["id"]}).json()
    }


def test_serials_move_with_transfers_and_credits(client, books):
    b, h = books, books["h"]
    phone, line = _phone(client, b)
    whs = client.get("/api/warehouses", headers=h).json()
    w2 = client.post("/api/warehouses", headers=h, json={"name": "Branch WH"}).json()
    t = client.post(
        "/api/transfer-orders",
        headers=h,
        json={
            "date": D,
            "fromWarehouseId": whs[0]["id"],
            "toWarehouseId": w2["id"],
            "lines": [{"itemId": phone["id"], "quantity": 1, "serialNumbers": "SN1"}],
        },
    )
    assert t.status_code == 201, t.text
    assert _serials(client, h, phone)["SN1"] == ("in_stock", "Branch WH")
    sale = {
        "customerId": b["cust"]["id"],
        "date": D,
        "status": "sent",
        "warehouseId": w2["id"],
        "lines": [{**line, "quantity": 1, "rate": 500, "serialNumbers": "SN1"}],
    }
    inv = client.post("/api/invoices", headers=h, json=sale)
    assert inv.status_code == 201, inv.text
    # Customer returns SN1 on a credit note: it is back in stock and can be sold again.
    cn = client.post(
        "/api/credit-notes",
        headers=h,
        json={
            "customerId": b["cust"]["id"],
            "date": D,
            "status": "open",
            "warehouseId": w2["id"],
            "lines": [{**line, "quantity": 1, "rate": 500, "serialNumbers": "SN1"}],
        },
    )
    assert cn.status_code == 201, cn.text
    assert _serials(client, h, phone)["SN1"][0] == "in_stock"
    # Returning SN2 to the vendor takes it out of stock.
    vc = client.post(
        "/api/vendor-credits",
        headers=h,
        json={"vendorId": b["vend"]["id"], "date": D, "status": "open", "lines": [{**line, "quantity": 1, "serialNumbers": "SN2"}]},
    )
    assert vc.status_code == 201, vc.text
    assert _serials(client, h, phone)["SN2"][0] == "out"
    assert trial_balance_ok(client, h)


def test_tax_summary_nets_credit_notes(client, books):
    b, h = books, books["h"]
    _invoice(client, b, 1000, tax=18)
    cn = client.post(
        "/api/credit-notes",
        headers=h,
        json={
            "customerId": b["cust"]["id"],
            "date": D,
            "status": "open",
            "lines": [{"description": "x", "quantity": 1, "rate": 1000, "taxRate": 18}],
        },
    )
    assert cn.status_code == 201, cn.text
    s = client.get(
        "/api/reports/tax-summary",
        headers=h,
        params={"start_date": (TODAY - timedelta(days=40)).isoformat(), "end_date": TODAY.isoformat()},
    ).json()
    assert s["outputGst"] == 0 and s["netPayable"] == 0 and s["taxableSales"] == 0


def test_receivables_ageing_as_of_a_past_date(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, 1000, day=(TODAY - timedelta(days=60)).isoformat(), dueDate=(TODAY - timedelta(days=45)).isoformat())
    client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["cust"]["id"], "invoiceId": inv["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 1000},
    )
    then = client.get("/api/reports/receivables-aging", headers=h, params={"as_of": (TODAY - timedelta(days=20)).isoformat()}).json()
    assert then["total"] == 1000 and next(x for x in then["buckets"] if x["label"] == "1-30 days")["amount"] == 1000
    assert client.get("/api/reports/receivables-aging", headers=h).json()["total"] == 0


def test_disposal_before_posted_depreciation_is_refused(client, books):
    h = books["h"]
    a = client.post(
        "/api/fixed-assets",
        headers=h,
        json={
            "name": "Laptop",
            "purchaseDate": "2026-01-01",
            "depreciationStart": "2026-01-01",
            "cost": 12000,
            "usefulLifeMonths": 12,
            "postOpeningBalance": True,
        },
    ).json()
    client.post("/api/fixed-assets/run-depreciation", headers=h, json={"through": "2026-09-30"})
    res = client.post(f"/api/fixed-assets/{a['id']}/dispose", headers=h, json={"date": "2026-03-15", "proceeds": 0})
    assert res.status_code == 400 and "Undo the months" in res.json()["detail"]


def test_statement_totals_net_advances_and_voids(client, books):
    b, h = books, books["h"]
    client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["cust"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 1000},
    )
    inv = _invoice(client, b, 1000)
    client.post(
        "/api/advances/apply",
        headers=h,
        json={"partyType": "customer", "contactId": b["cust"]["id"], "documentId": inv["id"], "amount": 1000},
    )
    inv2 = _invoice(client, b, 500)
    client.post(f"/api/invoices/{inv2['id']}/status", headers=h, json={"status": "void"})
    st = client.get(
        f"/api/contacts/{b['cust']['id']}/statement", headers=h, params={"startDate": "2026-01-01", "endDate": TODAY.isoformat()}
    ).json()
    assert st["charges"] == 1000 and st["receipts"] == 1000 and st["closingBalance"] == 0


def test_tally_names_are_unique_and_control_lines_have_masters(client, books):
    b, h = books, books["h"]
    client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Globex"})  # same name as the customer
    _invoice(client, b, 300, day=TODAY.isoformat())
    j = client.post(
        "/api/accounting/journals",
        headers=h,
        json={
            "date": TODAY.isoformat(),
            "lines": [
                {"accountId": b["accounts"]["1100"]["id"], "debit": 50, "credit": 0},
                {"accountId": b["accounts"]["4000"]["id"], "debit": 0, "credit": 50},
            ],
        },
    )
    assert j.status_code == 201, j.text
    root = ET.fromstring(
        client.get(
            "/api/integrations/tally/export", headers=h, params={"startDate": TODAY.isoformat(), "endDate": TODAY.isoformat()}
        ).content
    )
    names = [ld.get("NAME") for ld in root.iter("LEDGER")]
    assert len(names) == len({n.lower() for n in names})
    assert "Globex" in names and "Globex (Vendor)" in names and "Accounts Receivable" in names
    used = {e.findtext("LEDGERNAME") for e in root.iter("ALLLEDGERENTRIES.LIST")}
    assert used <= set(names)
