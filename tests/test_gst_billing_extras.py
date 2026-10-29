"""Features from the Free GST Billing Software comparison: GSTIN check, GSTR-2B
reconciliation, filing calendar and late fees, invoice PDF copies / watermark /
bill of supply / amount in words, and delivery challans."""

import base64
import re
import zlib
from datetime import date, timedelta
from decimal import Decimal

import pytest

from backend.services import gst, gst_returns
from backend.services.words import amount_in_words
from tests.conftest import auth, register_org

TODAY = date.today()
D = (TODAY - timedelta(days=5)).isoformat()
RANGE = {"startDate": (TODAY - timedelta(days=30)).isoformat(), "endDate": TODAY.isoformat()}


def _pdf_text(content: bytes) -> str:
    """The text drawn in a ReportLab PDF (its page streams are ASCII85 + deflate encoded)."""
    out = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", content, re.DOTALL):
        data = match.group(1).strip()
        try:
            out.append(zlib.decompress(base64.a85decode(data.removesuffix(b"~>"))).decode("latin-1"))
        except (ValueError, zlib.error):
            out.append(data.decode("latin-1"))
    return "\n".join(out)


@pytest.fixture
def books(client):
    ctx = register_org(client, "Extras")
    h = auth(ctx["token"])
    # A Karnataka business (GSTIN state 29).
    client.put("/api/organization", headers=h, json={"gstin": "29AAGCB7383J1Z4", "state": "Karnataka"})
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={
            "name": "Current A/c",
            "type": "bank",
            "bankName": "Canara Bank",
            "accountNumber": "0123456789",
            "ifsc": "CNRB0001234",
            "openingBalance": 0,
            "openingBalanceDate": "2026-01-01",
        },
    )
    assert bank.status_code == 201, bank.text
    customer = client.post(
        "/api/contacts",
        headers=h,
        json={"type": "customer", "displayName": "Local Ltd", "gstin": "29AAACL1234A1Z2", "gstTreatment": "registered_business"},
    ).json()
    vendor = client.post(
        "/api/contacts",
        headers=h,
        json={"type": "vendor", "displayName": "Chennai Supplies", "gstin": "33AAACC1234A1Z1", "gstTreatment": "registered_business"},
    ).json()
    item = client.post(
        "/api/items",
        headers=h,
        json={"name": "Laptop", "sku": "LAP-1", "type": "goods", "hsnSac": "8471", "sellingPrice": 1000, "costPrice": 800, "taxRate": 18},
    ).json()
    return {"h": h, "customer": customer, "vendor": vendor, "item": item}


def _line(item, qty=1, rate=1000, tax=18):
    return {"itemId": item["id"], "description": item["name"], "quantity": qty, "rate": rate, "taxRate": tax}


# --- GSTIN ---------------------------------------------------------------------


def test_gstin_checksum_catches_typos():
    assert gst.gstin_checksum_ok("27AAPFU0939F1ZV")
    assert gst.gstin_checksum_ok("29aagcb7383j1z4")
    assert not gst.gstin_checksum_ok("27AAPFU0939F1ZW")  # last character mistyped
    assert not gst.gstin_checksum_ok("27AAPFU0939F1VZ")  # two characters swapped
    assert not gst.gstin_checksum_ok("27AAPFU0939F1Z")


def test_gstin_endpoint_decodes(client, books):
    res = client.get("/api/gst/gstin/27AAPFU0939F1ZV", headers=books["h"])
    assert res.status_code == 200
    body = res.json()
    assert body["stateCode"] == "27" and body["state"] == "Maharashtra"
    assert body["pan"] == "AAPFU0939F" and body["entityType"] == "Firm / LLP" and body["checksumOk"] is True
    assert client.get("/api/gst/gstin/27AAPFU0939F1ZW", headers=books["h"]).json()["checksumOk"] is False
    assert client.get("/api/gst/gstin/123", headers=books["h"]).status_code == 422


def test_utgst_label_for_union_territories():
    assert gst.sgst_label("04") == "UTGST"  # Chandigarh
    assert gst.sgst_label("38") == "UTGST"  # Ladakh
    assert gst.sgst_label("07") == "SGST"  # Delhi has a legislature
    assert gst.sgst_label(None) == "SGST"


# --- Amount in words ------------------------------------------------------------


def test_amount_in_words():
    assert amount_in_words(Decimal("120050.50")) == "Indian Rupees One Lakh Twenty Thousand Fifty and Fifty Paise Only"
    assert amount_in_words(12345678) == "Indian Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only"
    assert amount_in_words(0) == "Indian Rupees Zero Only"
    assert amount_in_words(1234567.25, "USD") == "USD One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven and 25/100 Only"


# --- GSTR-2B reconciliation -------------------------------------------------------


