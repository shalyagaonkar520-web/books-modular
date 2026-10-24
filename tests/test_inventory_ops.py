"""Warehouses, stock movements, transfers, batches, composite items and price lists."""

from datetime import date, timedelta

import pytest

from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today()
D = TODAY.isoformat()


@pytest.fixture
def books(client):
    ctx = register_org(client, "Inv")
    h = auth(ctx["token"])
    client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Bank", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2025-01-01"},
    )
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Shop"}).json()
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Maker"}).json()

    def item(name, sku, stock=0, cost=100, price=150):
        body = {
            "name": name,
            "sku": sku,
            "type": "goods",
            "sellingPrice": price,
            "costPrice": cost,
            "taxRate": 0,
            "trackInventory": True,
            "openingStock": stock,
            "openingStockRate": cost,
        }
        res = client.post("/api/items", headers=h, json=body)
        assert res.status_code == 201, res.text
        return res.json()

    return {"h": h, "customer": customer, "vendor": vendor, "item": item}


def _stock(client, h, item_id):
    return client.get(f"/api/items/{item_id}", headers=h).json()["stockOnHand"]


def test_default_warehouse_and_movement_ledger(client, books):
    b, h = books, books["h"]
    widget = b["item"]("Widget", "W-1", stock=10)
    whs = client.get("/api/warehouses", headers=h).json()
    assert len(whs) == 1 and whs[0]["isDefault"] and whs[0]["name"] == "Primary warehouse"

    client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": "sent",
            "lines": [{"itemId": widget["id"], "description": "W", "quantity": 3, "rate": 150, "taxRate": 0}],
        },
    )
    moves = client.get("/api/stock/movements", headers=h, params={"itemId": widget["id"]}).json()
    assert moves["total"] == 1
    row = moves["items"][0]
    assert row["quantity"] == -3 and row["sourceType"] == "invoice_stock" and row["balance"] == 7
    summary = client.get("/api/stock/summary", headers=h).json()
    line = next(r for r in summary["rows"] if r["itemId"] == widget["id"])
    assert line["total"] == 7 and line["byWarehouse"][whs[0]["id"]] == 7 and line["value"] == 700


def test_warehouse_stock_transfer_and_per_warehouse_limit(client, books):
    b, h = books, books["h"]
    widget = b["item"]("Gadget", "G-1", stock=10)
    default_id = client.get("/api/warehouses", headers=h).json()[0]["id"]
    branch = client.post("/api/warehouses", headers=h, json={"name": "Pune branch", "code": "PUN"}).json()

    t = client.post(
        "/api/transfer-orders",
        headers=h,
        json={"date": D, "fromWarehouseId": default_id, "toWarehouseId": branch["id"], "lines": [{"itemId": widget["id"], "quantity": 4}]},
    )
    assert t.status_code == 201, t.text
    assert t.json()["transferNumber"].startswith("TO-") and t.json()["status"] == "transferred"
    by_wh = next(r for r in client.get("/api/stock/summary", headers=h).json()["rows"] if r["itemId"] == widget["id"])["byWarehouse"]
    assert by_wh[default_id] == 6 and by_wh[branch["id"]] == 4
    assert _stock(client, h, widget["id"]) == 10  # transfers do not change the total

    # Selling 5 from the branch, which only holds 4, is refused.
    too_many = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": "sent",
            "warehouseId": branch["id"],
            "lines": [{"itemId": widget["id"], "description": "G", "quantity": 5, "rate": 10, "taxRate": 0}],
        },
    )
    assert too_many.status_code == 400 and "Pune branch" in too_many.json()["detail"]
    ok = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": "sent",
            "warehouseId": branch["id"],
            "lines": [{"itemId": widget["id"], "description": "G", "quantity": 4, "rate": 10, "taxRate": 0}],
        },
    )
    assert ok.status_code == 201, ok.text
    by_wh = next(r for r in client.get("/api/stock/summary", headers=h).json()["rows"] if r["itemId"] == widget["id"])["byWarehouse"]
    assert by_wh[branch["id"]] == 0
    # Voiding puts the stock back where it came from.
    client.post(f"/api/invoices/{ok.json()['id']}/status", headers=h, json={"status": "void"})
    by_wh = next(r for r in client.get("/api/stock/summary", headers=h).json()["rows"] if r["itemId"] == widget["id"])["byWarehouse"]
    assert by_wh[branch["id"]] == 4

    assert client.delete(f"/api/warehouses/{branch['id']}", headers=h).status_code == 400  # has history
    same = client.post(
        "/api/transfer-orders",
        headers=h,
        json={"date": D, "fromWarehouseId": default_id, "toWarehouseId": default_id, "lines": [{"itemId": widget["id"], "quantity": 1}]},
    )
    assert same.status_code == 422


