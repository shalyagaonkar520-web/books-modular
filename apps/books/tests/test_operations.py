import io
from datetime import date, timedelta

from tests.conftest import invite_and_accept, trial_balance_ok


def test_projects_time_and_invoicing(client, org):
    h = org["h"]
    proj = client.post("/api/projects", headers=h, json={"name": "ERP Rollout", "customerId": org["customer"]["id"], "hourlyRate": 2000, "budgetHours": 100})
    assert proj.status_code == 201, proj.text
    pid = proj.json()["id"]
    assert client.post("/api/time-entries", headers=h, json={"projectId": pid, "date": "2026-09-01", "hours": 30}).status_code == 422
    e1 = client.post("/api/time-entries", headers=h, json={"projectId": pid, "date": "2026-09-01", "hours": 4, "description": "Discovery"})
    e2 = client.post("/api/time-entries", headers=h, json={"projectId": pid, "date": "2026-09-02", "hours": 2.5, "isBillable": False})
    assert e1.status_code == 201 and e2.status_code == 201
    detail = client.get(f"/api/projects/{pid}", headers=h).json()
    assert detail["loggedHours"] == 6.5 and detail["billableHours"] == 4 and detail["unbilledAmount"] == 8000
    inv = client.post("/api/time-entries/invoice", headers=h, json={"projectId": pid, "date": "2026-09-03", "taxRate": 18})
    assert inv.status_code == 201, inv.text
    assert inv.json()["total"] == 9440 and inv.json()["projectId"] == pid
    assert client.get(f"/api/projects/{pid}", headers=h).json()["unbilledHours"] == 0
    assert client.put(f"/api/time-entries/{e1.json()['id']}", headers=h, json={"hours": 5}).status_code == 400
    assert client.post("/api/time-entries/invoice", headers=h, json={"projectId": pid, "date": "2026-09-03"}).status_code == 400
    assert client.delete(f"/api/projects/{pid}", headers=h).json()["message"].startswith("Project has invoiced time")
    assert trial_balance_ok(client, h)


def test_document_upload_download_and_limits(client, org):
    h = org["h"]
    content = b"%PDF-1.4 test document"
    res = client.post("/api/documents", headers=h, files={"file": ("invoice.pdf", io.BytesIO(content), "application/pdf")}, data={"title": "Vendor invoice", "category": "bill"})
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["sizeBytes"] == len(content) and len(doc["sha256"]) == 64 and doc["uploadedByName"]
    dl = client.get(f"/api/documents/{doc['id']}/download", headers=h)
    assert dl.status_code == 200 and dl.content == content
    listing = client.get("/api/documents", headers=h, params={"category": "bill"}).json()
    assert listing["total"] >= 1
    bad_type = client.post("/api/documents", headers=h, files={"file": ("x.exe", io.BytesIO(b"MZ"), "application/x-msdownload")})
    assert bad_type.status_code == 400
    empty = client.post("/api/documents", headers=h, files={"file": ("e.txt", io.BytesIO(b""), "text/plain")})
    assert empty.status_code == 400
    assert client.patch(f"/api/documents/{doc['id']}", headers=h, json={"category": "tax"}).json()["category"] == "tax"
    assert client.delete(f"/api/documents/{doc['id']}", headers=h).status_code == 200
    assert client.get(f"/api/documents/{doc['id']}/download", headers=h).status_code == 404


