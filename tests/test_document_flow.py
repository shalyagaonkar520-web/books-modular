"""Quotes, sales orders, purchase orders, credit notes, vendor credits, refunds,
advances, recurring profiles, the books lock date and the cash-flow statement."""

from datetime import date, timedelta

import pytest

from backend.services.recurring import next_after, occurrence
from tests.conftest import auth, invite_and_accept, register_org, trial_balance_ok

TODAY = date.today()
D = (TODAY - timedelta(days=10)).isoformat()  # recent: invoices on 15-day terms are not yet overdue


@pytest.fixture
def books(client):
    """A fresh organization per test: stock and balances are asserted exactly."""
    ctx = register_org(client, "Flow")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Current Account", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2026-01-01", "isPrimary": True},
    ).json()
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Globex", "paymentTermsDays": 15}).json()
    other = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Initech"}).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Supplies Co", "paymentTermsDays": 30}).json()
    item = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "Router",
            "sku": "RTR-1",
            "type": "goods",
            "sellingPrice": 5000,
            "costPrice": 3000,
            "taxRate": 18,
            "trackInventory": True,
            "openingStock": 10,
            "openingStockRate": 3000,
        },
    ).json()
    return {"h": h, "bank": bank, "customer": customer, "other": other, "vendor": vendor, "item": item, "ctx": ctx}


def _lines(b, qty=1, rate=5000):
    return [{"itemId": b["item"]["id"], "description": "Router", "quantity": qty, "rate": rate, "taxRate": 18}]


def _balance(client, h, code):
    return next(a for a in client.get("/api/accounting/accounts", headers=h).json() if a["code"] == code)["balance"]


def _stock(client, b):
    return client.get(f"/api/items/{b['item']['id']}", headers=b["h"]).json()["stockOnHand"]


