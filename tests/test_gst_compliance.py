"""GST compliance: place of supply, TCS, TDS, reverse charge, GSTR-1, GSTR-3B, e-invoice and e-way bill."""

import json
from datetime import date, timedelta
from decimal import Decimal

import pytest

from backend.services import gst
from backend.services.gst_returns import set_off
from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today()
D = (TODAY - timedelta(days=5)).isoformat()
RANGE = {"startDate": (TODAY - timedelta(days=30)).isoformat(), "endDate": TODAY.isoformat()}


@pytest.fixture
def books(client):
    ctx = register_org(client, "Gst")
    h = auth(ctx["token"])
    # A Karnataka business (GSTIN state 29).
    assert (
        client.put(
            "/api/organization", headers=h, json={"gstin": "29ABCDE1234F1Z5", "state": "Karnataka", "postalCode": "560001"}
        ).status_code
        == 200
    )
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Bank", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2026-01-01"},
    ).json()
    local = client.post(
        "/api/contacts",
        headers=h,
        json={
            "type": "customer",
            "displayName": "Local Ltd",
            "gstin": "29AAACL1234A1Z2",
            "gstTreatment": "registered_business",
            "billingAddress": "MG Road\nBengaluru 560001",
        },
    ).json()
    outside = client.post(
        "/api/contacts",
        headers=h,
        json={
            "type": "customer",
            "displayName": "Mumbai Pvt",
            "gstin": "27AAACM1234A1Z8",
            "gstTreatment": "registered_business",
            "billingAddress": "Andheri\nMumbai 400053",
        },
    ).json()
    consumer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Walk-in", "placeOfSupply": "33"}).json()
    vendor = client.post(
        "/api/contacts",
        headers=h,
        json={
            "type": "vendor",
            "displayName": "Chennai Supplies",
            "gstin": "33AAACC1234A1Z1",
            "gstTreatment": "registered_business",
            "pan": "AAACC1234A",
        },
    ).json()
    item = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "Laptop",
            "sku": "LAP-1",
            "type": "goods",
            "hsnSac": "8471",
            "sellingPrice": 50000,
            "costPrice": 40000,
            "taxRate": 18,
        },
    ).json()
    service = client.post(
        "/api/items",
        headers=h,
        json={"name": "Support", "sku": "SUP-1", "type": "service", "hsnSac": "998313", "sellingPrice": 10000, "taxRate": 18},
    ).json()
    return {
        "h": h,
        "bank": bank,
        "local": local,
        "outside": outside,
        "consumer": consumer,
        "vendor": vendor,
        "item": item,
        "service": service,
    }


def _balance(client, h, code):
    return next(a for a in client.get("/api/accounting/accounts", headers=h).json() if a["code"] == code)["balance"]


def _invoice(client, b, customer, lines, **extra):
    res = client.post(
        "/api/invoices", headers=b["h"], json={"customerId": customer["id"], "date": D, "status": "sent", "lines": lines, **extra}
    )
    assert res.status_code == 201, res.text
    return res.json()


def _line(item, qty=1, rate=None, tax=18):
    return {
        "itemId": item["id"],
        "description": item["name"],
        "quantity": qty,
        "rate": rate if rate is not None else item["sellingPrice"],
        "taxRate": tax,
    }


def test_state_helpers():
    assert gst.state_from_gstin("29ABCDE1234F1Z5") == "29"
    assert gst.state_from_gstin("bad") is None
    assert gst.state_from_name("Tamil Nadu") == "33"
    assert gst.state_from_name("orissa") == "21"
    cgst, sgst, igst = gst.split(Decimal("18.01"), False)
    assert cgst + sgst == Decimal("18.01") and abs(cgst - sgst) == Decimal("0.01") and igst == 0
    assert gst.split(Decimal("18"), True) == (Decimal("0"), Decimal("0"), Decimal("18.00"))


def test_set_off_follows_statutory_order():
    liability = {"igst": Decimal("100"), "cgst": Decimal("50"), "sgst": Decimal("50")}
    credit = {"igst": Decimal("120"), "cgst": Decimal("10"), "sgst": Decimal("60")}
    result = set_off(liability, credit)
    # IGST credit clears IGST (100) then 20 of CGST; CGST credit takes 10 more; SGST credit clears SGST.
    assert result["cashPayable"] == {"igst": 0, "cgst": 20, "sgst": 0}
    assert result["creditCarriedForward"] == {"igst": 0, "cgst": 0, "sgst": 10}


def test_tcs_on_invoice_is_collected_and_posted(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, b["local"], [_line(b["item"])], tcsRate=1)
    # 50,000 + 9,000 GST = 59,000; TCS 1% of 59,000 = 590.
    assert inv["tcsAmount"] == 590 and inv["total"] == 59590
    assert _balance(client, h, "2210") == 590
    assert _balance(client, h, "1100") == 59590
    assert trial_balance_ok(client, h)


