"""Regression tests for the finance hardening pass: payroll races and access,
Staff visibility of banking figures, posting-account restrictions, GST after
discount, weighted-average cost, card balances, date checks and 500s that
should have been 4xx."""

import threading
import time
import uuid
from unittest.mock import patch

import pytest

from backend.services import ledger
from tests.conftest import auth, invite_and_accept, register_org, trial_balance_ok


def _member(client, admin_h, role):
    email = f"{role}-{uuid.uuid4().hex[:8]}@example.com"
    invite_and_accept(client, admin_h, role.title(), email, role, "Member12345")
    token = client.post("/api/auth/login", json={"email": email, "password": "Member12345"}).json()["accessToken"]
    return auth(token)


@pytest.fixture
def fin(client):
    """A fresh org with an admin, a staff member, a viewer and a funded bank account."""
    ctx = register_org(client, "Hardening")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Main Bank", "type": "bank", "openingBalance": 1000000, "openingBalanceDate": "2026-01-01"},
    )
    assert bank.status_code == 201, bank.text
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    vendor = client.post("/api/contacts", headers=h, json={"type": "vendor", "displayName": "Vendor Co"}).json()
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Customer Co"}).json()
    return {
        "h": h,
        "staff": _member(client, h, "staff"),
        "viewer": _member(client, h, "viewer"),
        "bank": bank.json(),
        "accounts": accounts,
        "vendor": vendor,
        "customer": customer,
    }


def _employee(client, h, **overrides):
    payload = {"name": "Asha Rao", "dateOfJoining": "2020-01-01", "basicSalary": 30000}
    payload.update(overrides)
    res = client.post("/api/payroll/employees", headers=h, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def _approved_run(client, h, year=2026, month=8):
    run = client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": year, "periodMonth": month})
    assert run.status_code == 201, run.text
    approved = client.post(f"/api/payroll/pay-runs/{run.json()['id']}/approve", headers=h)
    assert approved.status_code == 200, approved.text
    return run.json()


# --------------------------------------------------------------------------- #
# 1. Pay run pay/approve race
# --------------------------------------------------------------------------- #
def test_concurrent_pay_run_payments_pay_salaries_once(client, fin):
    h = fin["h"]
    _employee(client, h)
    run = _approved_run(client, h)
    barrier = threading.Barrier(6)
    codes = []
    lock = threading.Lock()

    def pay():
        barrier.wait()
        res = client.post(
            f"/api/payroll/pay-runs/{run['id']}/pay", headers=h, json={"bankAccountId": fin["bank"]["id"], "payDate": "2026-08-31"}
        )
        with lock:
            codes.append(res.status_code)

    # Slow the journal posting down so every request is in flight at once:
    # the old code checked the status, then posted, then flipped it, so all
    # six passed the check while the first was still posting.
    real_post_entry = ledger.post_entry

    def slow_post_entry(*args, **kwargs):
        time.sleep(0.3)
        return real_post_entry(*args, **kwargs)

    threads = [threading.Thread(target=pay) for _ in range(6)]
    with patch("backend.routers.payroll.ledger.post_entry", side_effect=slow_post_entry):
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    assert codes.count(200) == 1, codes
    assert all(c in (200, 400, 409) for c in codes), codes
    journals = client.get("/api/accounting/journals", headers=h, params={"source_type": "payroll"}).json()["items"]
    assert len([j for j in journals if j["sourceId"] == run["id"]]) == 1
    withdrawals = client.get(
        "/api/banking/transactions", headers=h, params={"bank_account_id": fin["bank"]["id"], "search": "Payroll"}
    ).json()["items"]
    assert len(withdrawals) == 1
    assert trial_balance_ok(client, h)


def test_second_approve_and_second_pay_are_refused(client, fin):
    h = fin["h"]
    _employee(client, h)
    run = _approved_run(client, h)
    assert client.post(f"/api/payroll/pay-runs/{run['id']}/approve", headers=h).status_code == 400
    body = {"bankAccountId": fin["bank"]["id"], "payDate": "2026-08-31"}
    assert client.post(f"/api/payroll/pay-runs/{run['id']}/pay", headers=h, json=body).status_code == 200
    assert client.post(f"/api/payroll/pay-runs/{run['id']}/pay", headers=h, json=body).status_code == 400


# --------------------------------------------------------------------------- #
# 2. Payroll authorization
# --------------------------------------------------------------------------- #
def test_payroll_is_admin_write_and_admin_viewer_read(client, fin):
    h, staff, viewer = fin["h"], fin["staff"], fin["viewer"]
    emp = _employee(client, h)
    run = client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": 2026, "periodMonth": 7}).json()
    slip_id = run["payslips"][0]["id"]
    reads = [
        "/api/payroll/employees",
        f"/api/payroll/employees/{emp['id']}/leaves",
        "/api/payroll/pay-runs",
        f"/api/payroll/pay-runs/{run['id']}",
        f"/api/payroll/payslips/{slip_id}",
    ]
    for url in reads:
        assert client.get(url, headers=staff).status_code == 403, url
        assert client.get(url, headers=viewer).status_code == 200, url
    new_emp = {"name": "Staff Made", "dateOfJoining": "2026-01-01", "basicSalary": 1000}
    for who in (staff, viewer):
        assert client.post("/api/payroll/employees", headers=who, json=new_emp).status_code == 403
        assert client.put(f"/api/payroll/employees/{emp['id']}", headers=who, json={"basicSalary": 99999}).status_code == 403
        assert client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=who, json={"date": "2026-07-02"}).status_code == 403
    leave = client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=h, json={"date": "2026-07-03"}).json()
    assert client.delete(f"/api/payroll/leaves/{leave['id']}", headers=staff).status_code == 403
    assert client.delete(f"/api/payroll/leaves/{leave['id']}", headers=h).status_code == 200


