"""Excel/CSV import: column mapping is explicit, and nothing is invented.

The old importer guessed fields by substring ("name" matched Item Name before
Customer Name, "rate" matched Tax Rate before Amount) and the commit step
defaulted anything missing to invented values - a missing amount became 100 or
500, and every imported document was dated today regardless of the sheet.
"""
import io

import openpyxl


def _upload(client, headers, sheets):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for name, rows in sheets.items():
        ws = wb.create_sheet(name)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return client.post(
        "/api/documents/import-excel-categorize",
        headers=headers,
        files={"file": ("import.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )


def test_missing_required_column_is_reported_not_guessed(client, org):
    res = _upload(client, org["h"], {"Invoices": [["Customer Name", "Date"], ["Acme", "2026-09-01"]]})
    assert res.status_code == 200
    body = res.json()
    assert body["ready"] is False
    assert "Amount" in body["blocking_problems"][0]

    # Committing that preview imports nothing and says why.
    commit = client.post("/api/documents/import-excel-commit", headers=org["h"], json={"sections": body["sections"]})
    assert commit.status_code == 200
    assert sum(commit.json()["imported_counts"].values()) == 0
    assert "Amount" in commit.json()["skipped"][0]


def test_columns_are_matched_by_name_not_by_position(client, org):
    """A decoy 'Item Name'/'Tax Rate' must not be mistaken for the real fields."""
    res = _upload(client, org["h"], {
        "Invoices": [
            ["Item Name", "Tax Rate", "Due Date", "Customer Name", "Date", "Amount"],
            ["Laptop", "18", "2026-09-15", "Acme Enterprises", "2026-09-01", "75000"],
        ]
    })
    section = res.json()["sections"][0]
    assert section["mapped_columns"]["display_name"] == "Customer Name"
    assert section["mapped_columns"]["amount"] == "Amount"
    row = section["rows"][0]
    assert row["display_name"] == "Acme Enterprises"
    assert row["amount"] == 75000
    assert row["date"] == "2026-09-01"
    # Unrecognised columns are listed, never silently folded into a field.
    assert set(section["unmapped_headers"]) == {"Item Name", "Tax Rate"}


def test_blank_header_cell_does_not_shift_the_columns(client, org):
    res = _upload(client, org["h"], {"Customers": [["Display Name", "", "Email"], ["Acme", "ignored", "billing@acme.com"]]})
    row = res.json()["sections"][0]["rows"][0]
    assert row["display_name"] == "Acme"
    assert row["email"] == "billing@acme.com"


def test_unreadable_rows_are_skipped_with_a_reason(client, org):
    res = _upload(client, org["h"], {
        "Expenses": [
            ["Payee", "Category", "Amount", "Date", "Notes"],
            ["Good Co", "Rent", "5000", "2026-09-01", "fine"],
            ["Bad Co", "Rent", "not-a-number", "2026-09-02", "bad amount"],
            ["No Date Co", "Rent", "900", "", "missing date"],
        ]
    })
    section = res.json()["sections"][0]
    assert section["count"] == 1
    assert section["skipped_count"] == 2
    reported = {issue["row_number"]: issue["errors"] for issue in section["issues"]}
    assert "Amount is missing or not a number" in reported[3][0]
    assert "Date is missing" in reported[4][0]


def test_import_uses_the_dates_and_amounts_from_the_sheet(client, org):
    res = _upload(client, org["h"], {
        "Invoices": [
            ["Customer Name", "Amount", "Date", "Due Date", "Notes"],
            ["Imported Customer", "12345.50", "2026-09-01", "2026-09-20", "Real note text"],
        ]
    })
    body = res.json()
    assert body["ready"] is True
    commit = client.post("/api/documents/import-excel-commit", headers=org["h"], json={"sections": body["sections"]})
    assert commit.status_code == 200, commit.text
    assert commit.json()["imported_counts"]["invoices"] == 1

    invoice = next(
        i for i in client.get("/api/invoices", headers=org["h"]).json()["items"]
        if i["customerName"] == "Imported Customer"
    )
    assert invoice["date"] == "2026-09-01"
    assert invoice["dueDate"] == "2026-09-20"
    assert invoice["total"] == 12345.50


def test_rules_are_published_for_the_preview(client, org):
    res = _upload(client, org["h"], {"Invoices": [["Customer Name", "Amount", "Date"], ["Acme", "100", "2026-09-01"]]})
    rules = res.json()["sections"][0]["rules"]
    assert [r["label"] for r in rules["required"]] == ["Customer Name", "Amount", "Date"]
    assert "Due Date" in [r["label"] for r in rules["optional"]]
