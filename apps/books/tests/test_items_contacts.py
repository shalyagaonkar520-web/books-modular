from tests.conftest import trial_balance_ok


def test_item_create_uppercases_sku_and_posts_opening_stock(client, org):
    h = org["h"]
    item = org["item"]
    assert item["sku"] == "MON-27"
    assert item["stockOnHand"] == 20
    ledger = client.get(f"/api/accounting/ledger/{org['accounts']['1200']['id']}", headers=h).json()
    assert any(line["sourceType"] == "item_opening" and line["debit"] == 140000 for line in ledger["lines"])
    assert trial_balance_ok(client, h)


def test_duplicate_sku_rejected_case_insensitive(client, org):
    res = client.post("/api/items", headers=org["h"], json={"name": "Dup", "sku": "mon-27", "sellingPrice": 1})
    assert res.status_code == 409


def test_item_filters_sort_and_pagination(client, org):
    h = org["h"]
    res = client.get("/api/items", headers=h, params={"type_filter": "service"}).json()
    assert all(i["type"] == "service" for i in res["items"]) and res["total"] >= 1
    res = client.get("/api/items", headers=h, params={"inventory_filter": "tracked"}).json()
    assert all(i["trackInventory"] for i in res["items"])
    res = client.get("/api/items", headers=h, params={"search": "monitor"}).json()
    assert res["total"] == 1 and res["items"][0]["sku"] == "MON-27"
    res = client.get("/api/items", headers=h, params={"sort_by": "name", "sort_order": "asc", "page_size": 1}).json()
    assert res["pageSize"] == 1 and len(res["items"]) == 1


def test_item_validation(client, org):
    h = org["h"]
    assert client.post("/api/items", headers=h, json={"name": "", "sku": "X"}).status_code == 422
    assert client.post("/api/items", headers=h, json={"name": "Neg", "sku": "NEG", "sellingPrice": -5}).status_code == 422
    # service items never track inventory
    svc = client.post("/api/items", headers=h, json={"name": "Svc", "sku": "SVC-X", "type": "service", "trackInventory": True, "openingStock": 5}).json()
    assert svc["trackInventory"] is False and svc["stockOnHand"] == 0


def test_item_update_and_delete(client, org):
    h = org["h"]
    created = client.post("/api/items", headers=h, json={"name": "Temp", "sku": "TMP-1", "sellingPrice": 10, "trackInventory": True, "openingStock": 4, "costPrice": 2}).json()
    upd = client.put(f"/api/items/{created['id']}", headers=h, json={"name": "Temp 2", "openingStock": 6})
    assert upd.status_code == 200 and upd.json()["name"] == "Temp 2" and upd.json()["stockOnHand"] == 6
    res = client.delete(f"/api/items/{created['id']}", headers=h)
    assert res.status_code == 200
    assert client.get(f"/api/items/{created['id']}", headers=h).status_code == 404
    assert trial_balance_ok(client, h)


def test_inventory_adjustment_changes_stock_and_posts(client, org):
    h = org["h"]
    before = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    res = client.post("/api/inventory-adjustments", headers=h, json={"itemId": org["item"]["id"], "date": "2026-09-01", "quantityDelta": -2, "reason": "Damaged"})
    assert res.status_code == 201, res.text
    after = client.get(f"/api/items/{org['item']['id']}", headers=h).json()["stockOnHand"]
    assert after == before - 2
    assert client.post("/api/inventory-adjustments", headers=h, json={"itemId": org["item"]["id"], "date": "2026-09-01", "quantityDelta": -999, "reason": "x"}).status_code == 400
    assert client.post("/api/inventory-adjustments", headers=h, json={"itemId": org["service"]["id"], "date": "2026-09-01", "quantityDelta": 1, "reason": "x"}).status_code == 400
    # restore
    client.post("/api/inventory-adjustments", headers=h, json={"itemId": org["item"]["id"], "date": "2026-09-01", "quantityDelta": 2, "reason": "Recount"})
    assert trial_balance_ok(client, h)


def test_contacts_crud_and_filters(client, org):
    h = org["h"]
    res = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Beta Corp", "email": "not-an-email"})
    assert res.status_code == 422
    created = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Beta Corp", "gstin": "27AAAAA0000A1Z5", "gstTreatment": "registered_business"}).json()
    listing = client.get("/api/contacts", headers=h, params={"type": "customer", "search": "beta"}).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == created["id"]
    upd = client.put(f"/api/contacts/{created['id']}", headers=h, json={"phone": "+91 99999 00000"})
    assert upd.status_code == 200 and upd.json()["phone"] == "+91 99999 00000"
    summary = client.get(f"/api/contacts/{created['id']}/summary", headers=h).json()
    assert summary["documentCount"] == 0
    assert client.delete(f"/api/contacts/{created['id']}", headers=h).status_code == 200
    assert client.get(f"/api/contacts/{created['id']}", headers=h).status_code == 404
