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


def test_item_low_stock_threshold_visible_sortable_and_filterable(client, org):
    h = org["h"]
    low = client.post(
        "/api/items", headers=h,
        json={"name": "Low Stock Widget", "sku": "LOW-1", "sellingPrice": 100, "trackInventory": True, "openingStock": 2, "reorderLevel": 10},
    ).json()
    assert low["reorderLevel"] == 10

    ok = client.post(
        "/api/items", headers=h,
        json={"name": "Well Stocked Widget", "sku": "OK-1", "sellingPrice": 100, "trackInventory": True, "openingStock": 50, "reorderLevel": 5},
    ).json()

    low_stock = client.get("/api/items", headers=h, params={"inventory_filter": "low-stock"}).json()
    low_stock_skus = {i["sku"] for i in low_stock["items"]}
    assert low["sku"] in low_stock_skus and ok["sku"] not in low_stock_skus

    sorted_desc = client.get("/api/items", headers=h, params={"sort_by": "reorderLevel", "sort_order": "desc", "page_size": 200}).json()
    levels = [i["reorderLevel"] for i in sorted_desc["items"]]
    assert levels == sorted(levels, reverse=True)


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


def test_contact_names_reject_digits_but_company_name_allows_them(client, org):
    """Names are people, not codes - but "3M" is a legitimate company name."""
    h = org["h"]
    bad_name = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Shivani 123", "email": "s1@x.com"})
    assert bad_name.status_code == 422
    assert "cannot contain numbers" in bad_name.text

    bad_person = client.post(
        "/api/contacts", headers=h,
        json={"type": "customer", "displayName": "Acme Traders", "contactPerson": "Ravi 99", "email": "s2@x.com"},
    )
    assert bad_person.status_code == 422
    assert "cannot contain numbers" in bad_person.text

    ok = client.post(
        "/api/contacts", headers=h,
        json={"type": "customer", "displayName": "Acme Traders", "companyName": "3M India", "contactPerson": "Ravi Kumar", "email": "s3@x.com"},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["companyName"] == "3M India"

    # The same rule applies on update.
    renamed = client.put(f"/api/contacts/{ok.json()['id']}", headers=h, json={"displayName": "Acme 2"})
    assert renamed.status_code == 422


def test_existing_names_with_digits_can_still_be_read_back(client, org):
    """The no-digits rule is an input rule only.

    It was first added to ContactBase, which ContactOut also extends, so a row
    whose name contained a digit (imported data, or anything created before the
    rule) made the whole contacts list fail to serialise with a 500.
    """
    from backend.db import SessionLocal
    from backend.models import Contact

    with SessionLocal() as db:
        db.add(Contact(organization_id=org["org"]["id"], type="customer", display_name="Flipkart Wholesale B2B", email="b2b@x.com"))
        db.commit()

    listing = client.get("/api/contacts", headers=org["h"], params={"type": "customer", "page_size": 200})
    assert listing.status_code == 200, listing.text
    assert "Flipkart Wholesale B2B" in [c["displayName"] for c in listing.json()["items"]]

    # Creating one through the API is still rejected.
    assert client.post("/api/contacts", headers=org["h"], json={
        "type": "customer", "displayName": "Typed 123", "email": "t123@x.com"}).status_code == 422