# --------------------------------------------------------------------------- #
# 3 & 10. Dashboard banking figures and card balances
# --------------------------------------------------------------------------- #
def test_dashboard_hides_banking_figures_from_staff(client, fin):
    staff_dash = client.get("/api/dashboard/summary", headers=fin["staff"])
    assert staff_dash.status_code == 200
    body = staff_dash.json()
    assert body["bankBalances"] is None and body["totalCash"] is None and body["cashFlow"] is None
    assert body["receivables"] is not None
    viewer_dash = client.get("/api/dashboard/summary", headers=fin["viewer"]).json()
    assert viewer_dash["totalCash"] is not None and viewer_dash["cashFlow"] is not None


def test_unreconciled_notification_is_not_shown_to_staff(client, fin):
    h = fin["h"]
    for i in range(10):
        res = client.post(
            f"/api/banking/accounts/{fin['bank']['id']}/transactions",
            headers=h,
            json={
                "date": "2026-09-01",
                "type": "deposit",
                "amount": 10 + i,
                "description": f"Misc {i}",
                "counterAccountId": fin["accounts"]["4900"]["id"],
            },
        )
        assert res.status_code == 201, res.text
    admin_kinds = {n["kind"] for n in client.get("/api/dashboard/notifications", headers=h).json()["items"]}
    staff_kinds = {n["kind"] for n in client.get("/api/dashboard/notifications", headers=fin["staff"]).json()["items"]}
    assert "unreconciled" in admin_kinds
    assert "unreconciled" not in staff_kinds


def test_credit_card_debt_is_netted_off_total_cash(client, fin):
    h = fin["h"]
    card = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Corporate Card", "type": "credit_card", "openingBalance": -5000, "openingBalanceDate": "2026-01-01"},
    )
    assert card.status_code == 201, card.text
    summary = client.get("/api/banking/summary", headers=h).json()
    balances = {a["id"]: a["currentBalance"] for a in summary["accounts"]}
    assert balances[card.json()["id"]] == -5000
    non_card = sum(a["currentBalance"] for a in summary["accounts"] if a["type"] != "credit_card")
    assert summary["totalBalance"] == round(non_card - 5000, 2)
    dash = client.get("/api/dashboard/summary", headers=h, params={"period": "this_fiscal_year"}).json()
    assert dash["totalCash"] == summary["totalBalance"]
    cf = dash["cashFlow"]
    assert cf["closingBalance"] == round(cf["openingBalance"] + cf["netCashFlow"], 2)
    # No future-dated movements in this org, so the period's closing is today's cash.
    assert cf["closingBalance"] == dash["totalCash"]


