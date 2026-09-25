"""Financial hardening: authorization boundaries and ledger correctness.

These pin the fixes from the finance audit:

* Staff (day-to-day bookkeeping) may not reach payroll, bank balances, the
  general ledger reports (P&L / balance sheet) or post document lines into a
  bank/control ledger account.
* Credit-card debt reduces cash rather than inflating it.
* A bank account's counter side, and manual journals, may not touch a
  bank-linked ledger account.
* One reconciled side of a transfer freezes the whole transfer against deletion.
* GST is charged on the post-discount taxable value.
* Inventory is valued at weighted-average cost.
* Mid-month joiners are pro-rated.
* Required fields sent as ``null`` are rejected with 422, not a 500.

Every workflow that posts to the ledger also asserts the trial balance stays
balanced (conftest.trial_balance_ok).
"""

import uuid

import pytest

from tests.conftest import auth, invite_and_accept, register_org, trial_balance_ok


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _login(client, email: str, password: str) -> dict:
    return auth(client.post("/api/auth/login", json={"email": email, "password": password}).json()["accessToken"])


def _make_env(client, hint: str = "FinHard") -> dict:
    """Fresh org (isolated ledger) with a bank account, vendor, a tracked item
    and both a staff and a viewer member."""
    ctx = register_org(client, hint)
    admin = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=admin,
        json={"name": "Operating", "type": "bank", "openingBalance": 500000, "openingBalanceDate": "2026-04-01", "isPrimary": True},
    ).json()
    vendor = client.post("/api/contacts", headers=admin, json={"type": "vendor", "displayName": "Dell India", "paymentTermsDays": 30}).json()
    item = client.post(
        "/api/items",
        headers=admin,
        json={
            "name": "27 inch Monitor",
            "sku": f"MON-{_uid()}",
            "type": "goods",
            "sellingPrice": 10000,
            "costPrice": 7000,
            "taxRate": 18,
            "trackInventory": True,
            "openingStock": 20,
            "openingStockRate": 7000,
            "reorderLevel": 5,
        },
    ).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=admin).json()}

    staff_email = f"staff-{_uid()}@example.com"
    invite_and_accept(client, admin, "Staffer", staff_email, "staff", "Staff12345")
    staff = _login(client, staff_email, "Staff12345")

    viewer_email = f"viewer-{_uid()}@example.com"
    invite_and_accept(client, admin, "Viewer", viewer_email, "viewer", "Viewer12345")
    viewer = _login(client, viewer_email, "Viewer12345")

    return {"admin": admin, "staff": staff, "viewer": viewer, "bank": bank, "vendor": vendor, "item": item, "accounts": accounts}


@pytest.fixture
def env(client):
    return _make_env(client)


# --------------------------------------------------------------------------- #
# HIGH-1  Payroll is admin-only (viewer may read, staff is shut out entirely)
# --------------------------------------------------------------------------- #
def test_staff_cannot_touch_payroll(env, client):
    staff, admin, viewer = env["staff"], env["admin"], env["viewer"]

    # Reads: staff blocked, viewer and admin allowed.
    assert client.get("/api/payroll/employees", headers=staff).status_code == 403
    assert client.get("/api/payroll/pay-runs", headers=staff).status_code == 403
    assert client.get("/api/payroll/employees", headers=viewer).status_code == 200
    assert client.get("/api/payroll/employees", headers=admin).status_code == 200

    emp_payload = {"name": "Priya Rao", "dateOfJoining": "2026-04-01", "basicSalary": 30000}
    # Writes: staff and viewer blocked, admin allowed.
    assert client.post("/api/payroll/employees", headers=staff, json=emp_payload).status_code == 403
    assert client.post("/api/payroll/employees", headers=viewer, json=emp_payload).status_code == 403
    assert client.post("/api/payroll/employees", headers=admin, json=emp_payload).status_code == 201


# --------------------------------------------------------------------------- #
# HIGH-2  Dashboard hides bank balances / cash from Staff
# --------------------------------------------------------------------------- #
def test_staff_dashboard_omits_banking(env, client):
    staff, admin = env["staff"], env["admin"]

    staff_body = client.get("/api/dashboard/summary", headers=staff)
    assert staff_body.status_code == 200, staff_body.text
    body = staff_body.json()
    assert body["bankBalances"] is None
    assert body["totalCash"] is None
    assert body["cashFlow"] is None
    # Operational metrics stay available to staff.
    assert body["receivables"] is not None
    assert body["payables"] is not None

    admin_body = client.get("/api/dashboard/summary", headers=admin).json()
    assert admin_body["bankBalances"] is not None
    assert admin_body["totalCash"] is not None
    assert admin_body["cashFlow"] is not None


