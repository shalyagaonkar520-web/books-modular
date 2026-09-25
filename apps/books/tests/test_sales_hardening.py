"""Regression tests for stock, item/contact edits and invoice edge cases that
used to end in a 500, an oversold item or a ledger that disagreed with stock."""

from __future__ import annotations

import threading
import uuid
from datetime import date
from unittest.mock import patch

from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today().isoformat()


def _fresh_org(client):
    ctx = register_org(client, "Harden")
    h = auth(ctx["token"])
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Hardening Customer"}).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Hardening Vendor"}).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "customer": customer, "vendor": vendor, "accounts": accounts, "org": ctx["org"], "user": ctx["user"]}


def _item(client, h, stock=10, cost=100, **extra):
    body = {
        "name": f"Widget {uuid.uuid4().hex[:6]}",
        "sku": f"W-{uuid.uuid4().hex[:8]}",
        "sellingPrice": 200,
        "costPrice": cost,
        "trackInventory": True,
        "openingStock": stock,
        "openingStockRate": cost,
        **extra,
    }
    res = client.post("/api/items", headers=h, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def _invoice(client, h, customer_id, item_id, quantity=1, status="sent", **extra):
    return client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer_id,
            "date": TODAY,
            "status": status,
            "lines": [{"itemId": item_id, "description": "Widget", "quantity": quantity, "rate": 200, "taxRate": 0}],
            **extra,
        },
    )


def _stock(client, h, item_id):
    return client.get(f"/api/items/{item_id}", headers=h).json()["stockOnHand"]


def _inventory_balance(client, ctx):
    ledger = client.get(f"/api/accounting/ledger/{ctx['accounts']['1200']['id']}", headers=ctx["h"]).json()
    return round(sum(line["debit"] - line["credit"] for line in ledger["lines"]), 2)


# ------------------------------------------------------------- 1. stock race


def _race(client, h, item_id, calls):
    """Fire every call at once and collect (status, body) pairs."""
    results = []
    lock = threading.Lock()
    start = threading.Barrier(len(calls))

    def run(call):
        start.wait()
        res = call()
        with lock:
            results.append((res.status_code, res.text))

    threads = [threading.Thread(target=run, args=(call,)) for call in calls]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def _assert_exactly_five_sold(client, h, item_id, results):
    codes = [code for code, _ in results]
    assert codes.count(400) == 5, results
    assert len(codes) - codes.count(400) == 5 and all(code in (200, 201, 400) for code in codes), results
    assert all("Insufficient stock" in text for code, text in results if code == 400)
    assert _stock(client, h, item_id) == 0
    assert trial_balance_ok(client, h)


def test_concurrent_mark_sent_never_oversells(client):
    """The reproducer: ten drafts for one unit each, stock 5, all marked sent at
    once. The read-modify-write decrement let every one of them through and
    left stock at a figure that matched none of them."""
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=5)
    drafts = [_invoice(client, h, ctx["customer"]["id"], item["id"], status="draft").json()["id"] for _ in range(10)]
    calls = [lambda d=d: client.post(f"/api/invoices/{d}/status", headers=h, json={"status": "sent"}) for d in drafts]
    _assert_exactly_five_sold(client, h, item["id"], _race(client, h, item["id"], calls))


def test_concurrent_new_sent_invoices_never_oversell(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=5)
    calls = [lambda: _invoice(client, h, ctx["customer"]["id"], item["id"], quantity=1)] * 10
    _assert_exactly_five_sold(client, h, item["id"], _race(client, h, item["id"], calls))


def test_sequential_oversell_still_refused_with_the_stock_left(client):
    ctx = _fresh_org(client)
    item = _item(client, ctx["h"], stock=2)
    res = _invoice(client, ctx["h"], ctx["customer"]["id"], item["id"], quantity=3)
    assert res.status_code == 400
    assert "Insufficient stock" in res.json()["detail"] and "2" in res.json()["detail"]
    assert _stock(client, ctx["h"], item["id"]) == 2


# ---------------------------------------------- 2. item edits vs the ledger