def test_tds_and_reverse_charge_on_bills(client, books):
    b, h = books, books["h"]
    res = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": b["vendor"]["id"],
            "date": D,
            "tdsSection": "194J",
            "tdsRate": 10,
            "lines": [_line(b["service"], 1, 20000)],
        },
    )
    assert res.status_code == 201, res.text
    bill = res.json()
    # 20,000 + 3,600 GST - 2,000 TDS (10% of 20,000) = 21,600 payable to the vendor.
    assert bill["tdsAmount"] == 2000 and bill["total"] == 21600 and bill["balanceDue"] == 21600
    assert _balance(client, h, "2200") == 2000

    rcm = client.post(
        "/api/bills",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "date": D, "reverseCharge": True, "lines": [_line(b["service"], 1, 10000)]},
    ).json()
    # Under reverse charge the vendor is paid only the value; we owe the 1,800 GST ourselves.
    assert rcm["reverseCharge"] is True and rcm["total"] == 10000
    assert _balance(client, h, "2110") == 1800
    assert _balance(client, h, "1300") == 3600 + 1800
    assert trial_balance_ok(client, h)

    missing_section = client.post(
        "/api/bills", headers=h, json={"vendorId": b["vendor"]["id"], "date": D, "tdsRate": 2, "lines": [_line(b["service"])]}
    )
    assert missing_section.status_code == 422

    reg = client.get("/api/gst/tds-register", headers=h, params=RANGE).json()
    assert reg["tdsTotal"] == 2000 and reg["tdsBySection"] == [{"section": "194J", "taxable": 20000, "tds": 2000}]
    xlsx = client.get("/api/gst/tds-register", headers=h, params={**RANGE, "format": "xlsx"})
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"


def test_gstr1_sections_and_tax_split(client, books):
    b, h = books, books["h"]
    _invoice(client, b, b["local"], [_line(b["item"])])  # B2B intra-state: CGST + SGST
    _invoice(client, b, b["outside"], [_line(b["item"], 2)])  # B2B inter-state: IGST
    _invoice(client, b, b["consumer"], [_line(b["service"])])  # B2CS inter-state (place of supply 33)
    big = _invoice(client, b, b["consumer"], [_line(b["item"], 3)])  # B2CL: inter-state, unregistered, > 1 lakh
    assert big["total"] > 100000
    client.post("/api/credit-notes", headers=h, json={"customerId": b["outside"]["id"], "date": D, "lines": [_line(b["item"])]})

    res = client.get("/api/gst/gstr1", headers=h, params=RANGE)
    assert res.status_code == 200, res.text
    data = res.json()
    s = data["summary"]
    assert s["b2b"]["count"] == 2 and s["b2cl"]["count"] == 1 and s["b2cs"]["count"] == 1 and s["cdnr"]["count"] == 1
    assert s["b2b"]["cgst"] == 4500 and s["b2b"]["sgst"] == 4500 and s["b2b"]["igst"] == 18000
    assert s["b2cl"]["igst"] == 27000

    j = data["json"]
    assert j["gstin"] == "29ABCDE1234F1Z5" and j["fp"] == TODAY.strftime("%m%Y")
    by_ctin = {c["ctin"]: c for c in j["b2b"]}
    mumbai = by_ctin["27AAACM1234A1Z8"]["inv"][0]
    assert mumbai["pos"] == "27" and mumbai["itms"][0]["itm_det"] == {"rt": 18.0, "txval": 100000.0, "iamt": 18000.0, "csamt": 0}
    local = by_ctin["29AAACL1234A1Z2"]["inv"][0]["itms"][0]["itm_det"]
    assert local["camt"] == 4500 and local["samt"] == 4500 and local["iamt"] == 0
    assert j["b2cl"][0]["pos"] == "33"
    assert j["b2cs"] == [
        {"sply_ty": "INTER", "pos": "33", "typ": "OE", "rt": 18.0, "txval": 10000.0, "iamt": 1800.0, "camt": 0.0, "samt": 0.0, "csamt": 0}
    ]
    assert j["cdnr"][0]["nt"][0]["itms"][0]["itm_det"]["iamt"] == 9000
    hsn = {r["hsn_sc"]: r for r in j["hsn"]["hsn_b2b"]}
    # B2B laptops: 1 + 2 sold, 1 credited.
    assert hsn["8471"]["qty"] == 2 and hsn["8471"]["uqc"] == "NOS"
    assert j["doc_issue"]["doc_det"][0]["docs"][0]["totnum"] == 4
    assert data["warnings"] == []

    raw = client.get("/api/gst/gstr1", headers=h, params={**RANGE, "format": "json"})
    assert raw.status_code == 200 and json.loads(raw.content)["fp"] == j["fp"]
    xlsx = client.get("/api/gst/gstr1", headers=h, params={**RANGE, "format": "xlsx"})
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"