# --------------------------------------------------------------------------- #
# 4. Reports
# --------------------------------------------------------------------------- #
def test_ledger_reports_are_financial_only(client, fin):
    for url in ("/api/reports/profit-and-loss", "/api/reports/balance-sheet"):
        assert client.get(url, headers=fin["staff"]).status_code == 403, url
        assert client.get(url, headers=fin["viewer"]).status_code == 200, url
    for url in ("/api/reports/receivables-aging", "/api/reports/sales-by-customer", "/api/reports/payables-aging"):
        assert client.get(url, headers=fin["staff"]).status_code == 200, url


def test_report_start_after_end_is_rejected(client, fin):
    h = fin["h"]
    params = {"start_date": "2026-09-30", "end_date": "2026-09-01"}
    assert client.get("/api/reports/profit-and-loss", headers=h, params=params).status_code == 400
    assert client.get("/api/reports/sales-by-customer", headers=h, params=params).status_code == 400
    ledger_params = {"start_date": "2026-09-30", "end_date": "2026-09-01"}
    acct = fin["accounts"]["6200"]["id"]
    assert client.get(f"/api/accounting/ledger/{acct}", headers=h, params=ledger_params).status_code == 400


# --------------------------------------------------------------------------- #
# 5. Picker endpoints
# --------------------------------------------------------------------------- #
def test_account_option_endpoints_serve_staff_without_balances(client, fin):
    staff = fin["staff"]
    opts = client.get("/api/accounting/account-options", headers=staff)
    assert opts.status_code == 200, opts.text
    rows = opts.json()
    assert rows and set(rows[0]) == {"id", "code", "name", "type", "subtype", "isActive"}
    assert all(r["isActive"] for r in rows)
    expense_only = client.get("/api/accounting/account-options", headers=staff, params={"types": "expense,asset"}).json()
    assert expense_only and {r["type"] for r in expense_only} <= {"expense", "asset"}
    assert client.get("/api/accounting/account-options", headers=staff, params={"types": "bogus"}).status_code == 422

    banks = client.get("/api/banking/account-options", headers=staff)
    assert banks.status_code == 200, banks.text
    row = next(b for b in banks.json() if b["id"] == fin["bank"]["id"])
    assert set(row) == {"id", "name", "type", "ledgerAccountId", "currency"}
    assert client.get("/api/banking/account-options", headers=fin["viewer"]).status_code == 200


# --------------------------------------------------------------------------- #
# 6. Line accounts on bills and invoices
# --------------------------------------------------------------------------- #
def _bill(fin, account_id, **extra):
    body = {
        "vendorId": fin["vendor"]["id"],
        "date": "2026-09-01",
        "status": "open",
        "lines": [{"accountId": account_id, "description": "Thing", "quantity": 1, "rate": 1000, "taxRate": 0}],
    }
    body.update(extra)
    return body


def test_bill_lines_cannot_post_to_control_bank_or_inactive_accounts(client, fin):
    h, staff, a = fin["h"], fin["staff"], fin["accounts"]
    for code in ("1100", "2000", "1300", "2100", "1200", fin["bank"]["name"]):
        account_id = fin["bank"]["ledgerAccountId"] if code == fin["bank"]["name"] else a[code]["id"]
        res = client.post("/api/bills", headers=staff, json=_bill(fin, account_id))
        assert res.status_code == 400, (code, res.text)
    assert client.post("/api/bills", headers=staff, json=_bill(fin, a["4000"]["id"])).status_code == 400  # income
    new_acct = client.post("/api/accounting/accounts", headers=h, json={"code": "6991", "name": "Old Head", "type": "expense"}).json()
    client.put(f"/api/accounting/accounts/{new_acct['id']}", headers=h, json={"isActive": False})
    assert client.post("/api/bills", headers=staff, json=_bill(fin, new_acct["id"])).status_code == 400
    ok = client.post("/api/bills", headers=staff, json=_bill(fin, a["6200"]["id"]))
    assert ok.status_code == 201, ok.text
    assert trial_balance_ok(client, h)


