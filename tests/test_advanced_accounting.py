"""Fixed assets, budgets, multi-currency invoices / bills / payments and recurring journals."""

from datetime import date, timedelta

import pytest

from tests.conftest import auth, register_org, trial_balance_ok

TODAY = date.today()


@pytest.fixture
def books(client):
    ctx = register_org(client, "Adv")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Bank", "type": "bank", "openingBalance": 1000000, "openingBalanceDate": "2025-01-01"},
    ).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "bank": bank, "accounts": accounts}


def _balance(client, h, code):
    return next(a for a in client.get("/api/accounting/accounts", headers=h).json() if a["code"] == code)["balance"]


# --------------------------------------------------------------------------- #
# Fixed assets
# --------------------------------------------------------------------------- #
def test_straight_line_depreciation_and_disposal(client, books):
    h = books["h"]
    start = date(TODAY.year - 1, TODAY.month, 1)
    res = client.post(
        "/api/fixed-assets",
        headers=h,
        json={
            "name": "Delivery van",
            "category": "Vehicles",
            "purchaseDate": start.isoformat(),
            "cost": 130000,
            "salvageValue": 10000,
            "usefulLifeMonths": 24,
            "postOpeningBalance": True,
        },
    )
    assert res.status_code == 201, res.text
    asset = res.json()
    assert asset["assetNumber"].startswith("FA-") and asset["monthlyDepreciation"] == 5000
    assert _balance(client, h, "1500") == 130000

    # Through the month end three months after purchase: 3 months of 5,000 (the first month end counts).
    through = (date(start.year, start.month, 1) + timedelta(days=95)).replace(day=1) - timedelta(days=1)
    run = client.post("/api/fixed-assets/run-depreciation", headers=h, json={"through": through.isoformat()}).json()
    assert run["posted"] == 3 and run["amount"] == 15000
    got = client.get(f"/api/fixed-assets/{asset['id']}", headers=h).json()
    assert got["accumulatedDepreciation"] == 15000 and got["bookValue"] == 115000
    assert _balance(client, h, "1590") == -15000  # contra-asset: a credit balance
    assert _balance(client, h, "6950") == 15000
    # Running again for the same period posts nothing new.
    assert client.post("/api/fixed-assets/run-depreciation", headers=h, json={"through": through.isoformat()}).json()["posted"] == 0
    assert len(client.get(f"/api/fixed-assets/{asset['id']}/schedule", headers=h).json()) == 3

    # Undo the last month, then dispose: depreciation catches up to the month before, gain/loss booked.
    assert client.post(f"/api/fixed-assets/{asset['id']}/undo-depreciation", headers=h).json()["accumulatedDepreciation"] == 10000
    disposal_date = through + timedelta(days=1)  # first day of the following month
    sold = client.post(
        f"/api/fixed-assets/{asset['id']}/dispose",
        headers=h,
        json={"date": disposal_date.isoformat(), "proceeds": 120000, "bankAccountId": books["bank"]["id"]},
    )
    assert sold.status_code == 200, sold.text
    body = sold.json()
    assert body["status"] == "disposed" and body["accumulatedDepreciation"] == 15000
    # Book value 115,000 sold for 120,000: 5,000 gain.
    assert _balance(client, h, "4950") == 5000
    assert _balance(client, h, "1500") == 0
    assert trial_balance_ok(client, h)
    # Disposed assets cannot be deleted until the disposal is undone.
    assert client.delete(f"/api/fixed-assets/{asset['id']}", headers=h).status_code == 400
    assert client.post(f"/api/fixed-assets/{asset['id']}/undo-disposal", headers=h).json()["status"] == "active"
    assert _balance(client, h, "4950") == 0


def test_declining_balance_and_salvage_cap(client, books):
    h = books["h"]
    start = date(TODAY.year - 2, 1, 1)
    asset = client.post(
        "/api/fixed-assets",
        headers=h,
        json={"name": "Laptop", "purchaseDate": start.isoformat(), "cost": 12000, "salvageValue": 11900, "method": "declining", "rate": 40},
    ).json()
    # 40% a year of 12,000 is 400 a month, but only 100 is left above salvage.
    assert asset["monthlyDepreciation"] == 100
    run = client.post("/api/fixed-assets/run-depreciation", headers=h, json={}).json()
    assert run["posted"] == 1
    assert client.get(f"/api/fixed-assets/{asset['id']}", headers=h).json()["status"] == "fully_depreciated"
    bad = client.post(
        "/api/fixed-assets", headers=h, json={"name": "X", "purchaseDate": start.isoformat(), "cost": 100, "method": "declining"}
    )
    assert bad.status_code == 422