def test_stock_fields_are_locked_once_the_item_has_moved(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=20, cost=100)
    assert _invoice(client, h, ctx["customer"]["id"], item["id"], quantity=15).status_code == 201
    assert _stock(client, h, item["id"]) == 5

    for change in ({"openingStock": 0}, {"openingStockRate": 150}, {"trackInventory": False}, {"type": "service"}):
        res = client.put(f"/api/items/{item['id']}", headers=h, json=change)
        assert res.status_code == 400, (change, res.text)
        assert "inventory adjustment" in res.json()["detail"]
    assert _stock(client, h, item["id"]) == 5

    # Other fields remain editable, and resending the unchanged values is fine.
    ok = client.put(f"/api/items/{item['id']}", headers=h, json={"name": "Renamed widget", "openingStock": 20, "trackInventory": True})
    assert ok.status_code == 200, ok.text
    assert ok.json()["stockOnHand"] == 5

    # A cost price change after movement must not re-post the opening entry.
    before = _inventory_balance(client, ctx)
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"costPrice": 500}).status_code == 200
    assert _inventory_balance(client, ctx) == before
    assert trial_balance_ok(client, h)


def test_cost_change_on_a_sold_out_item_creates_no_phantom_inventory(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=10, cost=100, openingStockRate=0)
    assert _invoice(client, h, ctx["customer"]["id"], item["id"], quantity=10).status_code == 201
    assert _inventory_balance(client, ctx) == 0
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"costPrice": 200}).status_code == 200
    assert _inventory_balance(client, ctx) == 0
    assert trial_balance_ok(client, h)


def test_adjusted_item_is_locked_too(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=4)
    adj = client.post(
        "/api/inventory-adjustments", headers=h, json={"itemId": item["id"], "date": TODAY, "quantityDelta": 1, "reason": "Found"}
    )
    assert adj.status_code == 201, adj.text
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"openingStock": 10}).status_code == 400


def test_before_any_movement_stock_fields_can_still_change(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=4, cost=100)
    res = client.put(f"/api/items/{item['id']}", headers=h, json={"openingStock": 6})
    assert res.status_code == 200 and res.json()["stockOnHand"] == 6
    assert _inventory_balance(client, ctx) == 600
    off = client.put(f"/api/items/{item['id']}", headers=h, json={"trackInventory": False})
    assert off.status_code == 200 and off.json()["stockOnHand"] == 0
    assert _inventory_balance(client, ctx) == 0
    on = client.put(f"/api/items/{item['id']}", headers=h, json={"trackInventory": True})
    assert on.status_code == 200 and on.json()["stockOnHand"] == 6
    assert _inventory_balance(client, ctx) == 600
    svc = client.put(f"/api/items/{item['id']}", headers=h, json={"type": "service"})
    assert svc.status_code == 200 and svc.json()["stockOnHand"] == 0
    assert _inventory_balance(client, ctx) == 0
    assert trial_balance_ok(client, h)


def test_a_draft_invoice_is_not_a_movement(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=4)
    assert _invoice(client, h, ctx["customer"]["id"], item["id"], status="draft").status_code == 201
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"openingStock": 8}).status_code == 200


# ------------------------------------------------------- 3. explicit nulls


def test_explicit_null_on_required_item_fields_is_a_422(client):
    ctx = _fresh_org(client)
    item = _item(client, ctx["h"])
    for field in ("name", "sku", "type", "unit", "sellingPrice", "costPrice", "trackInventory", "openingStock", "isActive"):
        res = client.put(f"/api/items/{item['id']}", headers=ctx["h"], json={field: None})
        assert res.status_code == 422, (field, res.status_code, res.text)
    # Nullable fields can still be cleared.
    assert client.put(f"/api/items/{item['id']}", headers=ctx["h"], json={"description": None, "hsnSac": None}).status_code == 200


def test_explicit_null_on_required_contact_fields_is_a_422(client):
    ctx = _fresh_org(client)
    cid = ctx["customer"]["id"]
    for field in ("displayName", "contactType", "gstTreatment", "paymentTermsDays", "isActive"):
        res = client.put(f"/api/contacts/{cid}", headers=ctx["h"], json={field: None})
        assert res.status_code == 422, (field, res.status_code, res.text)
    assert client.put(f"/api/contacts/{cid}", headers=ctx["h"], json={"gstin": None, "notes": None}).status_code == 200


# --------------------------------------------------------- 4. FK on delete


def test_item_with_adjustments_is_deactivated_not_a_500(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=3)
    client.post("/api/inventory-adjustments", headers=h, json={"itemId": item["id"], "date": TODAY, "quantityDelta": -1, "reason": "Lost"})
    res = client.delete(f"/api/items/{item['id']}", headers=h)
    assert res.status_code == 200, res.text
    assert client.get(f"/api/items/{item['id']}", headers=h).json()["isActive"] is False