def test_batches_with_expiry(client, books):
    b, h = books, books["h"]
    syrup = b["item"]("Syrup", "SY-1")
    soon = (TODAY + timedelta(days=30)).isoformat()
    later = (TODAY + timedelta(days=200)).isoformat()
    res = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": b["vendor"]["id"],
            "date": D,
            "lines": [
                {
                    "itemId": syrup["id"],
                    "description": "Syrup",
                    "quantity": 10,
                    "rate": 50,
                    "taxRate": 0,
                    "batchNumber": "B-LATE",
                    "expiryDate": later,
                },
                {
                    "itemId": syrup["id"],
                    "description": "Syrup",
                    "quantity": 5,
                    "rate": 50,
                    "taxRate": 0,
                    "batchNumber": "B-SOON",
                    "expiryDate": soon,
                },
            ],
        },
    )
    assert res.status_code == 201, res.text
    batches = client.get("/api/stock/batches", headers=h, params={"itemId": syrup["id"]}).json()
    assert [x["batchNumber"] for x in batches] == ["B-SOON", "B-LATE"]  # soonest expiry first
    sale = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": "sent",
            "lines": [{"itemId": syrup["id"], "description": "Syrup", "quantity": 2, "rate": 80, "taxRate": 0, "batchNumber": "B-SOON"}],
        },
    )
    assert sale.status_code == 201, sale.text
    soon_batch = next(
        x for x in client.get("/api/stock/batches", headers=h, params={"itemId": syrup["id"]}).json() if x["batchNumber"] == "B-SOON"
    )
    assert soon_batch["quantity"] == 3
    wrong = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "status": "sent",
            "lines": [{"itemId": syrup["id"], "description": "Syrup", "quantity": 1, "rate": 80, "taxRate": 0, "batchNumber": "NOPE"}],
        },
    )
    assert wrong.status_code == 400


def test_composite_item_assembly(client, books):
    b, h = books, books["h"]
    frame = b["item"]("Frame", "F-1", stock=10, cost=200)
    wheel = b["item"]("Wheel", "WH-1", stock=30, cost=50)
    bike = b["item"]("Bicycle", "BK-1", stock=0, cost=0, price=1000)
    res = client.put(
        f"/api/composite-items/{bike['id']}/components",
        headers=h,
        json=[{"itemId": frame["id"], "quantity": 1}, {"itemId": wheel["id"], "quantity": 2}],
    )
    assert res.status_code == 200 and len(res.json()) == 2
    built = client.post(f"/api/composite-items/{bike['id']}/assemble", headers=h, json={"quantity": 4, "date": D})
    assert built.status_code == 201, built.text
    assert built.json()["unitCost"] == 300 and built.json()["assemblyNumber"].startswith("ASM-")
    assert _stock(client, h, bike["id"]) == 4 and _stock(client, h, frame["id"]) == 6 and _stock(client, h, wheel["id"]) == 22
    assert client.get(f"/api/items/{bike['id']}", headers=h).json()["costPrice"] == 300
    # Not enough frames for 7 more.
    assert client.post(f"/api/composite-items/{bike['id']}/assemble", headers=h, json={"quantity": 7, "date": D}).status_code == 400
    assert client.delete(f"/api/composite-items/assemblies/{built.json()['id']}", headers=h).status_code == 200
    assert _stock(client, h, bike["id"]) == 0 and _stock(client, h, frame["id"]) == 10
    self_ref = client.put(f"/api/composite-items/{bike['id']}/components", headers=h, json=[{"itemId": bike["id"], "quantity": 1}])
    assert self_ref.status_code == 400
    assert trial_balance_ok(client, h)


def test_price_lists(client, books):
    b, h = books, books["h"]
    pen = b["item"]("Pen", "P-1", price=99.4)
    wholesale = client.post("/api/price-lists", headers=h, json={"name": "Wholesale", "percentage": -10, "rounding": "whole"}).json()
    rates = {r["itemId"]: r for r in client.get(f"/api/price-lists/{wholesale['id']}/prices", headers=h).json()}
    assert rates[pen["id"]]["baseRate"] == 99.4 and rates[pen["id"]]["rate"] == 89  # 89.46 rounded
    special = client.post(
        "/api/price-lists", headers=h, json={"name": "VIP", "method": "per_item", "items": [{"itemId": pen["id"], "rate": 75}]}
    ).json()
    rates = {r["itemId"]: r for r in client.get(f"/api/price-lists/{special['id']}/prices", headers=h).json()}
    assert rates[pen["id"]]["rate"] == 75
    # A customer can carry a price list.
    updated = client.put(f"/api/contacts/{b['customer']['id']}", headers=h, json={"priceListId": special["id"]})
    assert updated.status_code == 200 and updated.json()["priceListId"] == special["id"]
    assert client.delete(f"/api/price-lists/{special['id']}", headers=h).status_code == 200
    assert client.get(f"/api/contacts/{b['customer']['id']}", headers=h).json()["priceListId"] is None