# --------------------------------------------------------------------------- #
# Budgets
# --------------------------------------------------------------------------- #
def test_budget_vs_actual(client, books):
    h, acc = books["h"], books["accounts"]
    start = date(TODAY.year, TODAY.month, 1)
    res = client.post(
        "/api/budgets",
        headers=h,
        json={
            "name": "FY plan",
            "startDate": start.isoformat(),
            "lines": [
                {"accountId": acc["4000"]["id"], "amounts": [50000] * 12},
                {"accountId": acc["6300"]["id"], "amounts": [10000] * 12},
            ],
        },
    )
    assert res.status_code == 201, res.text
    budget = res.json()
    assert budget["totalIncome"] == 600000 and budget["totalExpense"] == 120000
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Buyer"}).json()
    client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer["id"],
            "date": TODAY.isoformat(),
            "status": "sent",
            "lines": [{"accountId": acc["4000"]["id"], "description": "Sale", "quantity": 1, "rate": 60000, "taxRate": 0}],
        },
    )
    client.post(
        "/api/expenses",
        headers=h,
        json={
            "date": TODAY.isoformat(),
            "accountId": acc["6300"]["id"],
            "paidThroughAccountId": books["bank"]["id"],
            "amount": 12000,
            "category": "Rent",
        },
    )

    r = client.get(f"/api/budgets/{budget['id']}/vs-actual", headers=h).json()
    rows = {row["code"]: row for row in r["rows"]}
    assert rows["4000"]["budget"] == 50000 and rows["4000"]["actual"] == 60000 and rows["4000"]["favourable"] is True
    assert rows["6300"]["variance"] == 2000 and rows["6300"]["favourable"] is False
    assert r["profitBudget"] == 40000 and r["profitActual"] == 48000
    bad = client.post(
        "/api/budgets",
        headers=h,
        json={"name": "x", "startDate": start.isoformat(), "lines": [{"accountId": acc["1100"]["id"], "amounts": [1] * 12}]},
    )
    assert bad.status_code == 400