# --------------------------------------------------------------------------- #
# HIGH-3a  P&L and balance sheet are financial-read; operational reports aren't
# --------------------------------------------------------------------------- #
def test_staff_cannot_read_ledger_reports(env, client):
    staff, viewer = env["staff"], env["viewer"]

    assert client.get("/api/reports/profit-and-loss", headers=staff).status_code == 403
    assert client.get("/api/reports/balance-sheet", headers=staff).status_code == 403
    # Viewer keeps read access.
    assert client.get("/api/reports/profit-and-loss", headers=viewer).status_code == 200
    assert client.get("/api/reports/balance-sheet", headers=viewer).status_code == 200
    # Operational reports remain open to staff.
    assert client.get("/api/reports/receivables-aging", headers=staff).status_code == 200
    assert client.get("/api/reports/inventory-summary", headers=staff).status_code == 200


# --------------------------------------------------------------------------- #
# HIGH-3b  A bill line may not post into a bank/control ledger account
# --------------------------------------------------------------------------- #
def test_bill_line_cannot_target_bank_ledger(env, client):
    staff, bank, vendor = env["staff"], env["bank"], env["vendor"]
    res = client.post(
        "/api/bills",
        headers=staff,
        json={
            "vendorId": vendor["id"],
            "date": "2026-09-01",
            "status": "open",
            "lines": [{"accountId": bank["ledgerAccountId"], "description": "Sneaky", "quantity": 1, "rate": 1000, "taxRate": 0}],
        },
    )
    assert res.status_code == 400, res.text


def test_bill_line_cannot_target_ap_control(env, client):
    admin, vendor, accounts = env["admin"], env["vendor"], env["accounts"]
    res = client.post(
        "/api/bills",
        headers=admin,
        json={
            "vendorId": vendor["id"],
            "date": "2026-09-01",
            "status": "open",
            "lines": [{"accountId": accounts["2000"]["id"], "description": "AP direct", "quantity": 1, "rate": 500, "taxRate": 0}],
        },
    )
    assert res.status_code == 400, res.text


# --------------------------------------------------------------------------- #
# M-cash-in-totals  Credit-card debt reduces cash instead of adding to it
# --------------------------------------------------------------------------- #
def test_credit_card_debt_not_added_to_cash(env, client):
    admin = env["admin"]
    client.post(
        "/api/banking/accounts",
        headers=admin,
        json={"name": "Amex", "type": "credit_card", "openingBalance": -10000, "openingBalanceDate": "2026-04-01"},
    )
    summary = client.get("/api/banking/summary", headers=admin).json()
    # 500000 cash - 10000 owed on the card.
    assert summary["totalBalance"] == 490000

    dash = client.get("/api/dashboard/summary", headers=admin).json()
    assert dash["totalCash"] == 490000


def test_cash_account_cannot_open_negative(env, client):
    admin = env["admin"]
    res = client.post(
        "/api/banking/accounts",
        headers=admin,
        json={"name": "Petty Cash", "type": "cash", "openingBalance": -100, "openingBalanceDate": "2026-04-01"},
    )
    assert res.status_code == 422, res.text


# --------------------------------------------------------------------------- #
# M-counter-account  bank -> bank counter entries are refused
# --------------------------------------------------------------------------- #
def test_bank_to_bank_counter_rejected(env, client):
    admin, bank = env["admin"], env["bank"]
    other = client.post(
        "/api/banking/accounts",
        headers=admin,
        json={"name": "Savings", "type": "bank", "openingBalance": 0, "openingBalanceDate": "2026-04-01"},
    ).json()
    res = client.post(
        f"/api/banking/accounts/{bank['id']}/transactions",
        headers=admin,
        json={
            "date": "2026-09-10",
            "type": "withdrawal",
            "amount": 1000,
            "description": "Should be a transfer",
            "counterAccountId": other["ledgerAccountId"],
        },
    )
    assert res.status_code == 400, res.text


# --------------------------------------------------------------------------- #
# M-journal-target  Manual journals may not target a bank-linked ledger account
# --------------------------------------------------------------------------- #
def test_manual_journal_to_bank_ledger_rejected(env, client):
    admin, bank, accounts = env["admin"], env["bank"], env["accounts"]
    res = client.post(
        "/api/accounting/journals",
        headers=admin,
        json={
            "date": "2026-09-10",
            "lines": [
                {"accountId": bank["ledgerAccountId"], "debit": 1000, "credit": 0},
                {"accountId": accounts["6200"]["id"], "debit": 0, "credit": 1000},
            ],
        },
    )
    assert res.status_code == 400, res.text


