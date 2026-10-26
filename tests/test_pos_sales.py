"""Point of Sale. Phase 2: the sale; phase 4: returns and the day summary."""

import json
import uuid
from datetime import date

import pytest

from tests.conftest import auth, invite_and_accept, register_org, trial_balance_ok


@pytest.fixture
def org(client):
    ctx = register_org(client, "PosSale")
    return auth(ctx["token"])


def _item(client, h, name, sku, **extra):
    body = {"name": name, "sku": sku, "type": "goods", "sellingPrice": 50, "costPrice": 30, "taxRate": 5, **extra}
    return client.post("/api/items", headers=h, json=body)


def _stocked(client, h, name, sku, stock, price=100, tax=5, **extra):
    res = _item(
        client,
        h,
        name,
        sku,
        sellingPrice=price,
        costPrice=60,
        taxRate=tax,
        trackInventory=True,
        openingStock=stock,
        openingStockRate=60,
        **extra,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _sale(client, h, lines, mode="cash", sale_id=None, **extra):
    body = {"clientSaleId": sale_id or uuid.uuid4().hex, "lines": lines, "paymentMode": mode, **extra}
    return client.post("/api/pos/sales", headers=h, json=body)


def _return(client, h, sale_id, lines, return_id=None, **extra):
    body = {"clientReturnId": return_id or uuid.uuid4().hex, "lines": lines, **extra}
    return client.post(f"/api/pos/sales/{sale_id}/returns", headers=h, json=body)


def _bank(client, h, name="HDFC Current", type_="bank"):
    res = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": name, "type": type_, "openingBalance": 0, "openingBalanceDate": date.today().isoformat()},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _balances(client, h):
    return {a["name"]: a["currentBalance"] for a in client.get("/api/banking/accounts", headers=h).json()}


def _stock(client, h, item_id):
    return client.get(f"/api/items/{item_id}", headers=h).json()["stockOnHand"]


def _login(client, email):
    return auth(client.post("/api/auth/login", json={"email": email, "password": "Str0ngPass!"}).json()["accessToken"])


# --------------------------------------------------------------------------- #
# The sale
# --------------------------------------------------------------------------- #
def test_cash_sale_is_a_paid_invoice_to_the_walk_in_customer(client, org):
    butter = _stocked(client, org, "Butter", "BUT-1", 10, price=100, tax=5)
    tea = _stocked(client, org, "Tea", "TEA-1", 5, price=200, tax=18)
    res = _sale(client, org, [{"itemId": butter["id"], "quantity": 2}, {"itemId": tea["id"], "quantity": 1}], amountTendered=500)
    assert res.status_code == 201, res.text
    sale = res.json()
    # 2 x 100 at 5% = 210, 1 x 200 at 18% = 236
    assert sale["total"] == 446 and sale["tendered"] == 500 and sale["changeDue"] == 54
    assert sale["subtotal"] == 400 and sale["taxTotal"] == 46 and sale["mode"] == "cash"
    assert sale["customerName"] == "Walk-in Customer" and sale["itemsCount"] == 3
    assert sale["cashierName"] and sale["paymentNumber"] and sale["receipt"]["organizationName"]
    assert [ln["name"] for ln in sale["lines"]] == ["Butter", "Tea"]

    inv = client.get(f"/api/invoices/{sale['invoiceId']}", headers=org).json()
    assert inv["status"] == "paid" and inv["balanceDue"] == 0 and inv["total"] == 446
    assert _stock(client, org, butter["id"]) == 8 and _stock(client, org, tea["id"]) == 4
    # Cash lands in Petty Cash.
    assert _balances(client, org)["Petty Cash"] == 446
    # The next sale reuses the same Walk-in Customer.
    _sale(client, org, [{"itemId": butter["id"], "quantity": 1}])
    walk_ins = client.get("/api/contacts", headers=org, params={"type": "customer", "search": "Walk-in"}).json()["items"]
    assert len(walk_ins) == 1
    assert trial_balance_ok(client, org)

    from backend.db import SessionLocal
    from backend.models import AuditLog

    with SessionLocal() as db:
        assert db.query(AuditLog).filter(AuditLog.entity_type == "pos_sale", AuditLog.entity_id == sale["id"]).count() == 1


def test_retry_with_the_same_client_sale_id_does_not_charge_twice(client, org):
    item = _stocked(client, org, "Soap", "SOAP-9", 10, price=40, tax=0)
    sale_id = uuid.uuid4().hex
    first = _sale(client, org, [{"itemId": item["id"], "quantity": 1}], sale_id=sale_id)
    again = _sale(client, org, [{"itemId": item["id"], "quantity": 1}], sale_id=sale_id)
    assert first.status_code == 201 and again.status_code == 200
    assert again.json()["id"] == first.json()["id"] and again.json()["invoiceId"] == first.json()["invoiceId"]
    assert _stock(client, org, item["id"]) == 9
    assert _balances(client, org)["Petty Cash"] == 40
    # The id is the till's: another organization may use the same one.
    other = auth(register_org(client, "PosRetryOther")["token"])
    theirs = _stocked(client, other, "Soap", "SOAP-9", 3, price=40, tax=0)
    assert _sale(client, other, [{"itemId": theirs["id"], "quantity": 1}], sale_id=sale_id).status_code == 201


def test_short_stock_answers_409_and_changes_nothing(client, org):
    milk = _stocked(client, org, "Milk", "MILK-1", 2, price=30, tax=0)
    bread = _stocked(client, org, "Bread", "BRD-1", 0, price=45, tax=0)
    res = _sale(client, org, [{"itemId": milk["id"], "quantity": 3}, {"itemId": bread["id"], "quantity": 1}])
    assert res.status_code == 409
    assert res.json()["detail"] == "Not enough stock. Milk: 2 pcs in stock, 3 on the bill; Bread: 0 pcs in stock, 1 on the bill"
    assert _stock(client, org, milk["id"]) == 2
    assert client.get("/api/pos/sales", headers=org).json() == []
    # Scanned twice is one line: 1 + 2 = 3 is still more than 2.
    assert _sale(client, org, [{"itemId": milk["id"], "quantity": 1}, {"itemId": milk["id"], "quantity": 2}]).status_code == 409

    # The admin can let the counter sell below zero.
    settings = client.put("/api/pos/settings", headers=org, json={"allowNegativeStock": True})
    assert settings.status_code == 200 and settings.json()["allowNegativeStock"] is True
    assert _sale(client, org, [{"itemId": milk["id"], "quantity": 3}]).status_code == 201
    assert _stock(client, org, milk["id"]) == -1


def test_upi_and_card_go_to_the_pos_bank_account_or_petty_cash(client, org):
    item = _stocked(client, org, "Rice 5kg", "RICE-5", 20, price=300, tax=0)
    # No account chosen yet: UPI falls back to Petty Cash.
    assert _sale(client, org, [{"itemId": item["id"], "quantity": 1}], mode="upi", reference="UPI123").status_code == 201
    assert _balances(client, org)["Petty Cash"] == 300
    hdfc = _bank(client, org)
    assert client.put("/api/pos/settings", headers=org, json={"bankAccountId": hdfc["id"]}).json()["bankAccountName"] == "HDFC Current"
    upi = _sale(client, org, [{"itemId": item["id"], "quantity": 2}], mode="upi", amountTendered=9999).json()
    # Tendered is ignored for UPI: exactly the bill is taken, no change.
    assert upi["tendered"] == 600 and upi["changeDue"] == 0
    _sale(client, org, [{"itemId": item["id"], "quantity": 1}], mode="card")
    _sale(client, org, [{"itemId": item["id"], "quantity": 1}], mode="cash")
    balances = _balances(client, org)
    assert balances["HDFC Current"] == 900 and balances["Petty Cash"] == 600


def test_cash_short_of_the_total_is_refused(client, org):
    item = _stocked(client, org, "Oil", "OIL-1", 5, price=150, tax=0)
    res = _sale(client, org, [{"itemId": item["id"], "quantity": 1}], amountTendered=100)
    assert res.status_code == 400 and "less than the bill total" in res.json()["detail"]
    assert _stock(client, org, item["id"]) == 5


def test_sale_input_rules(client, org):
    item = _stocked(client, org, "Pen", "PEN-1", 5, price=10, tax=0)
    line = [{"itemId": item["id"], "quantity": 1}]
    assert _sale(client, org, line, sale_id="short").status_code == 422
    assert _sale(client, org, line, sale_id="has spaces in it").status_code == 422
    assert _sale(client, org, []).status_code == 422
    assert _sale(client, org, [{"itemId": item["id"], "quantity": 0}]).status_code == 422
    assert _sale(client, org, line, mode="cheque").status_code == 422
    assert _sale(client, org, line, date="2020-01-01").status_code == 400
    assert _sale(client, org, [{"itemId": "nope", "quantity": 1}]).status_code == 404
    serial = _item(client, org, "Phone", "PH-1", trackInventory=True, trackSerial=True).json()
    res = _sale(client, org, [{"itemId": serial["id"], "quantity": 1}])
    assert res.status_code == 400 and "serial" in res.json()["detail"]
    client.put(f"/api/items/{item['id']}", headers=org, json={"isActive": False})
    assert _sale(client, org, line).status_code == 400


def test_bill_discount_and_a_named_customer(client, org):
    item = _stocked(client, org, "Ghee", "GHEE-1", 5, price=500, tax=0)
    cust = client.post("/api/contacts", headers=org, json={"type": "customer", "displayName": "Regular Ravi"}).json()
    sale = _sale(client, org, [{"itemId": item["id"], "quantity": 2}], discountAmount=50, customerId=cust["id"]).json()
    assert sale["total"] == 950 and sale["discountAmount"] == 50 and sale["customerName"] == "Regular Ravi"
    vendor = client.post("/api/contacts", headers=org, json={"type": "vendor", "displayName": "Supplier"}).json()
    assert _sale(client, org, [{"itemId": item["id"], "quantity": 1}], customerId=vendor["id"]).status_code == 400


def test_roles_plans_and_module_access(client):
    ctx = register_org(client, "PosRoles")
    admin = auth(ctx["token"])
    item = _stocked(client, admin, "Juice", "JUI-1", 50, price=20, tax=0)
    line = [{"itemId": item["id"], "quantity": 1}]
    invite_and_accept(client, admin, "Cashier", "cashier@posroles.example.com", "staff", "Str0ngPass!")
    invite_and_accept(client, admin, "Auditor", "auditor@posroles.example.com", "viewer", "Str0ngPass!")
    staff = _login(client, "cashier@posroles.example.com")
    viewer = _login(client, "auditor@posroles.example.com")

    assert _sale(client, staff, line).status_code == 201
    assert _sale(client, viewer, line).status_code == 403
    assert client.get("/api/pos/lookup", headers=viewer, params={"code": "JUI-1"}).status_code == 200
    assert client.get("/api/pos/settings", headers=staff).status_code == 403
    assert client.put("/api/pos/settings", headers=staff, json={"allowNegativeStock": True}).status_code == 403
    assert client.get("/api/pos/settings", headers=admin).status_code == 200

    from backend.db import SessionLocal
    from backend.models import Organization, User

    # A plan accepted before the Point of Sale existed still includes it.
    with SessionLocal() as db:
        org_row = db.get(Organization, ctx["user"]["organizationId"])
        org_row.subscription_status = "active"
        org_row.requested_modules = json.dumps(["items", "customers", "invoices", "paymentsReceived", "accounting", "reports"])
        db.commit()
    assert _sale(client, staff, line).status_code == 201
    # A cashier the admin limited to other modules cannot ring up sales.
    with SessionLocal() as db:
        db.query(User).filter(User.email == "cashier@posroles.example.com").one().module_access = json.dumps(["customers"])
        db.commit()
    assert _sale(client, staff, line).status_code == 403
    with SessionLocal() as db:
        db.query(User).filter(User.email == "cashier@posroles.example.com").one().module_access = json.dumps(["pos"])
        db.commit()
    assert _sale(client, staff, line).status_code == 201


def test_sales_list_detail_and_summary_stay_in_the_organization(client, org):
    item = _stocked(client, org, "Biscuit", "BIS-9", 30, price=10, tax=0)
    first = _sale(client, org, [{"itemId": item["id"], "quantity": 3}]).json()
    _sale(client, org, [{"itemId": item["id"], "quantity": 2}], mode="upi")
    listed = client.get("/api/pos/sales", headers=org).json()
    assert [s["total"] for s in listed] == [20, 30]
    assert client.get("/api/pos/sales", headers=org, params={"date": "2020-01-01"}).json() == []
    assert client.get("/api/pos/sales", headers=org, params={"mine": True}).json()[0]["cashierName"]
    assert client.get(f"/api/pos/sales/{first['id']}", headers=org).json()["invoiceNumber"] == first["invoiceNumber"]
    s = client.get("/api/pos/summary", headers=org).json()
    assert s["salesCount"] == 2 and s["grossSales"] == 50 and s["netSales"] == 50 and s["itemsSold"] == 5
    assert s["cashExpected"] == 30 and s["averageBill"] == 25
    assert {m["mode"]: m["total"] for m in s["byMode"]} == {"cash": 30, "upi": 20, "card": 0}
    assert s["topItems"][0]["name"] == "Biscuit" and s["byCashier"][0]["count"] == 2

    other = auth(register_org(client, "PosPeek")["token"])
    assert client.get(f"/api/pos/sales/{first['id']}", headers=other).status_code == 404
    assert client.get("/api/pos/sales", headers=other).json() == []
    assert client.get("/api/pos/summary", headers=other).json()["salesCount"] == 0
    # Selling another organization's item is a 404, not a sale.
    assert _sale(client, other, [{"itemId": item["id"], "quantity": 1}]).status_code == 404


def test_settings_validation(client, org):
    card = _bank(client, org, "Corporate card", "credit_card")
    assert client.put("/api/pos/settings", headers=org, json={"bankAccountId": card["id"]}).status_code == 400
    other = auth(register_org(client, "PosBankOther")["token"])
    theirs = _bank(client, other, "Their bank")
    assert client.put("/api/pos/settings", headers=org, json={"bankAccountId": theirs["id"]}).status_code == 404
    res = client.put(
        "/api/pos/settings",
        headers=org,
        json={"receiptHeader": "  Welcome!  ", "receiptFooter": "No returns after 7 days", "bankAccountId": ""},
    )
    body = res.json()
    assert res.status_code == 200 and body["receiptHeader"] == "Welcome!" and body["bankAccountId"] is None
    assert body["cashAccountName"] == "Petty Cash"
    assert client.put("/api/pos/settings", headers=org, json={"receiptHeader": "x" * 501}).status_code == 422
    item = _stocked(client, org, "Candle", "CAN-1", 5, price=10, tax=0)
    receipt = _sale(client, org, [{"itemId": item["id"], "quantity": 1}]).json()["receipt"]
    assert receipt["header"] == "Welcome!" and receipt["footer"] == "No returns after 7 days"


# --------------------------------------------------------------------------- #
# Returns
# --------------------------------------------------------------------------- #
def test_return_is_a_refunded_credit_note_and_restocks(client, org):
    butter = _stocked(client, org, "Butter R", "BUTR-1", 10, price=100, tax=5)
    tea = _stocked(client, org, "Tea R", "TEAR-1", 10, price=200, tax=18)
    sale = _sale(client, org, [{"itemId": butter["id"], "quantity": 3}, {"itemId": tea["id"], "quantity": 1}]).json()
    assert sale["total"] == 551
    ret_id = uuid.uuid4().hex
    res = _return(client, org, sale["id"], [{"itemId": butter["id"], "quantity": 2}], return_id=ret_id, reason="Damaged")
    assert res.status_code == 201, res.text
    after = res.json()
    assert after["returnedAmount"] == 210 and len(after["returns"]) == 1
    assert after["returns"][0]["total"] == 210 and after["returns"][0]["refundNumber"]
    assert {ln["name"]: ln["returnedQuantity"] for ln in after["lines"]} == {"Butter R": 2, "Tea R": 0}
    assert _stock(client, org, butter["id"]) == 9
    assert _balances(client, org)["Petty Cash"] == 341

    # A retry of the same return changes nothing.
    again = _return(client, org, sale["id"], [{"itemId": butter["id"], "quantity": 2}], return_id=ret_id)
    assert again.status_code == 200 and again.json()["returnedAmount"] == 210
    # Only what is left can come back.
    over = _return(client, org, sale["id"], [{"itemId": butter["id"], "quantity": 2}])
    assert over.status_code == 400 and over.json()["detail"] == "Only 1 of Butter R can still be returned"
    assert _return(client, org, sale["id"], [{"itemId": "not-on-bill", "quantity": 1}]).status_code == 400

    s = client.get("/api/pos/summary", headers=org).json()
    assert s["grossSales"] == 551 and s["returnsTotal"] == 210 and s["netSales"] == 341 and s["cashExpected"] == 341
    assert trial_balance_ok(client, org)


def test_returning_everything_on_a_discounted_bill_refunds_exactly_what_was_paid(client, org):
    a = _stocked(client, org, "Item A", "IA-1", 10, price=33.33, tax=5)
    b = _stocked(client, org, "Item B", "IB-1", 10, price=19.99, tax=12)
    sale = _sale(client, org, [{"itemId": a["id"], "quantity": 3}, {"itemId": b["id"], "quantity": 2}], discountAmount=7).json()
    assert _return(client, org, sale["id"], [{"itemId": a["id"], "quantity": 1}]).status_code == 201
    assert _return(client, org, sale["id"], [{"itemId": b["id"], "quantity": 1}]).status_code == 201
    last = _return(client, org, sale["id"], [{"itemId": a["id"], "quantity": 2}, {"itemId": b["id"], "quantity": 1}])
    assert last.status_code == 201, last.text
    assert last.json()["returnedAmount"] == sale["total"]
    assert _return(client, org, sale["id"], [{"itemId": a["id"], "quantity": 1}]).status_code == 400
    assert _balances(client, org)["Petty Cash"] == 0
    assert _stock(client, org, a["id"]) == 10 and _stock(client, org, b["id"]) == 10
    assert trial_balance_ok(client, org)


def test_returns_need_write_access_and_stay_in_the_organization(client):
    admin = auth(register_org(client, "PosRet")["token"])
    item = _stocked(client, admin, "Cake", "CAKE-1", 5, price=50, tax=0)
    sale = _sale(client, admin, [{"itemId": item["id"], "quantity": 2}]).json()
    invite_and_accept(client, admin, "Viewer", "viewer@posret.example.com", "viewer", "Str0ngPass!")
    viewer = _login(client, "viewer@posret.example.com")
    assert _return(client, viewer, sale["id"], [{"itemId": item["id"], "quantity": 1}]).status_code == 403
    other = auth(register_org(client, "PosRetOther")["token"])
    assert _return(client, other, sale["id"], [{"itemId": item["id"], "quantity": 1}]).status_code == 404
