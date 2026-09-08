from tests.conftest import trial_balance_ok


def _invoice_payload(org, qty=2, status="sent", **extra):
    payload = {
        "customerId": org["customer"]["id"],
        "date": "2026-09-01",
        "status": status,
        "lines": [{"itemId": org["item"]["id"], "description": "Monitor", "quantity": qty, "rate": 10000, "taxRate": 18}],
    }
    payload.update(extra)
    return payload


def test_invoice_totals_due_date_numbering_and_posting(client, org):
    h = org["h"]
    stock_before = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    res = client.post("/api/invoices", headers=h, json=_invoice_payload(org, qty=2, discountAmount=1000))
    assert res.status_code == 201, res.text
    inv = res.json()
    assert inv["invoiceNumber"].startswith("INV-")
    assert inv["subtotal"] == 20000 and inv["taxTotal"] == 3600 and inv["discountAmount"] == 1000 and inv["total"] == 22600
    assert inv["dueDate"] == "2026-09-16"  # customer terms 15 days
    assert inv["status"] in ("sent", "overdue")
    assert inv["balanceDue"] == 22600
    stock_after = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    assert stock_after == stock_before - 2
    journals = client.get("/api/accounting/journals", headers=h, params={"source_type": "invoice"}).json()["items"]
    entry = next(j for j in journals if j["sourceId"] == inv["id"])
    debit_ar = sum(line["debit"] for line in entry["lines"] if line["accountCode"] == "1100")
    assert debit_ar == 22600
    assert trial_balance_ok(client, h)


def test_draft_invoice_does_not_post_or_move_stock(client, org):
    h = org["h"]
    stock_before = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    inv = client.post("/api/invoices", headers=h, json=_invoice_payload(org, status="draft")).json()
    assert inv["status"] == "draft"
    assert client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"] == stock_before
    # editing a draft is allowed
    upd = client.put(f"/api/invoices/{inv['id']}", headers=h, json=_invoice_payload(org, qty=1, status="draft"))
    assert upd.status_code == 200 and upd.json()["total"] == 11800
    # mark sent -> posts and moves stock
    sent = client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "sent"})
    assert sent.status_code == 200 and sent.json()["status"] in ("sent", "overdue")
    assert client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"] == stock_before - 1
    # revert to draft restores stock
    back = client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "draft"})
    assert back.status_code == 200
    assert client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"] == stock_before
    assert client.delete(f"/api/invoices/{inv['id']}", headers=h).status_code == 200
    assert trial_balance_ok(client, h)


def test_payments_partial_full_and_delete(client, org):
    h = org["h"]
    inv = client.post("/api/invoices", headers=h, json=_invoice_payload(org, qty=1)).json()  # total 11800
    too_much = client.post("/api/customer-payments", headers=h, json={"customerId": org["customer"]["id"], "invoiceId": inv["id"], "bankAccountId": org["bank"]["id"], "date": "2026-09-02", "amount": 20000})
    assert too_much.status_code == 400
    p1 = client.post("/api/customer-payments", headers=h, json={"customerId": org["customer"]["id"], "invoiceId": inv["id"], "bankAccountId": org["bank"]["id"], "date": "2026-09-02", "amount": 5000, "mode": "upi"})
    assert p1.status_code == 201, p1.text
    state = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert state["status"] == "partially_paid" and state["balanceDue"] == 6800
    p2 = client.post("/api/customer-payments", headers=h, json={"customerId": org["customer"]["id"], "invoiceId": inv["id"], "bankAccountId": org["bank"]["id"], "date": "2026-09-03", "amount": 6800})
    assert p2.status_code == 201
    state = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert state["status"] == "paid" and state["balanceDue"] == 0
    # paid invoices cannot be edited or voided
    assert client.put(f"/api/invoices/{inv['id']}", headers=h, json=_invoice_payload(org)).status_code == 400
    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 400
    # bank transactions were recorded
    txs = client.get("/api/banking/transactions", headers=h, params={"bank_account_id": org["bank"]["id"]}).json()["items"]
    assert any(t["sourceType"] == "customer_payment" and t["amount"] == 6800 for t in txs)
    # delete a payment reverses everything
    assert client.delete(f"/api/customer-payments/{p2.json()['id']}", headers=h).status_code == 200
    state = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert state["status"] in ("partially_paid", "overdue") and state["balanceDue"] == 6800
    assert trial_balance_ok(client, h)


def test_void_invoice_restores_stock(client, org):
    h = org["h"]
    stock_before = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    inv = client.post("/api/invoices", headers=h, json=_invoice_payload(org, qty=3)).json()
    assert client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"] == stock_before - 3
    res = client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"})
    assert res.status_code == 200 and res.json()["status"] == "void"
    assert client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"] == stock_before
    assert trial_balance_ok(client, h)


def test_invoice_validation_rules(client, org):
    h = org["h"]
    assert client.post("/api/invoices", headers=h, json={**_invoice_payload(org), "lines": []}).status_code == 422
    assert client.post("/api/invoices", headers=h, json={**_invoice_payload(org), "dueDate": "2026-08-01"}).status_code == 422
    assert client.post("/api/invoices", headers=h, json={**_invoice_payload(org), "customerId": org["vendor"]["id"]}).status_code == 400
    assert client.post("/api/invoices", headers=h, json={**_invoice_payload(org), "discountAmount": 999999}).status_code == 400
    insufficient = client.post("/api/invoices", headers=h, json=_invoice_payload(org, qty=10000))
    assert insufficient.status_code == 400 and "Insufficient stock" in insufficient.json()["detail"]


def test_invoice_list_filters_and_stats(client, org):
    h = org["h"]
    listing = client.get("/api/invoices", headers=h, params={"status": "unpaid"}).json()
    assert all(i["status"] in ("sent", "partially_paid", "overdue") for i in listing["items"])
    stats = client.get("/api/invoices/stats", headers=h).json()
    assert stats["totalOutstanding"] >= 0 and stats["unpaidCount"] == listing["total"]
    search = client.get("/api/invoices", headers=h, params={"search": "acme"}).json()
    assert search["total"] >= 1


def test_unapplied_customer_advance(client, org):
    h = org["h"]
    res = client.post("/api/customer-payments", headers=h, json={"customerId": org["customer"]["id"], "bankAccountId": org["bank"]["id"], "date": "2026-09-02", "amount": 1500})
    assert res.status_code == 201 and res.json()["invoiceId"] is None
    assert trial_balance_ok(client, h)