def _invoice(client, b, qty=1, rate=5000, status="sent", day=D):
    res = client.post(
        "/api/invoices",
        headers=b["h"],
        json={"customerId": b["customer"]["id"], "date": day, "status": status, "lines": _lines(b, qty, rate)},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _bill(client, b, qty=1, rate=3000, status="open"):
    res = client.post(
        "/api/bills", headers=b["h"], json={"vendorId": b["vendor"]["id"], "date": D, "status": status, "lines": _lines(b, qty, rate)}
    )
    assert res.status_code == 201, res.text
    return res.json()


# --------------------------------------------------------------------------- #
# Quotes and sales orders
# --------------------------------------------------------------------------- #
def test_quote_lifecycle_and_conversion_to_invoice(client, books):
    b, h = books, books["h"]
    res = client.post(
        "/api/estimates",
        headers=h,
        json={"customerId": b["customer"]["id"], "date": D, "expiryDate": TODAY.isoformat(), "discountAmount": 500, "lines": _lines(b, 2)},
    )
    assert res.status_code == 201, res.text
    quote = res.json()
    assert quote["number"].startswith("QT-") and quote["status"] == "draft"
    assert quote["subtotal"] == 10000 and quote["taxTotal"] == pytest.approx(1710) and quote["total"] == pytest.approx(11210)
    # A quote posts nothing and moves no stock.
    assert _stock(client, b) == 10
    assert _balance(client, h, "1100") == 0

    assert client.post(f"/api/estimates/{quote['id']}/status", headers=h, json={"status": "sent"}).json()["status"] == "sent"
    assert client.post(f"/api/estimates/{quote['id']}/status", headers=h, json={"status": "accepted"}).json()["status"] == "accepted"
    # An accepted quote is the customer's answer: no longer editable.
    payload = {"customerId": b["customer"]["id"], "date": D, "lines": _lines(b)}
    assert client.put(f"/api/estimates/{quote['id']}", headers=h, json=payload).status_code == 400

    conv = client.post(f"/api/estimates/{quote['id']}/convert-to-invoice", headers=h, json={"issue": True})
    assert conv.status_code == 200, conv.text
    inv = client.get(f"/api/invoices/{conv.json()['id']}", headers=h).json()
    assert inv["status"] == "sent" and inv["total"] == pytest.approx(11210) and inv["reference"] == quote["number"]
    assert _stock(client, b) == 8
    after = client.get(f"/api/estimates/{quote['id']}", headers=h).json()
    assert after["status"] == "invoiced" and after["invoiceNumber"] == inv["invoiceNumber"]
    # Converted once only; and the quote cannot be deleted while it has an invoice.
    assert client.post(f"/api/estimates/{quote['id']}/convert-to-invoice", headers=h, json={}).status_code == 400
    assert client.delete(f"/api/estimates/{quote['id']}", headers=h).status_code == 400

    # Voiding the invoice frees the quote to be invoiced again.
    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 200
    freed = client.get(f"/api/estimates/{quote['id']}", headers=h).json()
    assert freed["status"] == "accepted" and freed["invoiceId"] is None
    assert trial_balance_ok(client, h)


def test_quote_expiry_and_declined_rules(client, books):
    b, h = books, books["h"]
    old = (TODAY - timedelta(days=10)).isoformat()
    quote = client.post(
        "/api/estimates",
        headers=h,
        json={"customerId": b["customer"]["id"], "date": D, "expiryDate": old, "status": "sent", "lines": _lines(b)},
    ).json()
    assert quote["status"] == "expired"
    listed = client.get("/api/estimates", headers=h, params={"status": "expired"}).json()
    assert [q["id"] for q in listed["items"]] == [quote["id"]]
    declined = client.post(f"/api/estimates/{quote['id']}/status", headers=h, json={"status": "declined"}).json()
    assert declined["status"] == "declined"
    assert client.post(f"/api/estimates/{quote['id']}/convert-to-invoice", headers=h, json={}).status_code == 400
    bad = client.post(
        "/api/estimates", headers=h, json={"customerId": b["customer"]["id"], "date": D, "expiryDate": "2020-01-01", "lines": _lines(b)}
    )
    assert bad.status_code == 422
    vendor_quote = client.post("/api/estimates", headers=h, json={"customerId": b["vendor"]["id"], "date": D, "lines": _lines(b)})
    assert vendor_quote.status_code == 400


def test_quote_to_sales_order_to_invoice(client, books):
    b, h = books, books["h"]
    quote = client.post("/api/estimates", headers=h, json={"customerId": b["customer"]["id"], "date": D, "lines": _lines(b, 3)}).json()
    so_ref = client.post(f"/api/estimates/{quote['id']}/convert-to-sales-order", headers=h)
    assert so_ref.status_code == 200, so_ref.text
    so = client.get(f"/api/sales-orders/{so_ref.json()['id']}", headers=h).json()
    assert so["number"].startswith("SO-") and so["status"] == "confirmed" and so["estimateNumber"] == quote["number"]
    assert client.get(f"/api/estimates/{quote['id']}", headers=h).json()["salesOrderNumber"] == so["number"]

    inv_ref = client.post(f"/api/sales-orders/{so['id']}/convert-to-invoice", headers=h, json={"issue": False}).json()
    inv = client.get(f"/api/invoices/{inv_ref['id']}", headers=h).json()
    assert inv["status"] == "draft" and inv["orderNumber"] == so["number"] and len(inv["lines"]) == 1
    assert client.get(f"/api/sales-orders/{so['id']}", headers=h).json()["status"] == "invoiced"
    # Deleting the draft invoice re-opens the order.
    assert client.delete(f"/api/invoices/{inv['id']}", headers=h).status_code == 200
    assert client.get(f"/api/sales-orders/{so['id']}", headers=h).json()["status"] == "confirmed"
    assert client.post(f"/api/sales-orders/{so['id']}/status", headers=h, json={"status": "void"}).json()["status"] == "void"
    assert client.post(f"/api/sales-orders/{so['id']}/convert-to-invoice", headers=h, json={}).status_code == 400


def test_document_pdf_and_listing(client, books):
    b, h = books, books["h"]
    so = client.post(
        "/api/sales-orders",
        headers=h,
        json={"customerId": b["customer"]["id"], "date": D, "subject": "R&D <kit>", "notes": "Ship <fast>", "lines": _lines(b)},
    ).json()
    pdf = client.get(f"/api/sales-orders/{so['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    found = client.get("/api/sales-orders", headers=h, params={"search": "glob"}).json()
    assert found["total"] == 1 and found["items"][0]["contactName"] == "Globex"
    assert client.get("/api/sales-orders", headers=h, params={"search": "nobody"}).json()["total"] == 0


# --------------------------------------------------------------------------- #
# Purchase orders
# --------------------------------------------------------------------------- #
def test_purchase_order_to_bill(client, books):
    b, h = books, books["h"]
    po = client.post(
        "/api/purchase-orders",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "date": D, "deliveryDate": TODAY.isoformat(), "status": "issued", "lines": _lines(b, 5, 3000)},
    ).json()
    assert po["number"].startswith("PO-") and po["status"] == "issued"
    assert _stock(client, b) == 10  # ordering moves no stock
    conv = client.post(f"/api/purchase-orders/{po['id']}/convert-to-bill", headers=h, json={"issue": True})
    assert conv.status_code == 200, conv.text
    bill = client.get(f"/api/bills/{conv.json()['id']}", headers=h).json()
    assert bill["status"] == "open" and bill["orderNumber"] == po["number"] and bill["total"] == pytest.approx(17700)
    assert _stock(client, b) == 15
    assert client.get(f"/api/purchase-orders/{po['id']}", headers=h).json()["status"] == "billed"
    assert (
        client.put(
            f"/api/purchase-orders/{po['id']}", headers=h, json={"vendorId": b["vendor"]["id"], "date": D, "lines": _lines(b)}
        ).status_code
        == 400
    )
    assert client.post(f"/api/bills/{bill['id']}/status", headers=h, json={"status": "void"}).status_code == 200
    assert client.get(f"/api/purchase-orders/{po['id']}", headers=h).json()["status"] == "issued"
    customer_po = client.post("/api/purchase-orders", headers=h, json={"vendorId": b["customer"]["id"], "date": D, "lines": _lines(b)})
    assert customer_po.status_code == 400
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# Credit notes
# --------------------------------------------------------------------------- #
def test_credit_note_posts_returns_stock_applies_and_refunds(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, qty=2)  # 10,000 + 1,800 GST
    assert _balance(client, h, "1100") == pytest.approx(11800)
    assert _stock(client, b) == 8

    res = client.post(
        "/api/credit-notes",
        headers=h,
        json={"customerId": b["customer"]["id"], "invoiceId": inv["id"], "date": D, "reason": "Damaged", "lines": _lines(b, 1)},
    )
    assert res.status_code == 201, res.text
    cn = res.json()
    assert cn["number"].startswith("CN-") and cn["status"] == "open" and cn["total"] == pytest.approx(5900)
    assert cn["balance"] == pytest.approx(5900) and cn["invoiceNumber"] == inv["invoiceNumber"]
    # Receivables and output GST come down; the returned unit is back in stock at cost.
    assert _balance(client, h, "1100") == pytest.approx(5900)
    assert _balance(client, h, "2100") == pytest.approx(900)
    assert _stock(client, b) == 9
    assert trial_balance_ok(client, h)

    applied = client.post(
        f"/api/credit-notes/{cn['id']}/apply", headers=h, json={"applications": [{"documentId": inv["id"], "amount": 4000}]}
    )
    assert applied.status_code == 200, applied.text
    body = applied.json()
    assert body["amountApplied"] == 4000 and body["balance"] == pytest.approx(1900) and len(body["applications"]) == 1
    invoice = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert invoice["status"] == "partially_paid" and invoice["balanceDue"] == pytest.approx(7800)
    # Applying moves no money: receivables are unchanged by it.
    assert _balance(client, h, "1100") == pytest.approx(5900)
    # More than is left is refused, as is a used credit note being voided or edited.
    over = client.post(f"/api/credit-notes/{cn['id']}/apply", headers=h, json={"applications": [{"documentId": inv["id"], "amount": 2000}]})
    assert over.status_code == 400
    assert client.post(f"/api/credit-notes/{cn['id']}/status", headers=h, json={"status": "void"}).status_code == 400
    assert client.delete(f"/api/credit-notes/{cn['id']}", headers=h).status_code == 400
    # The invoice cannot be voided while a credit sits on it.
    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 400
    apps = client.get("/api/credit-applications", headers=h, params={"invoiceId": inv["id"]}).json()
    assert [a["creditNumber"] for a in apps] == [cn["number"]]

    bank_before = _balance(client, h, "1010")
    refund = client.post(
        f"/api/credit-notes/{cn['id']}/refunds",
        headers=h,
        json={"bankAccountId": b["bank"]["id"], "date": D, "amount": 1900, "mode": "upi"},
    )
    assert refund.status_code == 201, refund.text
    assert refund.json()["source"] == "credit_note" and refund.json()["refundNumber"].startswith("RFD-")
    closed = client.get(f"/api/credit-notes/{cn['id']}", headers=h).json()
    assert closed["status"] == "closed" and closed["balance"] == 0 and len(closed["refunds"]) == 1
    assert _balance(client, h, "1010") == pytest.approx(bank_before - 1900)
    assert _balance(client, h, "1100") == pytest.approx(7800)
    assert trial_balance_ok(client, h)

    # Undo everything, then void: the books return to the invoice alone.
    assert client.delete(f"/api/refunds/{refund.json()['id']}", headers=h).status_code == 200
    assert client.delete(f"/api/credit-applications/{apps[0]['id']}", headers=h).status_code == 200
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] == "sent"
    voided = client.post(f"/api/credit-notes/{cn['id']}/status", headers=h, json={"status": "void"})
    assert voided.status_code == 200 and voided.json()["status"] == "void"
    assert _balance(client, h, "1100") == pytest.approx(11800)
    assert _stock(client, b) == 8
    assert trial_balance_ok(client, h)