def test_payroll_cycle(client, org):
    h = org["h"]
    emp = client.post("/api/payroll/employees", headers=h, json={"name": "Asha Rao", "dateOfJoining": "2026-01-15", "basicSalary": 50000, "hra": 20000, "otherAllowances": 5000, "pfEmployee": 1800, "professionalTax": 200, "tds": 2000, "bankAccountNumber": "123456789012"})
    assert emp.status_code == 201, emp.text
    e = emp.json()
    assert e["employeeCode"].startswith("EMP-") and e["grossSalary"] == 75000 and e["netSalary"] == 71000
    assert e["bankAccountNumberMasked"].endswith("9012") and e["bankAccountNumberMasked"].startswith("*")
    run = client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": 2026, "periodMonth": 8, "lossOfPay": {e["id"]: 3.1}})
    assert run.status_code == 201, run.text
    r = run.json()
    slip = r["payslips"][0]
    assert slip["lossOfPayDays"] == 3.1 and slip["lossOfPayAmount"] == 7500 and slip["gross"] == 67500 and slip["netPay"] == 63500
    assert client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": 2026, "periodMonth": 8}).status_code == 409
    assert client.post(f"/api/payroll/pay-runs/{r['id']}/pay", headers=h, json={"bankAccountId": org["bank"]["id"], "payDate": "2026-09-01"}).status_code == 400
    assert client.post(f"/api/payroll/pay-runs/{r['id']}/approve", headers=h).status_code == 200
    paid = client.post(f"/api/payroll/pay-runs/{r['id']}/pay", headers=h, json={"bankAccountId": org["bank"]["id"], "payDate": "2026-09-01"})
    assert paid.status_code == 200 and paid.json()["status"] == "paid"
    assert client.delete(f"/api/payroll/pay-runs/{r['id']}", headers=h).status_code == 400
    journals = client.get("/api/accounting/journals", headers=h, params={"source_type": "payroll"}).json()["items"]
    entry = journals[0]
    assert sum(line["debit"] for line in entry["lines"] if line["accountCode"] == "6400") == 67500
    assert sum(line["credit"] for line in entry["lines"] if line["accountCode"] == "2310") == 1800
    assert client.get(f"/api/payroll/payslips/{slip['id']}", headers=h).json()["employeeName"] == "Asha Rao"
    assert trial_balance_ok(client, h)


def test_payroll_requires_admin(client, org):
    h = org["h"]
    invite_and_accept(client, h, "Staffer", "staff@rooman.example.com", "staff", "Staff12345")
    login = client.post("/api/auth/login", json={"email": "staff@rooman.example.com", "password": "Staff12345"}).json()
    sh = {"Authorization": f"Bearer {login['accessToken']}"}
    assert client.get("/api/payroll/employees", headers=sh).status_code == 200
    assert client.post("/api/payroll/pay-runs", headers=sh, json={"periodYear": 2026, "periodMonth": 7}).status_code == 403


def test_reports_and_dashboard_consistency(client, org):
    h = org["h"]
    # An invoice whose due date has already passed, so aging and notifications have something to report.
    overdue = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": org["customer"]["id"], "date": "2026-01-05", "dueDate": "2026-01-20", "status": "sent",
            "lines": [{"itemId": org["service"]["id"], "description": "Consulting", "quantity": 2, "rate": 2500, "taxRate": 18}],
        },
    )
    assert overdue.status_code == 201, overdue.text
    assert overdue.json()["status"] == "overdue"
    pl = client.get("/api/reports/profit-and-loss", headers=h, params={"start_date": "2026-04-01", "end_date": "2027-03-31"}).json()
    assert pl["grossProfit"] == round(pl["income"]["total"] - pl["costOfGoodsSold"]["total"], 2)
    assert pl["netProfit"] == round(pl["operatingProfit"] + pl["otherIncome"]["total"], 2)
    bs = client.get("/api/reports/balance-sheet", headers=h).json()
    assert bs["isBalanced"] is True
    aging = client.get("/api/reports/receivables-aging", headers=h).json()
    assert aging["total"] == round(sum(r["total"] for r in aging["rows"]), 2)
    assert aging["total"] == round(sum(b["amount"] for b in aging["buckets"]), 2)
    payables = client.get("/api/reports/payables-aging", headers=h).json()
    dash = client.get("/api/dashboard/summary", headers=h, params={"period": "this_fiscal_year"}).json()
    assert dash["receivables"]["totalReceivables"] == aging["total"]
    assert dash["payables"]["totalPayables"] == payables["total"]
    assert dash["totalCash"] == client.get("/api/banking/summary", headers=h).json()["totalBalance"]
    assert dash["cashFlow"]["closingBalance"] == round(dash["cashFlow"]["openingBalance"] + dash["cashFlow"]["netCashFlow"], 2)
    assert len(dash["cashFlow"]["breakdown"]) == 12
    monthly = client.get("/api/dashboard/summary", headers=h, params={"period": "this_month"}).json()
    assert 4 <= len(monthly["cashFlow"]["breakdown"]) <= 5
    assert client.get("/api/dashboard/summary", headers=h, params={"period": "bogus"}).status_code == 422
    inv = client.get("/api/reports/inventory-summary", headers=h).json()
    assert inv["trackedItems"] >= 1 and inv["totalStockValue"] == round(sum(r["stockValue"] for r in inv["rows"]), 2)
    sales = client.get("/api/reports/sales-by-customer", headers=h).json()
    assert sales["total"] == round(sum(r["amount"] for r in sales["rows"]), 2)
    tax = client.get("/api/reports/tax-summary", headers=h).json()
    assert tax["netPayable"] == round(tax["outputGst"] - tax["inputGst"], 2)
    notes = client.get("/api/dashboard/notifications", headers=h).json()
    assert notes["count"] == len(notes["items"])
    assert any(n["kind"] == "overdue_invoice" for n in notes["items"])


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy" and res.json()["database"] == "ok"


