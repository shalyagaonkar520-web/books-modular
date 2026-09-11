import io
from unittest.mock import MagicMock, patch

from openpyxl import Workbook


def test_customer_payment_pdf_excel_gmail(client, org):
    h = org["h"]
    # 1. Create invoice and customer payment
    inv_res = client.post("/api/invoices", headers=h, json={
        "customerId": org["customer"]["id"],
        "date": "2026-09-01",
        "dueDate": "2026-09-10",
        "status": "sent",
        "lines": [{"itemId": org["item"]["id"], "description": "27 inch Monitor", "quantity": 1, "rate": 500, "taxRate": 18}],
    })
    assert inv_res.status_code == 201
    inv = inv_res.json()

    cp_res = client.post("/api/customer-payments", headers=h, json={
        "customerId": org["customer"]["id"],
        "invoiceId": inv["id"],
        "bankAccountId": org["bank"]["id"],
        "date": "2026-09-02",
        "amount": 590.0,
        "mode": "bank_transfer",
        "reference": "UTR-CUST-8899",
        "notes": "Full payment received",
    })
    assert cp_res.status_code == 201
    cp = cp_res.json()

    # 2. Download customer payment receipt PDF
    res_pdf = client.get(f"/api/customer-payments/{cp['id']}/pdf", headers=h)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")

    # 3. Export customer payments Excel
    res_excel = client.get("/api/customer-payments/export/excel", headers=h)
    assert res_excel.status_code == 200
    assert "spreadsheetml" in res_excel.headers["content-type"]

    # 4. Export customer payments PDF registry
    res_reg_pdf = client.get("/api/customer-payments/export/pdf", headers=h)
    assert res_reg_pdf.status_code == 200
    assert res_reg_pdf.headers["content-type"] == "application/pdf"

    # 5. Send receipt via Gmail SMTP (mocked)
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_server = MagicMock()
        mock_smtp.return_value = mock_server

        send_res = client.post(f"/api/customer-payments/{cp['id']}/send-gmail", headers=h, json={
            "to_email": "customer@example.com",
            "custom_notes": "Thank you for prompt settlement!",
            "attach_pdf": True,
        })
        assert send_res.status_code == 200
        assert send_res.json()["success"] is True
        assert mock_server.sendmail.called


def test_vendor_payment_pdf_excel_gmail(client, org):
    h = org["h"]
    # 1. Create vendor bill
    bill_res = client.post("/api/bills", headers=h, json={
        "vendorId": org["vendor"]["id"],
        "vendorBillNumber": "VBILL-999",
        "date": "2026-09-01",
        "dueDate": "2026-09-15",
        "status": "open",
        "lines": [{"itemId": org["item"]["id"], "description": "Monitors", "quantity": 2, "rate": 400, "taxRate": 18}],
    })
    assert bill_res.status_code == 201
    bill = bill_res.json()

    # 2. Create vendor payment
    vp_res = client.post("/api/vendor-payments", headers=h, json={
        "vendorId": org["vendor"]["id"],
        "billId": bill["id"],
        "bankAccountId": org["bank"]["id"],
        "date": "2026-09-03",
        "amount": 944.0,
        "mode": "bank_transfer",
        "reference": "NEFT-VND-5544",
        "notes": "Bill cleared",
    })
    assert vp_res.status_code == 201
    vp = vp_res.json()

    # 3. Download vendor payment voucher PDF
    res_pdf = client.get(f"/api/vendor-payments/{vp['id']}/pdf", headers=h)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")

    # 4. Export vendor payments Excel
    res_excel = client.get("/api/vendor-payments/export/excel", headers=h)
    assert res_excel.status_code == 200
    assert "spreadsheetml" in res_excel.headers["content-type"]

    # 5. Export vendor payments PDF registry
    res_reg_pdf = client.get("/api/vendor-payments/export/pdf", headers=h)
    assert res_reg_pdf.status_code == 200
    assert res_reg_pdf.headers["content-type"] == "application/pdf"

    # 6. Send remittance advice via Gmail SMTP (mocked)
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_server = MagicMock()
        mock_smtp.return_value = mock_server

        send_res = client.post(f"/api/vendor-payments/{vp['id']}/send-gmail", headers=h, json={
            "to_email": "vendor@example.com",
            "custom_notes": "Payment processed via NEFT.",
            "attach_pdf": True,
        })
        assert send_res.status_code == 200
        assert send_res.json()["success"] is True
        assert mock_server.sendmail.called