# --------------------------------------------------------------------------- #
# Multi-currency
# --------------------------------------------------------------------------- #
def test_foreign_currency_invoice_payment_and_exchange_gain(client, books):
    h = books["h"]
    assert client.put("/api/currencies/USD", headers=h, json={"exchangeRate": 83}).status_code == 200
    listed = {c["code"]: c for c in client.get("/api/currencies", headers=h).json()}
    assert listed["INR"]["isBase"] and listed["USD"]["exchangeRate"] == 83
    customer = client.post(
        "/api/contacts", headers=h, json={"type": "customer", "displayName": "Acme Inc", "currency": "USD", "gstTreatment": "overseas"}
    ).json()
    assert customer["currency"] == "USD"

    res = client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": customer["id"],
            "date": TODAY.isoformat(),
            "status": "sent",
            "lines": [{"description": "Consulting", "quantity": 10, "rate": 100, "taxRate": 0}],
        },
    )
    assert res.status_code == 201, res.text
    inv = res.json()
    assert inv["currency"] == "USD" and inv["exchangeRate"] == 83
    assert inv["fcTotal"] == 1000 and inv["total"] == 83000 and inv["fcBalanceDue"] == 1000
    assert inv["lines"][0]["fcRate"] == 100 and inv["lines"][0]["rate"] == 8300
    assert _balance(client, h, "1100") == 83000
    pdf = client.get(f"/api/invoices/{inv['id']}/pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # Half paid at 84: the bank gets 42,000; receivables drop by 41,500; 500 gain.
    pay = client.post(
        "/api/customer-payments",
        headers=h,
        json={
            "customerId": customer["id"],
            "invoiceId": inv["id"],
            "bankAccountId": books["bank"]["id"],
            "date": TODAY.isoformat(),
            "amount": 500,
            "exchangeRate": 84,
        },
    )
    assert pay.status_code == 201, pay.text
    after = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert after["fcAmountPaid"] == 500 and after["fcBalanceDue"] == 500 and after["status"] == "partially_paid"
    assert _balance(client, h, "1100") == 41500
    assert _balance(client, h, "7100") == -500  # gain: credit on an expense-type account
    # The rest at 82: 41,000 in, 41,500 cleared, 500 loss; the invoice is paid.
    client.post(
        "/api/customer-payments",
        headers=h,
        json={
            "customerId": customer["id"],
            "invoiceId": inv["id"],
            "bankAccountId": books["bank"]["id"],
            "date": TODAY.isoformat(),
            "amount": 500,
            "exchangeRate": 82,
        },
    )
    paid = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert paid["status"] == "paid" and _balance(client, h, "1100") == 0 and _balance(client, h, "7100") == 0
    assert trial_balance_ok(client, h)

    # Deleting a payment puts the foreign balance back.
    first = client.get("/api/customer-payments", headers=h, params={"invoice_id": inv["id"]}).json()["items"][0]
    assert client.delete(f"/api/customer-payments/{first['id']}", headers=h).status_code == 200
    back = client.get(f"/api/invoices/{inv['id']}", headers=h).json()
    assert back["fcBalanceDue"] == 500 and back["status"] == "partially_paid"
    assert trial_balance_ok(client, h)

    # Overpaying the foreign balance is refused; a missing rate falls back to the saved one.
    over = client.post(
        "/api/customer-payments",
        headers=h,
        json={
            "customerId": customer["id"],
            "invoiceId": inv["id"],
            "bankAccountId": books["bank"]["id"],
            "date": TODAY.isoformat(),
            "amount": 600,
        },
    )
    assert over.status_code == 400


def test_foreign_bill_and_missing_rate(client, books):
    h = books["h"]
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "EU GmbH", "currency": "EUR"}).json()
    no_rate = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": vendor["id"],
            "date": TODAY.isoformat(),
            "lines": [{"description": "Licence", "quantity": 1, "rate": 200, "taxRate": 0}],
        },
    )
    assert no_rate.status_code == 400 and "exchange rate" in no_rate.json()["detail"]
    bill = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": vendor["id"],
            "date": TODAY.isoformat(),
            "exchangeRate": 90,
            "lines": [{"accountId": books["accounts"]["6800"]["id"], "description": "Licence", "quantity": 1, "rate": 200, "taxRate": 0}],
        },
    ).json()
    assert bill["fcTotal"] == 200 and bill["total"] == 18000 and bill["currency"] == "EUR"
    pay = client.post(
        "/api/vendor-payments",
        headers=h,
        json={
            "vendorId": vendor["id"],
            "billId": bill["id"],
            "bankAccountId": books["bank"]["id"],
            "date": TODAY.isoformat(),
            "amount": 200,
            "exchangeRate": 91,
        },
    )
    assert pay.status_code == 201, pay.text
    # Paid 18,200 for an 18,000 payable: 200 exchange loss.
    assert _balance(client, h, "7100") == 200
    assert client.get(f"/api/bills/{bill['id']}", headers=h).json()["status"] == "paid"
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# Recurring journals
# --------------------------------------------------------------------------- #
def test_recurring_journal(client, books):
    h, acc = books["h"], books["accounts"]
    template = {
        "reference": "Monthly accrual",
        "lines": [
            {"accountId": acc["6300"]["id"], "debit": 25000, "credit": 0, "description": "Rent accrual"},
            {"accountId": acc["2300"]["id"], "debit": 0, "credit": 25000, "description": "Rent accrual"},
        ],
    }
    start = TODAY - timedelta(days=40)
    res = client.post(
        "/api/recurring-profiles",
        headers=h,
        json={"name": "Rent accrual", "kind": "journal", "frequency": "monthly", "startDate": start.isoformat(), "template": template},
    )
    assert res.status_code == 201, res.text
    profile = res.json()
    assert profile["total"] == 25000 and profile["contactName"] == ""
    run = client.post(f"/api/recurring-profiles/{profile['id']}/run", headers=h).json()
    assert len(run["created"]) == 2 and run["errors"] == []
    assert _balance(client, h, "6300") == 50000
    docs = client.get(f"/api/recurring-profiles/{profile['id']}/documents", headers=h).json()
    assert len(docs) == 2 and docs[0]["number"].startswith("JRN-")
    unbalanced = {**template, "lines": [template["lines"][0], {**template["lines"][1], "credit": 1}]}
    assert (
        client.post(
            "/api/recurring-profiles",
            headers=h,
            json={"name": "Bad", "kind": "journal", "startDate": start.isoformat(), "template": unbalanced},
        ).status_code
        == 400
    )
    assert trial_balance_ok(client, h)
