"""Upper bounds on user-entered numbers.

Money is stored as Numeric(14, 2) and quantities as Numeric(14, 3). Without a
ceiling in the schema an oversized figure reached the database and came back as
a 500 from the driver instead of a validation error, so every hand-entered
amount is capped. These tests pin the cap on each entry point and check that
ordinary values still go through.
"""

import pytest

HUGE = 999999999999999999.99


def _income_account(client, org):
    return next(a for a in client.get("/api/accounting/accounts", headers=org["h"]).json() if a["type"] == "income")


def _expense_account(client, org):
    return next(a for a in client.get("/api/accounting/accounts", headers=org["h"]).json() if a["type"] == "expense")


def test_item_prices_are_capped(client, org):
    h = org["h"]
    res = client.post("/api/items", headers=h, json={"name": "Overflow", "sku": "OVF-1", "sellingPrice": HUGE})
    assert res.status_code == 422, res.text
    res = client.post("/api/items", headers=h, json={"name": "Overflow2", "sku": "OVF-2", "costPrice": HUGE})
    assert res.status_code == 422, res.text


def test_invoice_line_rate_and_quantity_are_capped(client, org):
    h = org["h"]
    base = {"customerId": org["customer"]["id"], "date": "2026-09-01"}
    res = client.post(
        "/api/invoices", headers=h, json={**base, "lines": [{"description": "Big rate", "quantity": 1, "rate": HUGE, "taxRate": 0}]}
    )
    assert res.status_code == 422, res.text
    res = client.post(
        "/api/invoices", headers=h, json={**base, "lines": [{"description": "Big qty", "quantity": HUGE, "rate": 1, "taxRate": 0}]}
    )
    assert res.status_code == 422, res.text


def test_journal_entry_amounts_are_capped(client, org):
    h = org["h"]
    income, expense = _income_account(client, org), _expense_account(client, org)
    res = client.post(
        "/api/accounting/journals",
        headers=h,
        json={
            "date": "2026-09-01",
            "notes": "Overflow",
            "lines": [{"accountId": expense["id"], "debit": HUGE, "credit": 0}, {"accountId": income["id"], "debit": 0, "credit": HUGE}],
        },
    )
    assert res.status_code == 422, res.text

    ok = client.post(
        "/api/accounting/journals",
        headers=h,
        json={
            "date": "2026-09-01",
            "notes": "Ordinary",
            "lines": [{"accountId": expense["id"], "debit": 500, "credit": 0}, {"accountId": income["id"], "debit": 0, "credit": 500}],
        },
    )
    assert ok.status_code == 201, ok.text


@pytest.mark.parametrize("field", ["basicSalary", "hra", "otherAllowances", "pfEmployee", "professionalTax", "tds"])
def test_payroll_salary_components_are_capped(client, org, field):
    payload = {"name": f"Overflow {field}", "dateOfJoining": "2020-01-01", "basicSalary": 1000}
    payload[field] = HUGE
    res = client.post("/api/payroll/employees", headers=org["h"], json=payload)
    assert res.status_code == 422, res.text


def test_bank_amounts_and_opening_balance_are_capped(client, org):
    h = org["h"]
    counter = _expense_account(client, org)
    res = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Overflow Account", "type": "bank", "openingBalance": HUGE, "openingBalanceDate": "2026-04-01"},
    )
    assert res.status_code == 422, res.text

    res = client.post(
        f"/api/banking/accounts/{org['bank']['id']}/transactions",
        headers=h,
        json={
            "date": "2026-09-01",
            "type": "deposit",
            "amount": HUGE,
            "description": "Overflow deposit",
            "counterAccountId": counter["id"],
        },
    )
    assert res.status_code == 422, res.text

    other = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Transfer Target", "type": "bank", "openingBalance": 0, "openingBalanceDate": "2026-04-01"},
    ).json()
    res = client.post(
        "/api/banking/transfers",
        headers=h,
        json={
            "fromAccountId": org["bank"]["id"],
            "toAccountId": other["id"],
            "date": "2026-09-01",
            "amount": HUGE,
            "description": "Overflow transfer",
        },
    )
    assert res.status_code == 422, res.text


def test_expense_amount_is_capped(client, org):
    h = org["h"]
    res = client.post(
        "/api/expenses",
        headers=h,
        json={
            "date": "2026-09-01",
            "accountId": _expense_account(client, org)["id"],
            "paidThroughAccountId": org["bank"]["id"],
            "amount": HUGE,
            "notes": "Overflow",
        },
    )
    assert res.status_code == 422, res.text


def test_project_rate_and_budget_are_capped(client, org):
    h = org["h"]
    res = client.post("/api/projects", headers=h, json={"name": "Overflow Rate", "hourlyRate": HUGE})
    assert res.status_code == 422, res.text
    res = client.post("/api/projects", headers=h, json={"name": "Overflow Budget", "budgetHours": HUGE})
    assert res.status_code == 422, res.text


def test_amounts_just_inside_the_cap_are_accepted(client, org):
    """The ceiling has to leave room for real figures, not just reject everything."""
    h = org["h"]
    res = client.post("/api/items", headers=h, json={"name": "Expensive But Valid", "sku": "BIG-OK", "sellingPrice": 999999999.99})
    assert res.status_code == 201, res.text