def test_gstr3b_liability_itc_and_payment(client, books):
    b, h = books, books["h"]
    _invoice(client, b, b["local"], [_line(b["item"])])  # 4,500 CGST + 4,500 SGST
    _invoice(client, b, b["outside"], [_line(b["item"])])  # 9,000 IGST
    # Inter-state purchase from Tamil Nadu: 1,800 IGST credit; and a reverse-charge bill.
    client.post("/api/bills", headers=h, json={"vendorId": b["vendor"]["id"], "date": D, "lines": [_line(b["service"], 1, 10000)]})
    client.post(
        "/api/bills",
        headers=h,
        json={"vendorId": b["vendor"]["id"], "date": D, "reverseCharge": True, "lines": [_line(b["service"], 1, 5000)]},
    )

    r = client.get("/api/gst/gstr3b", headers=h, params=RANGE).json()
    assert r["outward"]["taxable"] == {"taxable": 100000, "igst": 9000, "cgst": 4500, "sgst": 4500}
    assert r["outward"]["inwardReverseCharge"]["igst"] == 900
    assert r["itc"]["allOther"]["igst"] == 1800 and r["itc"]["reverseCharge"]["igst"] == 900
    assert r["itc"]["net"]["igst"] == 2700
    # 2,700 IGST credit clears 2,700 of the 9,000 IGST; CGST and SGST are paid in cash.
    assert r["payment"]["cashPayable"] == {"igst": 6300, "cgst": 4500, "sgst": 4500}
    assert r["payment"]["reverseChargeCash"]["igst"] == 900


def test_einvoice_and_eway_json_and_registration(client, books):
    b, h = books, books["h"]
    inv = _invoice(client, b, b["outside"], [_line(b["item"]), _line(b["service"])], discountAmount=6000)
    res = client.get(f"/api/gst/invoices/{inv['id']}/einvoice", headers=h)
    assert res.status_code == 200, res.text
    e = json.loads(res.content)
    assert e["TranDtls"]["SupTyp"] == "B2B" and e["DocDtls"]["No"] == inv["invoiceNumber"]
    assert e["SellerDtls"]["Stcd"] == "29" and e["SellerDtls"]["Pin"] == 560001
    assert e["BuyerDtls"]["Gstin"] == "27AAACM1234A1Z8" and e["BuyerDtls"]["Pos"] == "27" and e["BuyerDtls"]["Pin"] == 400053
    # The 6,000 discount is spread 5,000 / 1,000 across the lines before GST.
    assert [i["AssAmt"] for i in e["ItemList"]] == [45000, 9000]
    assert e["ValDtls"]["AssVal"] == 54000 and e["ValDtls"]["IgstVal"] == 9720 and e["ValDtls"]["TotInvVal"] == inv["total"]

    ewb = json.loads(
        client.get(f"/api/gst/invoices/{inv['id']}/eway-bill", headers=h, params={"distance": 980, "vehicleNo": "ka01 ab 1234"}).content
    )
    bill = ewb["billLists"][0]
    assert bill["fromStateCode"] == 29 and bill["toStateCode"] == 27 and bill["vehicleNo"] == "KA01AB1234"
    assert len(bill["itemList"]) == 1 and bill["itemList"][0]["igstRate"] == 18  # services are left out

    consumer_inv = _invoice(client, b, b["consumer"], [_line(b["service"])])
    assert client.get(f"/api/gst/invoices/{consumer_inv['id']}/einvoice", headers=h).status_code == 400

    irn = "a" * 64
    bad = client.put(f"/api/gst/invoices/{inv['id']}/registration", headers=h, json={"irn": "short"})
    assert bad.status_code == 400
    ok = client.put(
        f"/api/gst/invoices/{inv['id']}/registration",
        headers=h,
        json={"irn": irn, "irnAckNo": "112010000000001", "ewayBillNo": "331000000001"},
    )
    assert ok.status_code == 200
    got = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert got["irn"] == irn and got["ewayBillNo"] == "331000000001"
    # An invoice with an IRN is locked against edits.
    edit = client.put(
        f"/api/invoices/{inv['id']}", headers=h, json={"customerId": b["outside"]["id"], "date": D, "lines": [_line(b["item"])]}
    )
    assert edit.status_code == 400


def test_place_of_supply_validation(client, books):
    b, h = books, books["h"]
    bad = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Nowhere", "placeOfSupply": "99"})
    assert bad.status_code == 422
    inv = _invoice(client, b, b["local"], [_line(b["service"])], placeOfSupply="7")
    assert inv["placeOfSupply"] == "07"
    s = client.get("/api/gst/gstr1", headers=h, params=RANGE).json()["summary"]
    assert s["b2b"]["igst"] == 1800  # overridden to Delhi, so inter-state