def test_invoice_lines_must_use_income_accounts(client, fin):
    h, a = fin["h"], fin["accounts"]
    body = {
        "customerId": fin["customer"]["id"],
        "date": "2026-09-01",
        "status": "sent",
        "lines": [{"accountId": a["1100"]["id"], "description": "Fee", "quantity": 1, "rate": 100}],
    }
    assert client.post("/api/invoices", headers=h, json=body).status_code == 400
    body["lines"][0]["accountId"] = a["4100"]["id"]
    assert client.post("/api/invoices", headers=h, json=body).status_code == 201


# --------------------------------------------------------------------------- #
# 7. Manual journals and bank-transaction counter accounts
# --------------------------------------------------------------------------- #
def test_manual_journal_rejects_bank_ledgers_inactive_accounts_and_foreign_contacts(client, fin):
    h, a = fin["h"], fin["accounts"]

    def journal(credit_account, contact_id=None):
        return client.post(
            "/api/accounting/journals",
            headers=h,
            json={
                "date": "2026-09-01",
                "lines": [
                    {"accountId": a["6200"]["id"], "debit": 50, "contactId": contact_id},
                    {"accountId": credit_account, "credit": 50},
                ],
            },
        )

    assert journal(fin["bank"]["ledgerAccountId"]).status_code == 400
    old = client.post("/api/accounting/accounts", headers=h, json={"code": "3900", "name": "Dormant", "type": "equity"}).json()
    client.put(f"/api/accounting/accounts/{old['id']}", headers=h, json={"isActive": False})
    assert journal(old["id"]).status_code == 400
    other = register_org(client, "OtherOrg")
    foreign = client.post("/api/contacts", headers=auth(other["token"]), json={"type": "vendor", "displayName": "Foreign"}).json()
    assert journal(a["3000"]["id"], foreign["id"]).status_code == 400
    assert journal(a["3000"]["id"], fin["vendor"]["id"]).status_code == 201


def test_bank_transaction_counter_cannot_be_another_bank_ledger(client, fin):
    h = fin["h"]
    other = client.post(
        "/api/banking/accounts", headers=h, json={"name": "Second Bank", "type": "bank", "openingBalanceDate": "2026-01-01"}
    ).json()
    res = client.post(
        f"/api/banking/accounts/{fin['bank']['id']}/transactions",
        headers=h,
        json={"date": "2026-09-01", "type": "withdrawal", "amount": 10, "description": "x", "counterAccountId": other["ledgerAccountId"]},
    )
    assert res.status_code == 400


def test_reversal_cannot_predate_the_journal(client, fin):
    h, a = fin["h"], fin["accounts"]
    entry = client.post(
        "/api/accounting/journals",
        headers=h,
        json={"date": "2026-09-10", "lines": [{"accountId": a["6200"]["id"], "debit": 5}, {"accountId": a["3000"]["id"], "credit": 5}]},
    ).json()
    early = client.post(f"/api/accounting/journals/{entry['id']}/reverse", headers=h, params={"reversal_date": "2026-09-09"})
    assert early.status_code == 400
    same_day = client.post(f"/api/accounting/journals/{entry['id']}/reverse", headers=h, params={"reversal_date": "2026-09-10"})
    assert same_day.status_code == 200


