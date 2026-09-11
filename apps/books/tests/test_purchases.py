from tests.conftest import trial_balance_ok


def _bill_payload(org, qty=5, rate=6800, status="open", **extra):
    payload = {
        "vendorId": org["vendor"]["id"],
        "vendorBillNumber": "DL-778",
        "date": "2026-09-01",
        "status": status,
        "lines": [{"itemId": org["item"]["id"], "description": "Monitors", "quantity": qty, "rate": rate, "taxRate": 18}],
    }
    payload.update(extra)
    return payload


def test_bill_increases_stock_updates_cost_and_posts_ap(client, org):
    h = org["h"]
    before = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    res = client.post("/api/bills", headers=h, json=_bill_payload(org))
    assert res.status_code == 201, res.text
    bill = res.json()
    assert bill["billNumber"].startswith("BILL-") and bill["total"] == 40120 and bill["dueDate"] == "2026-10-01"
    item = client.get(f"/api/items/{org['item']['id']}", headers=h).json()
    assert item["stockOnHand"] == before + 5 and item["costPrice"] == 6800
    journals = client.get("/api/accounting/journals", headers=h, params={"source_type": "bill"}).json()["items"]
    entry = next(j for j in journals if j["sourceId"] == bill["id"])
    assert sum(line["credit"] for line in entry["lines"] if line["accountCode"] == "2000") == 40120
    assert sum(line["debit"] for line in entry["lines"] if line["accountCode"] == "1300") == 6120
    assert trial_balance_ok(client, h)


def test_vendor_payment_and_void_rules(client, org):
    h = org["h"]
    bill = client.post("/api/bills", headers=h, json=_bill_payload(org, qty=1, rate=1000)).json()  # 1180
    pay = client.post("/api/vendor-payments", headers=h, json={"vendorId": org["vendor"]["id"], "billId": bill["id"], "bankAccountId": org["bank"]["id"], "date": "2026-09-05", "amount": 1180, "mode": "bank_transfer", "reference": "NEFT123"})
    assert pay.status_code == 201, pay.text
    state = client.get(f"/api/bills/{bill['id']}", headers=h).json()
    assert state["status"] == "paid" and state["balanceDue"] == 0
    assert client.post(f"/api/bills/{bill['id']}/status", headers=h, json={"status": "void"}).status_code == 400
    assert client.delete(f"/api/vendor-payments/{pay.json()['id']}", headers=h).status_code == 200
    state = client.get(f"/api/bills/{bill['id']}", headers=h).json()
    assert state["status"] in ("open", "overdue") and state["balanceDue"] == 1180
    voided = client.post(f"/api/bills/{bill['id']}/status", headers=h, json={"status": "void"})
    assert voided.status_code == 200 and voided.json()["status"] == "void"
    assert trial_balance_ok(client, h)


def test_bill_validation(client, org):
    h = org["h"]
    assert client.post("/api/bills", headers=h, json={**_bill_payload(org), "vendorId": org["customer"]["id"]}).status_code == 400
    assert client.post("/api/bills", headers=h, json={**_bill_payload(org), "lines": []}).status_code == 422
    wrong_vendor_payment = client.post("/api/vendor-payments", headers=h, json={"vendorId": org["customer"]["id"], "bankAccountId": org["bank"]["id"], "date": "2026-09-05", "amount": 10})
    assert wrong_vendor_payment.status_code == 400


def test_unpaid_bill_can_be_deleted_and_reverses_the_ledger(client, org):
    """Deleting a posted-but-unpaid bill unposts it first, so the books stay balanced.

    Previously only draft/void bills could be deleted at all, which left the
    bulk-select delete on the Bills page with nothing it was allowed to remove.
    """
    h = org["h"]
    bill = client.post("/api/bills", headers=h, json=_bill_payload(org, qty=1, rate=1000)).json()
    assert bill["status"] == "open"

    removed = client.delete(f"/api/bills/{bill['id']}", headers=h)
    assert removed.status_code == 200, removed.text
    assert client.get(f"/api/bills/{bill['id']}", headers=h).status_code == 404
    assert trial_balance_ok(client, h)

    # A bill with payments against it is still refused - those must go first.
    paid = client.post("/api/bills", headers=h, json=_bill_payload(org, qty=1, rate=2000)).json()
    payment = client.post(
        "/api/vendor-payments",
        headers=h,
        json={"vendorId": org["vendor"]["id"], "billId": paid["id"], "bankAccountId": org["bank"]["id"],
              "date": "2026-09-05", "amount": 500, "method": "bank_transfer"},
    )
    assert payment.status_code == 201, payment.text
    refused = client.delete(f"/api/bills/{paid['id']}", headers=h)
    assert refused.status_code == 400
    assert "payments" in refused.json()["detail"].lower()
    assert trial_balance_ok(client, h)


def test_expense_lifecycle(client, org):
    h = org["h"]
    rent = org["accounts"]["6300"]["id"]
    bad_account = client.post("/api/expenses", headers=h, json={"date": "2026-09-01", "accountId": org["accounts"]["1000"]["id"], "paidThroughAccountId": org["bank"]["id"], "amount": 100})
    assert bad_account.status_code == 400
    res = client.post("/api/expenses", headers=h, json={"date": "2026-09-01", "accountId": rent, "paidThroughAccountId": org["bank"]["id"], "amount": 25000, "taxRate": 18, "vendorId": org["vendor"]["id"], "reference": "Sept rent"})
    assert res.status_code == 201, res.text
    exp = res.json()
    assert exp["taxAmount"] == 4500 and exp["total"] == 29500 and exp["expenseNumber"].startswith("EXP-")
    txs = client.get("/api/banking/transactions", headers=h, params={"bank_account_id": org["bank"]["id"], "search": "rent"}).json()["items"]
    assert any(t["type"] == "withdrawal" and t["amount"] == 29500 for t in txs)
    upd = client.put(f"/api/expenses/{exp['id']}", headers=h, json={"date": "2026-09-01", "accountId": rent, "paidThroughAccountId": org["bank"]["id"], "amount": 20000, "taxRate": 0})
    assert upd.status_code == 200 and upd.json()["total"] == 20000
    report = client.get("/api/reports/expenses-by-category", headers=h, params={"start_date": "2026-09-01", "end_date": "2026-09-30"}).json()
    assert any(r["accountName"] == "Rent Expense" for r in report["rows"])
    assert client.delete(f"/api/expenses/{exp['id']}", headers=h).status_code == 200
    assert trial_balance_ok(client, h)