def test_aging_report_uses_unambiguous_bucket_field_names(client, org):
    """The ageing bucket keys must not collide once camelCased (days_1_30 -> days130 is
    ambiguous over the wire), and each row's buckets must sum to its own total."""
    h = org["h"]
    today = date.today()
    # A dedicated customer keeps this test's totals isolated from invoices other
    # tests raise against the shared org fixture's default customer.
    customer = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Aging Field Name Customer", "paymentTermsDays": 30}
    ).json()

    # 45 days overdue lands in the 31-60 day bucket; a fresh sent invoice is still current.
    overdue_due_date = (today - timedelta(days=45)).isoformat()
    overdue_date = (today - timedelta(days=60)).isoformat()
    current_due_date = (today + timedelta(days=10)).isoformat()

    overdue = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer["id"], "date": overdue_date, "dueDate": overdue_due_date, "status": "sent",
            "lines": [{"itemId": org["service"]["id"], "description": "Overdue consulting", "quantity": 1, "rate": 4000, "taxRate": 0}],
        },
    )
    assert overdue.status_code == 201, overdue.text
    assert overdue.json()["status"] == "overdue"

    current = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer["id"], "date": today.isoformat(), "dueDate": current_due_date, "status": "sent",
            "lines": [{"itemId": org["service"]["id"], "description": "Fresh consulting", "quantity": 1, "rate": 1000, "taxRate": 0}],
        },
    )
    assert current.status_code == 201, current.text

    report = client.get("/api/reports/receivables-aging", headers=h).json()
    row = next(r for r in report["rows"] if r["contactId"] == customer["id"])

    # The exact wire field names a client must use.
    for key in ("current", "days1To30", "days31To60", "days61To90", "daysOver90", "total"):
        assert key in row, f"expected explicit field '{key}' in aging row, got {sorted(row.keys())}"
    assert not any(k.startswith("days_") for k in row), "aging rows must not leak snake_case keys"

    assert row["current"] == 1000.0
    assert row["days31To60"] == 4000.0
    assert row["days1To30"] == 0.0
    assert row["days61To90"] == 0.0
    assert row["daysOver90"] == 0.0
    assert row["total"] == 5000.0
    assert row["total"] == round(row["current"] + row["days1To30"] + row["days31To60"] + row["days61To90"] + row["daysOver90"], 2)

    # Org-wide buckets aggregate every customer, so only assert this invoice's
    # contribution is reflected rather than an exact total other tests could affect.
    bucket_31_60 = next(b for b in report["buckets"] if b["label"] == "31-60 days")
    assert bucket_31_60["amount"] >= 4000.0
    assert bucket_31_60["count"] >= 1