# --------------------------------------------------------------------------- #
# M-transfer-delete  A reconciled side freezes the whole transfer
# --------------------------------------------------------------------------- #
def test_reconciled_transfer_cannot_be_deleted(env, client):
    admin, bank = env["admin"], env["bank"]
    other = client.post(
        "/api/banking/accounts",
        headers=admin,
        json={"name": "Savings", "type": "bank", "openingBalance": 0, "openingBalanceDate": "2026-04-01"},
    ).json()
    assert (
        client.post(
            "/api/banking/transfers",
            headers=admin,
            json={"fromAccountId": bank["id"], "toAccountId": other["id"], "date": "2026-09-11", "amount": 5000},
        ).status_code
        == 201
    )
    txs = [t for t in client.get("/api/banking/transactions", headers=admin).json()["items"] if t["sourceType"] == "transfer"]
    assert len(txs) == 2
    # Reconcile one side...
    assert (
        client.post(
            "/api/banking/transactions/reconcile",
            headers=admin,
            json={"transactionIds": [txs[0]["id"]], "reconciled": True},
        ).status_code
        == 200
    )
    # ...and the still-unreconciled sibling now refuses deletion too.
    res = client.delete(f"/api/banking/transactions/{txs[1]['id']}", headers=admin)
    assert res.status_code == 400, res.text
    assert trial_balance_ok(client, admin)


# --------------------------------------------------------------------------- #
# M-discount-gst  GST is charged on the post-discount taxable value
# --------------------------------------------------------------------------- #
def test_gst_charged_after_discount(env, client):
    admin, vendor, accounts = env["admin"], env["vendor"], env["accounts"]
    res = client.post(
        "/api/bills",
        headers=admin,
        json={
            "vendorId": vendor["id"],
            "date": "2026-09-01",
            "status": "open",
            "discountAmount": 1000,
            "lines": [{"accountId": accounts["6200"]["id"], "description": "Supplies", "quantity": 1, "rate": 10000, "taxRate": 18}],
        },
    )
    assert res.status_code == 201, res.text
    bill = res.json()
    # Taxable value is 10000 - 1000 = 9000, so GST is 1620 (not 1800).
    assert bill["taxTotal"] == 1620
    assert bill["total"] == 10620  # 10000 - 1000 + 1620
    assert trial_balance_ok(client, admin)


# --------------------------------------------------------------------------- #
# M-inventory-valuation  Weighted-average cost on purchase
# --------------------------------------------------------------------------- #
def test_weighted_average_cost_on_purchase(env, client):
    admin, vendor, item = env["admin"], env["vendor"], env["item"]
    res = client.post(
        "/api/bills",
        headers=admin,
        json={
            "vendorId": vendor["id"],
            "date": "2026-09-01",
            "status": "open",
            "lines": [{"itemId": item["id"], "description": "Monitors", "quantity": 10, "rate": 10000, "taxRate": 18}],
        },
    )
    assert res.status_code == 201, res.text
    updated = client.get(f"/api/items/{item['id']}", headers=admin).json()
    # (20 * 7000 + 10 * 10000) / 30 = 8000, not the latest rate of 10000.
    assert updated["stockOnHand"] == 30
    assert updated["costPrice"] == 8000
    assert trial_balance_ok(client, admin)


# --------------------------------------------------------------------------- #
# M-payroll-prorate  Mid-month joiners are pro-rated by days worked
# --------------------------------------------------------------------------- #
def test_mid_month_joiner_is_prorated(env, client):
    admin = env["admin"]
    client.post(
        "/api/payroll/employees",
        headers=admin,
        json={"name": "Late Joiner", "dateOfJoining": "2026-09-16", "basicSalary": 30000},
    )
    run = client.post("/api/payroll/pay-runs", headers=admin, json={"periodYear": 2026, "periodMonth": 9})
    assert run.status_code == 201, run.text
    slips = run.json()["payslips"]
    assert len(slips) == 1
    # September has 30 days; joined on the 16th => 15 days => 30000 * 15/30 = 15000.
    assert slips[0]["gross"] == 15000


# --------------------------------------------------------------------------- #
# LOW  Required field sent as null -> 422 rather than a 500
# --------------------------------------------------------------------------- #
def test_null_required_field_is_422(env, client):
    admin, bank = env["admin"], env["bank"]
    res = client.put(f"/api/banking/accounts/{bank['id']}", headers=admin, json={"name": None})
    assert res.status_code == 422, res.text