# --------------------------------------------------------------------------- #
# 8. GST after discount
# --------------------------------------------------------------------------- #
def test_gst_is_charged_on_the_discounted_value(client, fin):
    h, a = fin["h"], fin["accounts"]
    body = {
        "vendorId": fin["vendor"]["id"],
        "date": "2026-09-01",
        "status": "open",
        "discountAmount": 200,
        "lines": [
            {"accountId": a["6200"]["id"], "description": "A", "quantity": 1, "rate": 1000, "taxRate": 18},
            {"accountId": a["6500"]["id"], "description": "B", "quantity": 1, "rate": 1000, "taxRate": 5},
        ],
    }
    res = client.post("/api/bills", headers=h, json=body)
    assert res.status_code == 201, res.text
    bill = res.json()
    # 100 of the discount comes off each line: 900 * 18% + 900 * 5%.
    assert bill["taxTotal"] == 207
    assert bill["total"] == 2000 - 200 + 207
    assert sum(line["taxAmount"] for line in bill["lines"]) == bill["taxTotal"]
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# 9. Weighted-average cost
# --------------------------------------------------------------------------- #
def test_bill_receipts_use_weighted_average_cost_and_void_restores_it(client, fin):
    h = fin["h"]
    item = client.post(
        "/api/items",
        headers=h,
        json={
            "name": "Widget",
            "sku": f"W-{uuid.uuid4().hex[:6]}",
            "type": "goods",
            "costPrice": 100,
            "sellingPrice": 300,
            "trackInventory": True,
            "openingStock": 10,
            "openingStockRate": 100,
        },
    ).json()
    bill = client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": fin["vendor"]["id"],
            "date": "2026-09-01",
            "status": "open",
            "lines": [{"itemId": item["id"], "description": "Widgets", "quantity": 10, "rate": 200}],
        },
    )
    assert bill.status_code == 201, bill.text
    after = client.get(f"/api/items/{item['id']}", headers=h).json()
    assert after["stockOnHand"] == 20 and after["costPrice"] == 150
    voided = client.post(f"/api/bills/{bill.json()['id']}/status", headers=h, json={"status": "void"})
    assert voided.status_code == 200
    restored = client.get(f"/api/items/{item['id']}", headers=h).json()
    assert restored["stockOnHand"] == 10 and restored["costPrice"] == 100
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# 11. Transfers
# --------------------------------------------------------------------------- #
def test_transfer_cannot_be_deleted_when_the_other_side_is_reconciled(client, fin):
    h = fin["h"]
    second = client.post(
        "/api/banking/accounts", headers=h, json={"name": "Savings", "type": "bank", "openingBalanceDate": "2026-01-01"}
    ).json()
    tr = client.post(
        "/api/banking/transfers",
        headers=h,
        json={"fromAccountId": fin["bank"]["id"], "toAccountId": second["id"], "date": "2026-09-01", "amount": 100},
    )
    assert tr.status_code == 201
    txs = client.get("/api/banking/transactions", headers=h, params={"search": "Transfer from"}).json()["items"]
    src = next(t for t in txs if t["bankAccountId"] == fin["bank"]["id"])
    dst = next(t for t in txs if t["bankAccountId"] == second["id"])
    client.post("/api/banking/transactions/reconcile", headers=h, json={"transactionIds": [dst["id"]], "reconciled": True})
    assert client.delete(f"/api/banking/transactions/{src['id']}", headers=h).status_code == 400
    assert client.get("/api/banking/transactions", headers=h, params={"reconciled": True}).json()["total"] >= 1
    client.post("/api/banking/transactions/reconcile", headers=h, json={"transactionIds": [dst["id"]], "reconciled": False})
    assert client.delete(f"/api/banking/transactions/{src['id']}", headers=h).status_code == 200
    assert trial_balance_ok(client, h)


# --------------------------------------------------------------------------- #
# 12. Payroll pro-rating and negative net salary
# --------------------------------------------------------------------------- #
def test_mid_month_joiner_is_pro_rated(client, fin):
    h = fin["h"]
    # September 2026 has 30 days; joining on the 16th means 15 days employed.
    emp = _employee(client, h, dateOfJoining="2026-09-16", basicSalary=30000, pfEmployee=1800)
    run = client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": 2026, "periodMonth": 9})
    assert run.status_code == 201, run.text
    slip = next(s for s in run.json()["payslips"] if s["employeeId"] == emp["id"])
    assert slip["gross"] == 15000
    assert slip["pfEmployee"] == 900
    assert slip["netPay"] == 14100


def test_deductions_above_gross_are_rejected(client, fin):
    h = fin["h"]
    bad = client.post(
        "/api/payroll/employees", headers=h, json={"name": "Neg Pay", "dateOfJoining": "2026-01-01", "basicSalary": 1000, "tds": 2000}
    )
    assert bad.status_code == 422
    emp = _employee(client, h, basicSalary=1000)
    assert client.put(f"/api/payroll/employees/{emp['id']}", headers=h, json={"tds": 5000}).status_code == 422


