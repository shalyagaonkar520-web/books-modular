"""Point of Sale. Phase 1: barcodes on items and the scan lookup."""

import pytest

from tests.conftest import auth, register_org


def _item(client, h, name, sku, barcode=None, **extra):
    body = {"name": name, "sku": sku, "type": "goods", "sellingPrice": 50, "costPrice": 30, "taxRate": 5, **extra}
    if barcode is not None:
        body["barcode"] = barcode
    return client.post("/api/items", headers=h, json=body)


@pytest.fixture
def org(client):
    ctx = register_org(client, "Pos")
    return auth(ctx["token"])


def test_barcode_is_unique_within_an_organization(client, org):
    first = _item(client, org, "Amul Butter 100g", "BUT-100", "8901262150101")
    assert first.status_code == 201, first.text
    assert first.json()["barcode"] == "8901262150101"
    dup = _item(client, org, "Another butter", "BUT-200", "8901262150101")
    assert dup.status_code == 409
    assert dup.json()["detail"] == "Barcode 8901262150101 is already used by 'Amul Butter 100g' (BUT-100)"
    # Items without a barcode never clash with each other.
    assert _item(client, org, "Loose rice", "RICE-1").status_code == 201
    assert _item(client, org, "Loose dal", "DAL-1", "").status_code == 201
    assert _item(client, org, "Loose sugar", "SUG-1", "   ").json()["barcode"] is None


def test_barcode_update_checks_duplicates_and_can_be_cleared(client, org):
    a = _item(client, org, "Tea 250g", "TEA-250", "8901030703101").json()
    b = _item(client, org, "Tea 500g", "TEA-500").json()
    taken = client.put(f"/api/items/{b['id']}", headers=org, json={"barcode": "8901030703101"})
    assert taken.status_code == 409 and "Tea 250g" in taken.json()["detail"]
    # Saving an item with its own barcode is not a clash.
    assert client.put(f"/api/items/{a['id']}", headers=org, json={"barcode": "8901030703101", "name": "Tea 250 g"}).status_code == 200
    assert client.put(f"/api/items/{a['id']}", headers=org, json={"barcode": None}).json()["barcode"] is None
    assert client.put(f"/api/items/{b['id']}", headers=org, json={"barcode": "8901030703101"}).status_code == 200


def test_same_barcode_is_allowed_in_two_organizations(client, org):
    other = auth(register_org(client, "PosOther")["token"])
    assert _item(client, org, "Biscuits", "BIS-1", "8901063010017").status_code == 201
    assert _item(client, other, "Biscuits", "BIS-1", "8901063010017").status_code == 201


def test_barcode_rejects_spaces_and_overlong_codes(client, org):
    assert _item(client, org, "Soap", "SOAP-1", "8901 030").status_code == 422
    assert _item(client, org, "Soap", "SOAP-1", "9" * 65).status_code == 422


def test_items_search_finds_barcodes(client, org):
    _item(client, org, "Shampoo", "SHA-1", "8901030865101")
    found = client.get("/api/items", headers=org, params={"search": "030865"}).json()["items"]
    assert [i["name"] for i in found] == ["Shampoo"]


def test_lookup_matches_barcode_before_sku(client, org):
    by_barcode = _item(client, org, "Barcode item", "BC-1", "ABC123").json()
    by_sku = _item(client, org, "SKU item", "abc123x").json()
    sku_twin = _item(client, org, "SKU twin", "XYZ999").json()
    res = client.get("/api/pos/lookup", headers=org, params={"code": "ABC123"})
    assert res.status_code == 200 and res.json()["id"] == by_barcode["id"]
    assert set(res.json()) >= {
        "id",
        "name",
        "sku",
        "barcode",
        "unit",
        "sellingPrice",
        "taxRate",
        "hsnSac",
        "trackInventory",
        "stockOnHand",
        "imageUrl",
    }
    # No barcode matches, so the SKU is used, in any letter case.
    assert client.get("/api/pos/lookup", headers=org, params={"code": "xyz999"}).json()["id"] == sku_twin["id"]
    assert client.get("/api/pos/lookup", headers=org, params={"code": "ABC123X"}).json()["id"] == by_sku["id"]
    # A barcode that equals another item's SKU still finds the barcode's item.
    clash = _item(client, org, "Barcode equals SKU", "BC-2", "XYZ999").json()
    assert client.get("/api/pos/lookup", headers=org, params={"code": "XYZ999"}).json()["id"] == clash["id"]


def test_lookup_ignores_inactive_and_other_organizations(client, org):
    item = _item(client, org, "Old stock", "OLD-1", "1111111111116").json()
    client.put(f"/api/items/{item['id']}", headers=org, json={"isActive": False})
    missing = client.get("/api/pos/lookup", headers=org, params={"code": "1111111111116"})
    assert missing.status_code == 404 and missing.json()["detail"] == "No item with this barcode"
    other = auth(register_org(client, "PosStranger")["token"])
    _item(client, other, "Their item", "THEIR-1", "2222222222220")
    assert client.get("/api/pos/lookup", headers=org, params={"code": "2222222222220"}).status_code == 404
    assert client.get("/api/pos/lookup", headers=org, params={"code": "THEIR-1"}).status_code == 404
