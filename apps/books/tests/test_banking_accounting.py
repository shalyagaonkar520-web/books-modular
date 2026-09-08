from tests.conftest import trial_balance_ok


def test_bank_account_opening_balance_and_summary(client, org):
    h = org["h"]
    accounts = client.get("/api/banking/accounts", headers=h).json()
    operating = next(a for a in accounts if a["name"] == "Operating Account")
    assert operating["isPrimary"] is True and operating["ledgerAccountId"]
    summary = client.get("/api/banking/summary", headers=h).json()
    assert summary["totalBalance"] == sum(a["currentBalance"] for a in summary["accounts"] if a["type"] != "credit_card")


def test_manual_transaction_transfer_and_reconcile(client, org):
    h = org["h"]
    cash = client.post("/api/banking/accounts", headers=h, json={"name": "Cash Drawer", "type": "cash", "openingBalance": 0, "openingBalanceDate": "2026-04-01"}).json()
    before = client.get("/api/banking/accounts", headers=h).json()
    op_before = next(a for a in before if a["id"] == org["bank"]["id"])["currentBalance"]
    tr = client.post("/api/banking/transfers", headers=h, json={"fromAccountId": org["bank"]["id"], "toAccountId": cash["id"], "date": "2026-09-01", "amount": 5000})
    assert tr.status_code == 201, tr.text
    after = client.get("/api/banking/accounts", headers=h).json()
    assert next(a for a in after if a["id"] == cash["id"])["currentBalance"] == 5000
    assert next(a for a in after if a["id"] == org["bank"]["id"])["currentBalance"] == op_before - 5000
    fee = client.post(f"/api/banking/accounts/{org['bank']['id']}/transactions", headers=h, json={"date": "2026-09-02", "type": "withdrawal", "amount": 250, "description": "Bank charges", "counterAccountId": org["accounts"]["6100"]["id"]})
    assert fee.status_code == 201, fee.text
    txs = client.get("/api/banking/transactions", headers=h, params={"bank_account_id": org["bank"]["id"], "reconciled": False}).json()["items"]
    ids = [t["id"] for t in txs][:2]
    rec = client.post("/api/banking/transactions/reconcile", headers=h, json={"transactionIds": ids, "reconciled": True})
    assert rec.status_code == 200
    reconciled = client.get("/api/banking/transactions", headers=h, params={"bank_account_id": org["bank"]["id"], "reconciled": True}).json()["items"]
    assert {t["id"] for t in reconciled} >= set(ids)
    # cannot delete a reconciled transaction or a payment-generated one
    if fee.json()["id"] in ids:
        assert client.delete(f"/api/banking/transactions/{fee.json()['id']}", headers=h).status_code == 400
    assert client.post("/api/banking/transfers", headers=h, json={"fromAccountId": cash["id"], "toAccountId": cash["id"], "date": "2026-09-01", "amount": 1}).status_code == 400
    assert trial_balance_ok(client, h)


def test_chart_of_accounts_management(client, org):
    h = org["h"]
    res = client.post("/api/accounting/accounts", headers=h, json={"code": "6555", "name": "Software Subscriptions", "type": "expense", "subtype": "operating"})
    assert res.status_code == 201
    assert client.post("/api/accounting/accounts", headers=h, json={"code": "6555", "name": "Dup", "type": "expense"}).status_code == 409
    upd = client.put(f"/api/accounting/accounts/{res.json()['id']}", headers=h, json={"name": "SaaS Subscriptions"})
    assert upd.status_code == 200 and upd.json()["name"] == "SaaS Subscriptions"
    system = org["accounts"]["1100"]["id"]
    assert client.delete(f"/api/accounting/accounts/{system}", headers=h).status_code == 400
    assert client.put(f"/api/accounting/accounts/{system}", headers=h, json={"isActive": False}).status_code == 400
    assert client.delete(f"/api/accounting/accounts/{res.json()['id']}", headers=h).status_code == 200


def test_manual_journal_must_balance_and_can_be_reversed(client, org):
    h = org["h"]
    a, b = org["accounts"]["6200"]["id"], org["accounts"]["1000"]["id"]
    unbalanced = client.post("/api/accounting/journals", headers=h, json={"date": "2026-09-01", "lines": [{"accountId": a, "debit": 100}, {"accountId": b, "credit": 90}]})
    assert unbalanced.status_code == 400
    both_sides = client.post("/api/accounting/journals", headers=h, json={"date": "2026-09-01", "lines": [{"accountId": a, "debit": 100, "credit": 100}, {"accountId": b, "credit": 90}]})
    assert both_sides.status_code == 422
    ok = client.post("/api/accounting/journals", headers=h, json={"date": "2026-09-01", "reference": "Adj-1", "lines": [{"accountId": a, "debit": 100, "description": "Supplies"}, {"accountId": b, "credit": 100}]})
    assert ok.status_code == 201, ok.text
    assert ok.json()["entryNumber"].startswith("JRN-") and ok.json()["total"] == 100
    rev = client.post(f"/api/accounting/journals/{ok.json()['id']}/reverse", headers=h)
    assert rev.status_code == 200 and rev.json()["isReversal"] is True
    assert client.post(f"/api/accounting/journals/{ok.json()['id']}/reverse", headers=h).status_code == 400
    ledger = client.get(f"/api/accounting/ledger/{a}", headers=h, params={"start_date": "2026-09-01", "end_date": "2026-12-31"}).json()
    assert any(line["debit"] == 100 for line in ledger["lines"]) and any(line["credit"] == 100 for line in ledger["lines"])
    assert trial_balance_ok(client, h)


def test_trial_balance_balances_and_lists_only_used_accounts(client, org):
    tb = client.get("/api/accounting/trial-balance", headers=org["h"]).json()
    assert tb["totalDebit"] == tb["totalCredit"] > 0
    assert all(row["debit"] > 0 or row["credit"] > 0 for row in tb["rows"])