# --------------------------------------------------------------------------- #
# 13. Explicit nulls in update bodies
# --------------------------------------------------------------------------- #
def test_explicit_nulls_in_updates_are_422_not_500(client, fin):
    h = fin["h"]
    acct = fin["accounts"]["6200"]["id"]
    assert client.put(f"/api/accounting/accounts/{acct}", headers=h, json={"name": None}).status_code == 422
    assert client.put(f"/api/accounting/accounts/{acct}", headers=h, json={"isActive": None}).status_code == 422
    assert client.put(f"/api/banking/accounts/{fin['bank']['id']}", headers=h, json={"name": None}).status_code == 422
    assert client.put(f"/api/banking/accounts/{fin['bank']['id']}", headers=h, json={"isPrimary": None}).status_code == 422
    emp = _employee(client, h)
    assert client.put(f"/api/payroll/employees/{emp['id']}", headers=h, json={"basicSalary": None}).status_code == 422
    assert client.put(f"/api/payroll/employees/{emp['id']}", headers=h, json={"dateOfJoining": None}).status_code == 422
    # Nullable fields still accept null.
    assert client.put(f"/api/payroll/employees/{emp['id']}", headers=h, json={"designation": None}).status_code == 200
    proj = client.post("/api/projects", headers=h, json={"name": "P", "customerId": fin["customer"]["id"], "hourlyRate": 100}).json()
    assert client.put(f"/api/projects/{proj['id']}", headers=h, json={"hourlyRate": None}).status_code == 422
    assert client.put(f"/api/projects/{proj['id']}", headers=h, json={"status": None}).status_code == 422
    entry = client.post("/api/time-entries", headers=h, json={"projectId": proj["id"], "date": "2026-09-01", "hours": 2}).json()
    assert client.put(f"/api/time-entries/{entry['id']}", headers=h, json={"hours": None}).status_code == 422
    assert client.put(f"/api/time-entries/{entry['id']}", headers=h, json={"date": None}).status_code == 422


# --------------------------------------------------------------------------- #
# 14. Other 500s
# --------------------------------------------------------------------------- #
def test_deleting_an_account_used_by_an_item_is_a_400(client, fin):
    h = fin["h"]
    acct = client.post("/api/accounting/accounts", headers=h, json={"code": "4555", "name": "Widget Sales", "type": "income"}).json()
    item = client.post(
        "/api/items",
        headers=h,
        json={"name": "Priced", "sku": f"P-{uuid.uuid4().hex[:6]}", "sellingPrice": 5, "salesAccountId": acct["id"]},
    )
    assert item.status_code == 201, item.text
    res = client.delete(f"/api/accounting/accounts/{acct['id']}", headers=h)
    assert res.status_code == 400 and "items" in res.json()["detail"]


def test_ledger_from_the_first_representable_date(client, fin):
    acct = fin["accounts"]["3100"]["id"]
    res = client.get(f"/api/accounting/ledger/{acct}", headers=fin["h"], params={"start_date": "0001-01-01"})
    assert res.status_code == 200, res.text
    assert res.json()["openingBalance"] == 0


def test_expense_email_without_vendor(client, fin):
    h = fin["h"]
    exp = client.post(
        "/api/expenses",
        headers=h,
        json={"date": "2026-09-01", "accountId": fin["accounts"]["6200"]["id"], "paidThroughAccountId": fin["bank"]["id"], "amount": 10},
    ).json()
    with patch("backend.routers.expenses.send_expense_email", return_value={"success": True}) as sender:
        res = client.post(f"/api/expenses/{exp['id']}/send-gmail", headers=h, json={"to_email": "a@example.com", "attach_pdf": False})
    assert res.status_code == 200, res.text
    assert sender.call_args.kwargs["recipient_name"] == "Team"