def _bill(client, b, number, rate=1000):
    res = client.post(
        "/api/bills",
        headers=b["h"],
        json={"vendorId": b["vendor"]["id"], "vendorBillNumber": number, "date": D, "lines": [_line(b["item"], rate=rate)]},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _two_b(*invoices):
    return {
        "chksum": "x",
        "data": {
            "gstin": "29AAGCB7383J1Z4",
            "rtnprd": "092026",
            "docdata": {
                "b2b": [
                    {
                        "ctin": "33AAACC1234A1Z1",
                        "trdnm": "CHENNAI SUPPLIES",
                        "inv": [
                            {
                                "inum": inum,
                                "dt": "01-09-2026",
                                "val": val,
                                "itcavl": itc,
                                "items": [{"txval": txval, "igst": round(txval * 0.18, 2), "cgst": 0, "sgst": 0}],
                            }
                            for inum, val, txval, itc in invoices
                        ],
                    }
                ]
            },
        },
    }


def test_gstr2b_reconciliation(client, books):
    b = books
    _bill(client, b, "CS/001")  # matches (number written differently in 2B)
    _bill(client, b, "CS-002")  # 2B shows a different value
    _bill(client, b, "CS-003")  # the supplier has not reported it
    payload = _two_b(("cs001", 1180, 1000, "Y"), ("CS-002", 2360, 2000, "Y"), ("CS-009", 590, 500, "N"))
    res = client.post("/api/gst/gstr2b/reconcile", headers=b["h"], params=RANGE, json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    status = {r["invoiceNumber"]: r["status"] for r in body["rows"]}
    assert status == {"cs001": "matched", "CS-002": "mismatch", "CS-009": "twob_only", "CS-003": "books_only"}
    assert body["counts"] == {"matched": 1, "mismatch": 1, "twobOnly": 1, "booksOnly": 1}
    matched = next(r for r in body["rows"] if r["status"] == "matched")
    assert matched["bookValue"] == 1180 and matched["bookIgst"] == 180 and matched["billId"]
    # ITC the 2B makes available: 180 + 360 (CS-009 is marked not available).
    assert body["itcAvailable"] == 540
    assert body["warnings"] == [] and body["returnPeriod"] == "092026"


def test_gstr2b_rejects_other_files_and_warns_on_gstin(client, books):
    h = books["h"]
    assert client.post("/api/gst/gstr2b/reconcile", headers=h, params=RANGE, json={"foo": 1}).status_code == 422
    other = _two_b()
    other["data"]["gstin"] = "27AAPFU0939F1ZV"
    body = client.post("/api/gst/gstr2b/reconcile", headers=h, params=RANGE, json=other).json()
    assert "27AAPFU0939F1ZV" in body["warnings"][0]


# --- Filing calendar and late fees --------------------------------------------------


def test_late_fee_rules():
    due = date(2026, 5, 20)
    # 10 days late, regular return: 50 a day.
    assert gst_returns.late_fee(due, date(2026, 5, 30))["lateFee"] == 500
    # Capped by turnover: 2,000 up to 1.5 crore, 5,000 up to 5 crore, 10,000 above.
    assert gst_returns.late_fee(due, date(2026, 12, 31), turnover=Decimal("10000000"))["lateFee"] == 2000
    assert gst_returns.late_fee(due, date(2026, 12, 31), turnover=Decimal("30000000"))["lateFee"] == 5000
    assert gst_returns.late_fee(due, date(2026, 12, 31), turnover=Decimal("90000000"))["lateFee"] == 10000
    # NIL return: 20 a day, at most 500.
    assert gst_returns.late_fee(due, date(2026, 5, 25), nil=True)["lateFee"] == 100
    assert gst_returns.late_fee(due, date(2026, 12, 31), nil=True)["lateFee"] == 500
    # On time: nothing. Interest 18% a year on tax paid late: 36,500 x 18% x 10/365 = 180.
    assert gst_returns.late_fee(due, due)["total"] == 0
    assert gst_returns.late_fee(due, date(2026, 5, 30), tax_payable=Decimal("36500"))["interest"] == 180


def test_filing_calendar(client, books):
    b = books
    client.post(
        "/api/invoices", headers=b["h"], json={"customerId": b["customer"]["id"], "date": D, "status": "sent", "lines": [_line(b["item"])]}
    )
    fy = TODAY.year if TODAY.month >= 4 else TODAY.year - 1
    res = client.get("/api/gst/filing-calendar", headers=b["h"], params={"fy": fy})
    assert res.status_code == 200
    periods = res.json()["periods"]
    assert len(periods) == 12 and periods[0]["start"] == f"{fy}-04-01"
    assert periods[0]["gstr1Due"] == f"{fy}-05-11" and periods[0]["gstr3bDue"] == f"{fy}-05-20"
    assert periods[-1]["gstr3bDue"] == f"{fy + 1}-04-20"
    active = next(p for p in periods if p["start"] <= D <= p["end"])
    assert active["invoices"] == 1 and active["nil"] is False

    quarterly = client.get("/api/gst/filing-calendar", headers=b["h"], params={"fy": fy, "quarterly": True}).json()["periods"]
    # Karnataka files its quarterly GSTR-3B by the 22nd.
    assert len(quarterly) == 4 and quarterly[0]["gstr1Due"] == f"{fy}-07-13" and quarterly[0]["gstr3bDue"] == f"{fy}-07-22"

    fee = client.get("/api/gst/late-fee", headers=b["h"], params={"due": "2026-05-20", "filed": "2026-05-30"}).json()
    assert fee["daysLate"] == 10 and fee["lateFee"] == 500 and fee["lateFeeCgst"] == 250


# --- Invoice PDF ------------------------------------------------------------------


def test_invoice_pdf_prints_gst_split_bank_and_words(client, books):
    b = books
    inv = client.post(
        "/api/invoices", headers=b["h"], json={"customerId": b["customer"]["id"], "date": D, "status": "sent", "lines": [_line(b["item"])]}
    ).json()
    res = client.get(f"/api/invoices/{inv['id']}/pdf", headers=b["h"])
    assert res.status_code == 200 and res.content.startswith(b"%PDF")
    text = _pdf_text(res.content)
    assert "TAX INVOICE" in text and "8471" in text
    assert "CGST" in text and "SGST" in text and "IGST" not in text
    assert "Canara Bank" in text and "0123456789" in text and "HDFC" not in text
    assert "One Thousand One Hundred Eighty" in text
    assert "29-Karnataka" in text
    assert "(DRAFT) Tj" not in text


def test_invoice_pdf_copies_and_watermark(client, books):
    b = books
    inv = client.post(
        "/api/invoices", headers=b["h"], json={"customerId": b["customer"]["id"], "date": D, "lines": [_line(b["item"])]}
    ).json()
    h = b["h"]
    draft = _pdf_text(client.get(f"/api/invoices/{inv['id']}/pdf", headers=h).content)
    # The watermark is drawn on its own, apart from the "Status: DRAFT" line.
    assert "(DRAFT) Tj" in draft
    assert "(DRAFT) Tj" not in _pdf_text(client.get(f"/api/invoices/{inv['id']}/pdf", headers=h, params={"watermark": ""}).content)
    assert "(SAMPLE) Tj" in _pdf_text(client.get(f"/api/invoices/{inv['id']}/pdf", headers=h, params={"watermark": "Sample"}).content)
    three = _pdf_text(client.get(f"/api/invoices/{inv['id']}/pdf", headers=h, params={"copies": "original,duplicate,triplicate"}).content)
    for label in ("ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR SUPPLIER"):
        assert label in three
    assert client.get(f"/api/invoices/{inv['id']}/pdf", headers=h, params={"copies": "fourth"}).status_code == 422


def test_bill_of_supply(client, books):
    b = books
    body = {"customerId": b["customer"]["id"], "date": D, "status": "sent", "documentType": "bill_of_supply"}
    refused = client.post("/api/invoices", headers=b["h"], json={**body, "lines": [_line(b["item"])]})
    assert refused.status_code == 400 and "bill of supply" in refused.json()["detail"].lower()
    res = client.post("/api/invoices", headers=b["h"], json={**body, "lines": [_line(b["item"], tax=0)]})
    assert res.status_code == 201, res.text
    inv = res.json()
    assert inv["documentType"] == "bill_of_supply" and inv["taxTotal"] == 0
    text = _pdf_text(client.get(f"/api/invoices/{inv['id']}/pdf", headers=b["h"]).content)
    assert "BILL OF SUPPLY" in text and "TAX INVOICE" not in text and "CGST" not in text


# --- Delivery challans ---------------------------------------------------------------


def test_delivery_challan_flow(client, books):
    b, h = books, books["h"]
    res = client.post(
        "/api/delivery-challans",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "date": D,
            "reason": "Supply on approval",
            "status": "issued",
            "lines": [_line(b["item"], 2)],
        },
    )
    assert res.status_code == 201, res.text
    dc = res.json()
    assert dc["number"].startswith("DC-") and dc["status"] == "issued" and dc["reason"] == "Supply on approval" and dc["total"] == 2360
    # A challan posts nothing: no receivable yet.
    assert client.get("/api/invoices", headers=h).json()["total"] == 0
    pdf = client.get(f"/api/delivery-challans/{dc['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and "DELIVERY CHALLAN" in _pdf_text(pdf.content)

    conv = client.post(f"/api/delivery-challans/{dc['id']}/convert-to-invoice", headers=h, json={"issue": True})
    assert conv.status_code == 200, conv.text
    inv_id = conv.json()["id"]
    again = client.get(f"/api/delivery-challans/{dc['id']}", headers=h).json()
    assert again["status"] == "invoiced" and again["invoiceId"] == inv_id
    assert (
        client.put(
            f"/api/delivery-challans/{dc['id']}",
            headers=h,
            json={"customerId": b["customer"]["id"], "date": D, "lines": [_line(b["item"])]},
        ).status_code
        == 400
    )

    # Voiding the invoice frees the challan to be invoiced again.
    assert client.post(f"/api/invoices/{inv_id}/status", headers=h, json={"status": "void"}).status_code == 200
    assert client.get(f"/api/delivery-challans/{dc['id']}", headers=h).json()["status"] == "issued"


# --- Search, bulk item edit, reports --------------------------------------------------


def test_search_finds_records(client, books):
    b, h = books, books["h"]
    inv = client.post(
        "/api/invoices", headers=h, json={"customerId": b["customer"]["id"], "date": D, "status": "sent", "lines": [_line(b["item"])]}
    ).json()
    results = client.get("/api/dashboard/search", headers=h, params={"q": "lap"}).json()["results"]
    assert {
        "kind": "item",
        "id": b["item"]["id"],
        "title": "Laptop",
        "subtitle": "LAP-1",
        "to": f"/items/{b['item']['id']}/edit",
    } in results
    by_number = client.get("/api/dashboard/search", headers=h, params={"q": inv["invoiceNumber"].lower()}).json()["results"]
    assert by_number[0]["kind"] == "invoice" and by_number[0]["to"] == f"/invoices/{inv['id']}"
    by_gstin = client.get("/api/dashboard/search", headers=h, params={"q": "33AAACC"}).json()["results"]
    assert [r["kind"] for r in by_gstin] == ["vendor"]
    # Another organisation's records never show up.
    other = auth(register_org(client, "Other")["token"])
    assert client.get("/api/dashboard/search", headers=other, params={"q": "lap"}).json()["results"] == []


def test_bulk_item_update(client, books):
    h = books["h"]
    second = client.post(
        "/api/items", headers=h, json={"name": "Mouse", "sku": "MS-1", "type": "goods", "sellingPrice": 200, "taxRate": 12}
    ).json()
    ids = [books["item"]["id"], second["id"]]
    res = client.post("/api/items/bulk-update", headers=h, json={"ids": ids, "taxRate": 18, "hsnSac": "8471", "priceChangePercent": 10})
    assert res.status_code == 200, res.text
    items = {i["id"]: i for i in client.get("/api/items", headers=h).json()["items"]}
    assert items[ids[0]]["sellingPrice"] == 1100 and items[ids[1]]["sellingPrice"] == 220
    assert all(items[i]["taxRate"] == 18 and items[i]["hsnSac"] == "8471" for i in ids)
    assert client.post("/api/items/bulk-update", headers=h, json={"ids": ids}).status_code == 400
    assert client.post("/api/items/bulk-update", headers=h, json={"ids": ["nope"], "taxRate": 5}).status_code == 404


def test_customer_payment_behaviour_and_sales_by_item(client, books):
    b, h = books, books["h"]
    bank = next(a for a in client.get("/api/banking/accounts", headers=h).json() if a["type"] == "bank")
    inv = client.post(
        "/api/invoices", headers=h, json={"customerId": b["customer"]["id"], "date": D, "status": "sent", "lines": [_line(b["item"], 2)]}
    ).json()
    pay = client.post(
        "/api/customer-payments",
        headers=h,
        json={
            "customerId": b["customer"]["id"],
            "invoiceId": inv["id"],
            "bankAccountId": bank["id"],
            "date": TODAY.isoformat(),
            "amount": inv["total"],
            "mode": "upi",
        },
    )
    assert pay.status_code == 201, pay.text
    client.post(
        "/api/invoices", headers=h, json={"customerId": b["customer"]["id"], "date": D, "status": "sent", "lines": [_line(b["item"])]}
    )

    rows = client.get("/api/reports/customer-payment-behaviour", headers=h, params=RANGE).json()["rows"]
    assert len(rows) == 1
    row = rows[0]
    assert row["invoices"] == 2 and row["paid"] == 1 and row["avgDaysToPay"] == 5 and row["onTimePercent"] == 100
    assert row["outstanding"] == 1180

    sales = client.get("/api/reports/sales-by-item", headers=h, params=RANGE).json()
    assert sales["total"] == 3000
    assert sales["rows"][0] == {
        "itemId": b["item"]["id"],
        "name": "Laptop",
        "sku": "LAP-1",
        "quantity": 3,
        "sales": 3000,
        "invoices": 2,
        "sharePercent": 100,
    }