def test_bill_pdf_excel_gmail(client, org):
    h = org["h"]
    bill_res = client.post("/api/bills", headers=h, json={
        "vendorId": org["vendor"]["id"],
        "vendorBillNumber": "INV-SUP-1234",
        "date": "2026-09-01",
        "dueDate": "2026-09-20",
        "status": "open",
        "lines": [{"itemId": org["item"]["id"], "description": "Consulting Services", "quantity": 1, "rate": 250, "taxRate": 18}],
    })
    assert bill_res.status_code == 201
    bill = bill_res.json()

    # PDF & Excel endpoints
    res_pdf = client.get(f"/api/bills/{bill['id']}/pdf", headers=h)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"

    res_excel = client.get(f"/api/bills/{bill['id']}/excel", headers=h)
    assert res_excel.status_code == 200
    assert "spreadsheetml" in res_excel.headers["content-type"]

    res_list_pdf = client.get("/api/bills/export/pdf", headers=h)
    assert res_list_pdf.status_code == 200

    res_list_excel = client.get("/api/bills/export/excel", headers=h)
    assert res_list_excel.status_code == 200

    # Gmail send
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_server = MagicMock()
        mock_smtp.return_value = mock_server

        send_res = client.post(f"/api/bills/{bill['id']}/send-gmail", headers=h, json={
            "to_email": "accounts@vendor.com",
            "custom_notes": "Approved for payment cycle.",
            "attach_pdf": True,
        })
        assert send_res.status_code == 200
        assert send_res.json()["success"] is True


def test_expense_pdf_excel_gmail(client, org):
    h = org["h"]
    exp_account_id = org["accounts"]["5000"]["id"]
    exp_res = client.post("/api/expenses", headers=h, json={
        "accountId": exp_account_id,
        "paidThroughAccountId": org["bank"]["id"],
        "date": "2026-09-02",
        "amount": 1200.0,
        "taxRate": 0,
        "category": "Office Supplies",
        "notes": "Stationery & printing supplies",
    })
    assert exp_res.status_code == 201
    exp = exp_res.json()

    # Export PDF & Excel
    res_pdf = client.get("/api/expenses/export/pdf", headers=h)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"

    res_excel = client.get("/api/expenses/export/excel", headers=h)
    assert res_excel.status_code == 200
    assert "spreadsheetml" in res_excel.headers["content-type"]

    # Gmail send
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_server = MagicMock()
        mock_smtp.return_value = mock_server

        send_res = client.post(f"/api/expenses/{exp['id']}/send-gmail", headers=h, json={
            "to_email": "auditor@rooman.com",
            "recipient_name": "Audit Team",
            "custom_notes": "Verified against tax receipt.",
            "attach_pdf": True,
        })
        assert send_res.status_code == 200
        assert send_res.json()["success"] is True


def test_contacts_pdf_excel_gmail(client, org):
    h = org["h"]
    # PDF & Excel directory exports
    res_pdf = client.get("/api/contacts/export/pdf?type=customer", headers=h)
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"

    res_excel = client.get("/api/contacts/export/excel?type=customer", headers=h)
    assert res_excel.status_code == 200
    assert "spreadsheetml" in res_excel.headers["content-type"]

    # Gmail send to contact
    with patch("backend.services.email_service.smtplib.SMTP") as mock_smtp:
        mock_server = MagicMock()
        mock_smtp.return_value = mock_server

        send_res = client.post(f"/api/contacts/{org['customer']['id']}/send-gmail", headers=h, json={
            "subject": "Monthly Statement of Accounts",
            "message": "Dear Valued Customer, please review your monthly statement of accounts.",
        })
        assert send_res.status_code == 200
        assert send_res.json()["success"] is True


def test_excel_data_input_categorize_and_commit(client, org):
    h = org["h"]
    # Create an in-memory Excel workbook with Customer and Expense sheets
    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Customers"
    ws1.append(["Display Name", "Email", "Phone", "GSTIN"])
    ws1.append(["Titan Industries", "accounts@titan.example.com", "9876543210", "29AAAAA0000A1Z5"])
    ws1.append(["Infosys BPO", "finance@infosys.example.com", "9876543211", "29BBBBB0000B1Z6"])

    ws2 = wb.create_sheet(title="Expenses")
    # Date is a required column: an expense with no date used to be silently
    # posted under today's date, which put it in the wrong period.
    ws2.append(["Category", "Amount", "Date", "Description"])
    ws2.append(["Internet & Broadband", 2500.0, "2026-09-01", "Office fiber high speed"])

    buf = io.BytesIO()
    wb.save(buf)
    excel_bytes = buf.getvalue()

    # Call /api/documents/import-excel-categorize
    cat_res = client.post(
        "/api/documents/import-excel-categorize",
        headers=h,
        files={"file": ("books_import.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert cat_res.status_code == 200
    cat_data = cat_res.json()
    assert cat_data["total_rows"] == 3
    assert len(cat_data["sections"]) == 2

    # Commit the categorized items
    items_to_commit = []
    for sec in cat_data["sections"]:
        for r in sec["rows"]:
            items_to_commit.append({"category": sec["category"], "data": r})

    commit_res = client.post("/api/documents/import-excel-commit", headers=h, json={"items": items_to_commit})
    assert commit_res.status_code == 200
    commit_data = commit_res.json()
    assert commit_data["success"] is True
    assert commit_data["imported_counts"]["customers"] == 2
    assert commit_data["imported_counts"]["expenses"] == 1