def test_contacts_linked_elsewhere_are_deactivated_not_a_500(client):
    from backend.db import SessionLocal
    from backend.models import ExternalPayment, PaymentRecord

    ctx = _fresh_org(client)
    h = ctx["h"]

    project_customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Project Client"}).json()
    project = client.post("/api/projects", headers=h, json={"name": "Site build", "customerId": project_customer["id"]})
    assert project.status_code == 201, project.text

    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Preferred Supplier"}).json()
    _item(client, h, preferredVendorId=vendor["id"])

    ext_customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "External Payer"}).json()
    rz_customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Gateway Payer"}).json()
    with SessionLocal() as db:
        db.add(
            ExternalPayment(
                organization_id=ctx["org"]["id"],
                external_transaction_id="EXT-1",
                amount=100,
                customer_id=ext_customer["id"],
                approval_token=uuid.uuid4().hex,
            )
        )
        db.add(
            PaymentRecord(
                organization_id=ctx["org"]["id"],
                razorpay_payment_id=f"pay_{uuid.uuid4().hex[:14]}",
                amount=100,
                customer_id=rz_customer["id"],
            )
        )
        db.commit()

    for contact in (project_customer, vendor, ext_customer):
        res = client.delete(f"/api/contacts/{contact['id']}", headers=h)
        assert res.status_code == 200, res.text
        assert "inactive" in res.json()["message"]
        assert client.get(f"/api/contacts/{contact['id']}", headers=h).json()["isActive"] is False

    # And through bulk delete.
    res = client.post("/api/contacts/bulk-delete", headers=h, json={"ids": [rz_customer["id"]]})
    assert res.status_code == 200, res.text
    assert res.json()["deactivated"] == 1 and res.json()["deleted"] == 0


# -------------------------------------------------------- 5. / 6. bounds


def test_absurd_page_number_is_a_422(client):
    ctx = _fresh_org(client)
    assert client.get("/api/items", headers=ctx["h"], params={"page": "99999999999999999999"}).status_code == 422
    assert client.get("/api/items", headers=ctx["h"], params={"page": 1_000_000}).status_code == 200


def test_absurd_adjustment_quantity_is_a_422(client):
    ctx = _fresh_org(client)
    item = _item(client, ctx["h"])
    for delta in (1e30, -1e30):
        res = client.post(
            "/api/inventory-adjustments",
            headers=ctx["h"],
            json={"itemId": item["id"], "date": TODAY, "quantityDelta": delta, "reason": "Typo"},
        )
        assert res.status_code == 422, res.text


# ------------------------------------------------------------ 7. emailing


def test_email_is_not_sent_when_posting_the_draft_fails(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=1)
    draft = _invoice(client, h, ctx["customer"]["id"], item["id"], quantity=5, status="draft").json()
    with patch("backend.routers.invoices.send_invoice_email", return_value={"success": True}) as sender:
        res = client.post(f"/api/invoices/{draft['id']}/send-gmail", headers=h, json={"to_email": "c@example.com"})
    assert res.status_code == 400 and "Insufficient stock" in res.json()["detail"]
    sender.assert_not_called()
    assert client.get(f"/api/invoices/{draft['id']}", headers=h).json()["status"] == "draft"
    assert _stock(client, h, item["id"]) == 1


def test_emailing_a_draft_posts_it_then_sends(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=3)
    draft = _invoice(client, h, ctx["customer"]["id"], item["id"], quantity=1, status="draft").json()
    with patch("backend.routers.invoices.send_invoice_email", return_value={"success": True}) as sender:
        res = client.post(f"/api/invoices/{draft['id']}/send-gmail", headers=h, json={"to_email": "c@example.com"})
    assert res.status_code == 200, res.text
    sender.assert_called_once()
    assert client.get(f"/api/invoices/{draft['id']}", headers=h).json()["status"] == "sent"
    assert _stock(client, h, item["id"]) == 2
    assert trial_balance_ok(client, h)


def test_void_invoice_cannot_be_emailed(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=3)
    inv = _invoice(client, h, ctx["customer"]["id"], item["id"]).json()
    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 200
    with patch("backend.routers.invoices.send_invoice_email", return_value={"success": True}) as sender:
        res = client.post(f"/api/invoices/{inv['id']}/send-gmail", headers=h, json={"to_email": "c@example.com"})
    assert res.status_code == 400
    sender.assert_not_called()


# ---------------------------------------------------------- 8. void & time