def test_credit_note_rules(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, qty=1)
    other_cust = {"customerId": b["other"]["id"], "invoiceId": inv["id"], "date": D, "lines": _lines(b)}
    assert client.post("/api/credit-notes", headers=h, json=other_cust).status_code == 400
    too_big = {"customerId": b["customer"]["id"], "invoiceId": inv["id"], "date": D, "lines": _lines(b, 3)}
    assert client.post("/api/credit-notes", headers=h, json=too_big).status_code == 400
    draft = client.post(
        "/api/credit-notes", headers=h, json={"customerId": b["customer"]["id"], "date": D, "status": "draft", "lines": _lines(b)}
    ).json()
    assert draft["status"] == "draft" and _balance(client, h, "1100") == pytest.approx(5900)
    # A draft cannot be applied; opening it posts it.
    assert (
        client.post(
            f"/api/credit-notes/{draft['id']}/apply", headers=h, json={"applications": [{"documentId": inv["id"], "amount": 1}]}
        ).status_code
        == 400
    )
    assert client.post(f"/api/credit-notes/{draft['id']}/status", headers=h, json={"status": "open"}).json()["status"] == "open"
    assert _balance(client, h, "1100") == 0
    # Another customer's invoice cannot take this credit.
    other_inv = client.post(
        "/api/invoices", headers=h, json={"customerId": b["other"]["id"], "date": D, "status": "sent", "lines": _lines(b)}
    ).json()
    res = client.post(
        f"/api/credit-notes/{draft['id']}/apply", headers=h, json={"applications": [{"documentId": other_inv["id"], "amount": 10}]}
    )
    assert res.status_code == 400
    # Editing an unused open credit note re-posts it.
    edited = client.put(
        f"/api/credit-notes/{draft['id']}", headers=h, json={"customerId": b["customer"]["id"], "date": D, "lines": _lines(b, 1, 1000)}
    )
    assert edited.status_code == 200 and edited.json()["total"] == pytest.approx(1180) and edited.json()["status"] == "open"
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# Vendor credits
# --------------------------------------------------------------------------- #
def test_vendor_credit_applies_to_bill_and_takes_refund(client, books):
    b, h = books, books["h"]
    bill = _bill(client, b, qty=4)  # 12,000 + 2,160 GST
    assert _stock(client, b) == 14
    assert _balance(client, h, "2000") == pytest.approx(14160)
    vc = client.post(
        "/api/vendor-credits",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "billId": bill["id"], "date": D, "lines": _lines(b, 1, 3000)},
    )
    assert vc.status_code == 201, vc.text
    vc = vc.json()
    assert vc["number"].startswith("VC-") and vc["total"] == pytest.approx(3540)
    assert _stock(client, b) == 13
    assert _balance(client, h, "2000") == pytest.approx(10620)
    assert _balance(client, h, "1300") == pytest.approx(2160 - 540)

    applied = client.post(
        f"/api/vendor-credits/{vc['id']}/apply", headers=h, json={"applications": [{"documentId": bill["id"], "amount": 3000}]}
    )
    assert applied.status_code == 200, applied.text
    assert client.get(f"/api/bills/{bill['id']}", headers=h).json()["balanceDue"] == pytest.approx(11160)

    bank_before = _balance(client, h, "1010")
    refund = client.post(
        f"/api/vendor-credits/{vc['id']}/refunds", headers=h, json={"bankAccountId": b["bank"]["id"], "date": D, "amount": 540}
    )
    assert refund.status_code == 201, refund.text
    assert _balance(client, h, "1010") == pytest.approx(bank_before + 540)
    assert client.get(f"/api/vendor-credits/{vc['id']}", headers=h).json()["status"] == "closed"
    refunds = client.get("/api/refunds", headers=h, params={"partyType": "vendor"}).json()
    assert refunds["total"] == 1 and refunds["items"][0]["vendorCreditNumber"] == vc["number"]
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# Advances
# --------------------------------------------------------------------------- #
def test_customer_advance_applied_to_invoice_and_refunded(client, books):
    b, h = books, books["h"]
    # Nothing is owed yet, so the whole receipt is held as an advance.
    pay = client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["customer"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 8000},
    )
    assert pay.status_code == 201, pay.text
    params = {"partyType": "customer", "contactId": b["customer"]["id"]}
    assert client.get("/api/advances/balance", headers=h, params=params).json()["balance"] == 8000

    inv = _invoice(client, b, qty=1)
    app = client.post(
        "/api/advances/apply",
        headers=h,
        json={"partyType": "customer", "contactId": b["customer"]["id"], "documentId": inv["id"], "amount": 5900},
    )
    assert app.status_code == 201, app.text
    assert app.json()["creditNumber"] == "Advance" and app.json()["creditId"] is None
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] == "paid"
    assert client.get("/api/advances/balance", headers=h, params=params).json()["balance"] == 2100
    assert _balance(client, h, "1100") == 0

    too_much = client.post(
        "/api/advances/refund",
        headers=h,
        json={"partyType": "customer", "contactId": b["customer"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 3000},
    )
    assert too_much.status_code == 400
    ok = client.post(
        "/api/advances/refund",
        headers=h,
        json={"partyType": "customer", "contactId": b["customer"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 2100},
    )
    assert ok.status_code == 201 and ok.json()["source"] == "advance"
    assert client.get("/api/advances/balance", headers=h, params=params).json()["balance"] == 0

    # Removing the advance application puts the invoice back to unpaid and the advance back.
    assert client.delete(f"/api/credit-applications/{app.json()['id']}", headers=h).status_code == 200
    assert client.get(f"/api/invoices/{inv['id']}", headers=h).json()["status"] == "sent"
    assert client.get("/api/advances/balance", headers=h, params=params).json()["balance"] == 5900
    assert trial_balance_ok(client, h)


def test_vendor_advance_applied_to_bill(client, books):
    b, h = books, books["h"]
    client.post(
        "/api/vendor-payments", headers=h, json={"vendorId": b["vendor"]["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 1000}
    )
    bill = _bill(client, b, qty=1)
    params = {"partyType": "vendor", "contactId": b["vendor"]["id"]}
    # Paid before any bill existed, so it is all held as an advance.
    available = client.get("/api/advances/balance", headers=h, params=params).json()["balance"]
    assert available == 1000
    res = client.post(
        "/api/advances/apply",
        headers=h,
        json={"partyType": "vendor", "contactId": b["vendor"]["id"], "documentId": bill["id"], "amount": available},
    )
    assert res.status_code == 201, res.text
    assert client.get(f"/api/bills/{bill['id']}", headers=h).json()["balanceDue"] == pytest.approx(3540 - available)
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# Books lock
# --------------------------------------------------------------------------- #
def test_lock_date_blocks_changes_in_closed_period(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, qty=1, day=(TODAY - timedelta(days=30)).isoformat())
    lock = (TODAY - timedelta(days=20)).isoformat()
    assert client.put("/api/organization/lock-date", headers=h, json={"lockDate": TODAY.isoformat()}).status_code == 400
    res = client.put("/api/organization/lock-date", headers=h, json={"lockDate": lock})
    assert res.status_code == 200 and res.json()["lockDate"] == lock
    assert client.get("/api/organization", headers=h).json()["lockDate"] == lock

    # Posting into, voiding in, or deleting from the closed period is refused.
    blocked = client.post(
        "/api/invoices",
        headers=h,
        json={"customerId": b["customer"]["id"], "date": (TODAY - timedelta(days=25)).isoformat(), "status": "sent", "lines": _lines(b)},
    )
    assert blocked.status_code == 400 and "locked" in blocked.json()["detail"]
    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 400
    assert client.delete(f"/api/invoices/{inv['id']}", headers=h).status_code == 400
    pay = client.post(
        "/api/customer-payments",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "invoiceId": inv["id"],
            "bankAccountId": b["bank"]["id"],
            "date": (TODAY - timedelta(days=21)).isoformat(),
            "amount": 100,
        },
    )
    assert pay.status_code == 400
    # Drafts are not in the books, and after the lock date life goes on.
    draft = client.post(
        "/api/invoices",
        headers=h,
        json={"customerId": b["customer"]["id"], "date": (TODAY - timedelta(days=25)).isoformat(), "status": "draft", "lines": _lines(b)},
    )
    assert draft.status_code == 201
    assert _invoice(client, b, qty=1, day=TODAY.isoformat())["status"] == "sent"
    # Only an admin moves the lock.
    invite_and_accept(client, h, "Sam Staff", "sam.staff@flow.example.com", "staff", "Staff1Pass!")
    staff = client.post("/api/auth/login", json={"email": "sam.staff@flow.example.com", "password": "Staff1Pass!"}).json()
    assert client.put("/api/organization/lock-date", headers=auth(staff["accessToken"]), json={"lockDate": None}).status_code == 403
    # Unlocking reopens the period.
    assert client.put("/api/organization/lock-date", headers=h, json={"lockDate": None}).json()["lockDate"] is None
    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 200


# --------------------------------------------------------------------------- #
# Recurring profiles
# --------------------------------------------------------------------------- #
def test_schedule_math():
    start = date(2026, 1, 31)
    assert [occurrence(start, "monthly", 1, i) for i in range(4)] == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
    ]
    assert next_after(start, "monthly", 1, date(2026, 2, 28)) == date(2026, 3, 31)
    assert next_after(start, "quarterly", 1, date(2026, 1, 31)) == date(2026, 4, 30)
    assert next_after(date(2026, 1, 1), "weekly", 2, date(2026, 1, 1)) == date(2026, 1, 15)
    assert next_after(date(2026, 1, 1), "yearly", 1, date(2026, 6, 1)) == date(2027, 1, 1)
    assert next_after(date(2026, 5, 1), "monthly", 1, date(2026, 1, 1)) == date(2026, 5, 1)


def _profile(b, **extra):
    template = {
        "customerId": b["customer"]["id"],
        "lines": [{"itemId": b["item"]["id"], "description": "Router rental", "quantity": 1, "rate": 1000, "taxRate": 18}],
    }
    body = {
        "name": "Monthly rental",
        "kind": "invoice",
        "frequency": "weekly",
        "startDate": (TODAY - timedelta(days=15)).isoformat(),
        "template": template,
    }
    body.update(extra)
    return body


def test_recurring_invoices_catch_up_and_schedule(client, books):
    b, h = books, books["h"]
    res = client.post("/api/recurring-profiles", headers=h, json=_profile(b, autoIssue=True))
    assert res.status_code == 201, res.text
    profile = res.json()
    assert profile["total"] == pytest.approx(1180) and profile["status"] == "active"
    assert profile["nextRunDate"] == (TODAY - timedelta(days=15)).isoformat()

    run = client.post("/api/recurring-profiles/run-due", headers=h).json()
    # Weekly from 15 days ago: today-15, today-8, today-1.
    assert [d["date"] for d in run["created"]] == [(TODAY - timedelta(days=n)).isoformat() for n in (15, 8, 1)]
    assert all(d["status"] == "sent" for d in run["created"]) and run["errors"] == []
    after = client.get(f"/api/recurring-profiles/{profile['id']}", headers=h).json()
    assert after["runsCount"] == 3 and after["nextRunDate"] == (TODAY + timedelta(days=6)).isoformat()
    # Nothing more is due, so a second run creates nothing.
    assert client.post("/api/recurring-profiles/run-due", headers=h).json()["created"] == []
    docs = client.get(f"/api/recurring-profiles/{profile['id']}/documents", headers=h).json()
    assert len(docs) == 3
    assert _stock(client, b) == 7

    now = client.post(f"/api/recurring-profiles/{profile['id']}/run-now", headers=h).json()
    assert now["date"] == TODAY.isoformat()
    assert client.post(f"/api/recurring-profiles/{profile['id']}/pause", headers=h).json()["status"] == "paused"
    assert client.post(f"/api/recurring-profiles/{profile['id']}/pause", headers=h).status_code == 400
    resumed = client.post(f"/api/recurring-profiles/{profile['id']}/resume", headers=h).json()
    assert resumed["status"] == "active" and resumed["nextRunDate"] >= TODAY.isoformat()

    # Deleting the profile keeps the invoices it made.
    assert client.delete(f"/api/recurring-profiles/{profile['id']}", headers=h).status_code == 200
    assert client.get(f"/api/invoices/{docs[0]['id']}", headers=h).status_code == 200
    assert trial_balance_ok(client, h)


def test_recurring_bill_draft_end_date_and_validation(client, books):
    b, h = books, books["h"]
    template = {
        "vendorId": b["vendor"]["id"],
        "lines": [{"itemId": b["item"]["id"], "description": "Stock", "quantity": 1, "rate": 2000, "taxRate": 18}],
    }
    start = TODAY - timedelta(days=60)
    body = {
        "name": "Restock",
        "kind": "bill",
        "frequency": "monthly",
        "startDate": start.isoformat(),
        "endDate": (start + timedelta(days=35)).isoformat(),
        "template": template,
    }
    profile = client.post("/api/recurring-profiles", headers=h, json=body).json()
    run = client.post(f"/api/recurring-profiles/{profile['id']}/run", headers=h).json()
    assert len(run["created"]) == 2 and all(d["status"] == "draft" for d in run["created"])
    assert client.get(f"/api/recurring-profiles/{profile['id']}", headers=h).json()["status"] == "completed"

    wrong_contact = {**body, "template": {**template, "vendorId": b["customer"]["id"]}}
    assert client.post("/api/recurring-profiles", headers=h, json=wrong_contact).status_code == 400
    no_lines = {**body, "template": {"vendorId": b["vendor"]["id"], "lines": []}}
    assert client.post("/api/recurring-profiles", headers=h, json=no_lines).status_code == 400
    assert client.put(f"/api/recurring-profiles/{profile['id']}", headers=h, json={**body, "kind": "invoice"}).status_code == 400


def test_recurring_run_failure_is_recorded(client, books):
    b, h = books, books["h"]
    profile = client.post("/api/recurring-profiles", headers=h, json=_profile(b, autoIssue=True, frequency="monthly")).json()
    client.put("/api/organization/lock-date", headers=h, json={"lockDate": (TODAY - timedelta(days=1)).isoformat()})
    run = client.post(f"/api/recurring-profiles/{profile['id']}/run", headers=h).json()
    assert run["created"] == [] and "locked" in run["errors"][0]
    after = client.get(f"/api/recurring-profiles/{profile['id']}", headers=h).json()
    assert "locked" in after["lastError"] and after["runsCount"] == 0


# --------------------------------------------------------------------------- #
# Cash flow
# --------------------------------------------------------------------------- #
def test_cash_flow_statement_reconciles(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, qty=2)
    client.post(
        "/api/customer-payments",
        headers=h,
        json={"customerId": b["customer"]["id"], "invoiceId": inv["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 6000},
    )
    bill = _bill(client, b, qty=2)
    client.post(
        "/api/vendor-payments",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "billId": bill["id"], "bankAccountId": b["bank"]["id"], "date": D, "amount": 7080},
    )
    report = client.get("/api/reports/cash-flow", headers=h, params={"startDate": "2026-01-01", "endDate": TODAY.isoformat()})
    assert report.status_code == 200, report.text
    cf = report.json()
    assert cf["netChange"] == pytest.approx(cf["closingCash"] - cf["openingCash"])
    assert cf["closingCash"] == pytest.approx(100000 + 6000 - 7080)
    assert cf["operating"]["lines"][0]["label"] == "Net income"
    labels = {line["label"] for line in cf["operating"]["lines"]}
    assert {"Accounts Receivable", "Inventory Asset"} <= labels