# --------------------------------------------------------------------------- #
# 15. Expense field values and partial updates
# --------------------------------------------------------------------------- #
def test_expense_status_and_method_are_constrained_and_update_keeps_unsent_fields(client, fin):
    h = fin["h"]
    base = {"date": "2026-09-01", "accountId": fin["accounts"]["6200"]["id"], "paidThroughAccountId": fin["bank"]["id"], "amount": 10}
    assert client.post("/api/expenses", headers=h, json={**base, "status": "unpaid"}).status_code == 422
    assert client.post("/api/expenses", headers=h, json={**base, "paymentMethod": "barter"}).status_code == 422
    created = client.post(
        "/api/expenses", headers=h, json={**base, "category": "Travel", "paymentMethod": "upi", "receiptUrl": "https://r.example.com/1"}
    )
    assert created.status_code == 201, created.text
    upd = client.put(f"/api/expenses/{created.json()['id']}", headers=h, json={**base, "amount": 20})
    assert upd.status_code == 200, upd.text
    body = upd.json()
    assert body["category"] == "Travel" and body["paymentMethod"] == "upi" and body["receiptUrl"] == "https://r.example.com/1"
    assert body["total"] == 20


# --------------------------------------------------------------------------- #
# 16. Date checks
# --------------------------------------------------------------------------- #
def test_pay_date_checks(client, fin):
    h = fin["h"]
    _employee(client, h)
    run = _approved_run(client, h, 2026, 5)
    early = client.post(
        f"/api/payroll/pay-runs/{run['id']}/pay", headers=h, json={"bankAccountId": fin["bank"]["id"], "payDate": "2026-04-30"}
    )
    assert early.status_code == 400
    late_bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "New Bank", "type": "bank", "openingBalance": 100000, "openingBalanceDate": "2026-06-01"},
    ).json()
    before_opening = client.post(
        f"/api/payroll/pay-runs/{run['id']}/pay", headers=h, json={"bankAccountId": late_bank["id"], "payDate": "2026-05-31"}
    )
    assert before_opening.status_code == 400
    # Neither refusal consumed the approval.
    ok = client.post(
        f"/api/payroll/pay-runs/{run['id']}/pay", headers=h, json={"bankAccountId": fin["bank"]["id"], "payDate": "2026-05-31"}
    )
    assert ok.status_code == 200, ok.text


def test_time_invoice_due_date_cannot_precede_invoice_date(client, fin):
    h = fin["h"]
    proj = client.post("/api/projects", headers=h, json={"name": "T", "customerId": fin["customer"]["id"], "hourlyRate": 100}).json()
    client.post("/api/time-entries", headers=h, json={"projectId": proj["id"], "date": "2026-09-01", "hours": 1})
    res = client.post("/api/time-entries/invoice", headers=h, json={"projectId": proj["id"], "date": "2026-09-10", "dueDate": "2026-09-01"})
    assert res.status_code == 422


# --------------------------------------------------------------------------- #
# 18. Bank account lifecycle
# --------------------------------------------------------------------------- #
def test_cash_cannot_open_negative_and_funded_accounts_cannot_be_deactivated(client, fin):
    h = fin["h"]
    neg = client.post(
        "/api/banking/accounts", headers=h, json={"name": "Till", "type": "cash", "openingBalance": -1, "openingBalanceDate": "2026-01-01"}
    )
    assert neg.status_code == 422
    assert client.put(f"/api/banking/accounts/{fin['bank']['id']}", headers=h, json={"isActive": False}).status_code == 400
    empty = client.post(
        "/api/banking/accounts", headers=h, json={"name": "Empty", "type": "bank", "openingBalanceDate": "2026-01-01"}
    ).json()
    assert client.put(f"/api/banking/accounts/{empty['id']}", headers=h, json={"isActive": False}).status_code == 200
    tx = client.post(
        f"/api/banking/accounts/{empty['id']}/transactions",
        headers=h,
        json={"date": "2026-09-01", "type": "deposit", "amount": 5, "description": "x", "counterAccountId": fin["accounts"]["4900"]["id"]},
    )
    assert tx.status_code == 400
    transfer = client.post(
        "/api/banking/transfers",
        headers=h,
        json={"fromAccountId": fin["bank"]["id"], "toAccountId": empty["id"], "date": "2026-09-01", "amount": 5},
    )
    assert transfer.status_code == 400
    expense = client.post(
        "/api/expenses",
        headers=h,
        json={"date": "2026-09-01", "accountId": fin["accounts"]["6200"]["id"], "paidThroughAccountId": empty["id"], "amount": 5},
    )
    assert expense.status_code == 400