def test_voiding_an_invoice_releases_its_time_entries(client):
    from backend.db import SessionLocal
    from backend.models import Project, TimeEntry

    ctx = _fresh_org(client)
    h = ctx["h"]
    service = client.post("/api/items", headers=h, json={"name": "Hours", "sku": f"HR-{uuid.uuid4().hex[:6]}", "type": "service"}).json()
    inv = _invoice(client, h, ctx["customer"]["id"], service["id"]).json()
    with SessionLocal() as db:
        project = Project(organization_id=ctx["org"]["id"], name="Billed work", customer_id=ctx["customer"]["id"])
        db.add(project)
        db.flush()
        entry = TimeEntry(
            organization_id=ctx["org"]["id"],
            project_id=project.id,
            user_id=ctx["user"]["id"],
            date=date.today(),
            hours=2,
            invoice_id=inv["id"],
        )
        db.add(entry)
        db.commit()
        entry_id = entry.id

    assert client.post(f"/api/invoices/{inv['id']}/status", headers=h, json={"status": "void"}).status_code == 200
    with SessionLocal() as db:
        assert db.get(TimeEntry, entry_id).invoice_id is None


# ---------------------------------------------------------- 9. display name


def test_business_display_names_with_digits_are_accepted(client):
    ctx = _fresh_org(client)
    for name in ("3M India", "7-Eleven"):
        res = client.post("/api/contacts", headers=ctx["h"], json={"type": "customer", "displayName": name})
        assert res.status_code == 201, res.text
    assert client.post("/api/contacts", headers=ctx["h"], json={"type": "customer", "displayName": "4242"}).status_code == 422
    assert (
        client.post("/api/contacts", headers=ctx["h"], json={"type": "customer", "displayName": "Acme", "firstName": "Ravi 2"}).status_code
        == 422
    )


# ------------------------------------------------------------- 10. inactive


def test_inactive_customer_and_item_cannot_go_on_a_new_invoice(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    item = _item(client, h, stock=10)
    existing = _invoice(client, h, ctx["customer"]["id"], item["id"], status="draft").json()

    assert client.put(f"/api/contacts/{ctx['customer']['id']}", headers=h, json={"isActive": False}).status_code == 200
    res = _invoice(client, h, ctx["customer"]["id"], item["id"], status="draft")
    assert res.status_code == 400 and "inactive" in res.json()["detail"]

    assert client.put(f"/api/items/{item['id']}", headers=h, json={"isActive": False}).status_code == 200
    other = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Active Buyer"}).json()
    res = _invoice(client, h, other["id"], item["id"], status="draft")
    assert res.status_code == 400 and "inactive" in res.json()["detail"]

    # The document that already carries them can still be edited.
    edit = client.put(
        f"/api/invoices/{existing['id']}",
        headers=h,
        json={
            "customerId": ctx["customer"]["id"],
            "date": TODAY,
            "status": "draft",
            "lines": [{"itemId": item["id"], "description": "Widget", "quantity": 2, "rate": 200, "taxRate": 0}],
        },
    )
    assert edit.status_code == 200, edit.text


# ------------------------------------------------------- 11. ledger override


def test_contact_ledger_override_must_be_the_right_kind_of_account(client):
    ctx = _fresh_org(client)
    h, accounts = ctx["h"], ctx["accounts"]
    bad = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Cashy", "ledgerAccountId": accounts["1000"]["id"]}
    )
    assert bad.status_code == 400
    wrong_side = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Payably", "ledgerAccountId": accounts["2000"]["id"]}
    )
    assert wrong_side.status_code == 400
    ok = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Recvbl", "ledgerAccountId": accounts["1100"]["id"]}
    )
    assert ok.status_code == 201, ok.text
    vendor_ok = client.post(
        "/api/contacts", headers=h, json={"type": "vendor", "displayName": "Paybl", "ledgerAccountId": accounts["2000"]["id"]}
    )
    assert vendor_ok.status_code == 201, vendor_ok.text
    upd = client.put(f"/api/contacts/{vendor_ok.json()['id']}", headers=h, json={"ledgerAccountId": accounts["4000"]["id"]})
    assert upd.status_code == 400


# ------------------------------------------------------------ 12. image url


def test_item_image_url_must_be_http_or_an_inline_image(client):
    ctx = _fresh_org(client)
    h = ctx["h"]
    for bad in ("javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "data:image/svg+xml,<svg/>"):
        res = client.post("/api/items", headers=h, json={"name": "Pic", "sku": f"P-{uuid.uuid4().hex[:6]}", "imageUrl": bad})
        assert res.status_code == 422, bad
    item = _item(client, h, imageUrl="https://cdn.example.com/widget.png")
    assert item["imageUrl"] == "https://cdn.example.com/widget.png"
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"imageUrl": "javascript:alert(1)"}).status_code == 422
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"imageUrl": "data:image/png;base64,iVBORw0KGgo="}).status_code == 200
    assert client.put(f"/api/items/{item['id']}", headers=h, json={"imageUrl": None}).status_code == 200
