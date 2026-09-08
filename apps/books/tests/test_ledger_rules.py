"""Direct tests for the posting rules that every module depends on."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException

from backend.db import SessionLocal
from backend.models import Account, JournalEntry
from backend.services import ledger
from backend.services.money import D, money, qty
from backend.services.periods import add_months, fiscal_year_bounds, quarter_bounds, resolve_period
from tests.conftest import auth, register_org


@pytest.fixture(scope="module")
def ledger_org(client):
    ctx = register_org(client, "LedgerRules")
    headers = auth(ctx["token"])
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=headers).json()}
    return {"org_id": ctx["user"]["organizationId"], "h": headers, "accounts": accounts, "user_id": ctx["user"]["id"]}


def test_unbalanced_entry_is_rejected(ledger_org):
    with SessionLocal() as db:
        with pytest.raises(HTTPException) as excinfo:
            ledger.post_entry(
                db,
                ledger_org["org_id"],
                date(2026, 9, 1),
                [
                    (ledger_org["accounts"]["6200"]["id"], Decimal("100"), Decimal("0"), "Supplies", None),
                    (ledger_org["accounts"]["1000"]["id"], Decimal("0"), Decimal("90"), "Cash", None),
                ],
                source_type="manual",
            )
        assert excinfo.value.status_code == 400
        assert "not balanced" in excinfo.value.detail


def test_entry_with_only_zero_lines_is_rejected(ledger_org):
    with SessionLocal() as db:
        with pytest.raises(HTTPException) as excinfo:
            ledger.post_entry(
                db,
                ledger_org["org_id"],
                date(2026, 9, 1),
                [(ledger_org["accounts"]["6200"]["id"], Decimal("0"), Decimal("0"), "Nothing", None)],
                source_type="manual",
            )
        assert excinfo.value.status_code == 400


def test_negative_amounts_are_rejected(ledger_org):
    with SessionLocal() as db:
        with pytest.raises(HTTPException) as excinfo:
            ledger.post_entry(
                db,
                ledger_org["org_id"],
                date(2026, 9, 1),
                [
                    (ledger_org["accounts"]["6200"]["id"], Decimal("-50"), Decimal("0"), "Negative", None),
                    (ledger_org["accounts"]["1000"]["id"], Decimal("0"), Decimal("-50"), "Negative", None),
                ],
                source_type="manual",
            )
        assert excinfo.value.status_code == 400
        assert "negative" in excinfo.value.detail


def test_accounts_from_another_organization_are_rejected(client, ledger_org):
    other = register_org(client, "OtherLedger")
    other_accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=auth(other["token"])).json()}
    with SessionLocal() as db:
        with pytest.raises(HTTPException) as excinfo:
            ledger.post_entry(
                db,
                ledger_org["org_id"],
                date(2026, 9, 1),
                [
                    (other_accounts["6200"]["id"], Decimal("10"), Decimal("0"), "Cross tenant", None),
                    (ledger_org["accounts"]["1000"]["id"], Decimal("0"), Decimal("10"), "Cross tenant", None),
                ],
                source_type="manual",
            )
        assert excinfo.value.status_code == 400
        assert "organization" in excinfo.value.detail


def test_reversal_is_posted_once_and_cancels_the_original(ledger_org):
    org_id = ledger_org["org_id"]
    expense = ledger_org["accounts"]["6200"]["id"]
    cash = ledger_org["accounts"]["1000"]["id"]
    with SessionLocal() as db:
        entry = ledger.post_entry(
            db,
            org_id,
            date(2026, 9, 1),
            [(expense, Decimal("250"), Decimal("0"), "Stationery", None), (cash, Decimal("0"), Decimal("250"), "Stationery", None)],
            source_type="manual",
        )
        entry.source_id = entry.id
        db.commit()
        source_id = entry.id

        first = ledger.reverse_entries_for_source(db, org_id, "manual", source_id, date(2026, 9, 2))
        db.commit()
        assert len(first) == 1
        assert first[0].is_reversal is True

        # A second attempt must not double-reverse.
        second = ledger.reverse_entries_for_source(db, org_id, "manual", source_id, date(2026, 9, 3))
        db.commit()
        assert second == []

        balances = ledger.account_balances(db, org_id, account_ids=[expense])
        debit, credit = balances.get(expense, (Decimal("0"), Decimal("0")))
        assert money(debit - credit) == Decimal("0.00")


def test_entry_numbers_increment_per_organization(client):
    ctx = register_org(client, "Numbering")
    headers = auth(ctx["token"])
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=headers).json()}
    numbers = []
    for _ in range(3):
        res = client.post(
            "/api/accounting/journals",
            headers=headers,
            json={
                "date": "2026-09-01",
                "lines": [
                    {"accountId": accounts["6200"]["id"], "debit": 10},
                    {"accountId": accounts["1000"]["id"], "credit": 10},
                ],
            },
        )
        assert res.status_code == 201, res.text
        numbers.append(res.json()["entryNumber"])
    assert numbers == ["JRN-00001", "JRN-00002", "JRN-00003"]


def test_natural_balance_direction_by_account_type():
    assert ledger.natural_balance("asset", Decimal("500"), Decimal("120")) == Decimal("380.00")
    assert ledger.natural_balance("expense", Decimal("500"), Decimal("120")) == Decimal("380.00")
    assert ledger.natural_balance("liability", Decimal("120"), Decimal("500")) == Decimal("380.00")
    assert ledger.natural_balance("income", Decimal("120"), Decimal("500")) == Decimal("380.00")
    assert ledger.natural_balance("equity", Decimal("0"), Decimal("500")) == Decimal("500.00")


def test_money_and_quantity_rounding():
    assert money("10.005") == Decimal("10.01")
    assert money(None) == Decimal("0.00")
    assert money(1234.5649) == Decimal("1234.56")
    assert qty("2.0005") == Decimal("2.001")
    assert D(None) == Decimal("0")


def test_period_helpers_follow_the_indian_fiscal_year():
    start, end = fiscal_year_bounds(date(2026, 9, 8), 4)
    assert (start, end) == (date(2026, 4, 1), date(2027, 3, 31))

    start, end = fiscal_year_bounds(date(2026, 2, 8), 4)
    assert (start, end) == (date(2025, 4, 1), date(2026, 3, 31))

    q_start, q_end = quarter_bounds(date(2026, 9, 8), 4)
    assert (q_start, q_end) == (date(2026, 7, 1), date(2026, 9, 30))

    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)

    fy_start, fy_end, buckets = resolve_period("this_fiscal_year", date(2026, 9, 8), 4)
    assert (fy_start, fy_end) == (date(2026, 4, 1), date(2027, 3, 31))
    assert len(buckets) == 12
    assert buckets[0][0] == "Apr 26"

    m_start, m_end, week_buckets = resolve_period("this_month", date(2026, 9, 8), 4)
    assert (m_start, m_end) == (date(2026, 9, 1), date(2026, 9, 30))
    assert len(week_buckets) == 5
    assert week_buckets[0][1] == date(2026, 9, 1)
    assert week_buckets[-1][2] == date(2026, 9, 30)

    l_start, l_end, _ = resolve_period("last_month", date(2026, 1, 15), 4)
    assert (l_start, l_end) == (date(2025, 12, 1), date(2025, 12, 31))


def test_journal_entries_record_their_source(ledger_org):
    with SessionLocal() as db:
        entries = db.query(JournalEntry).filter(JournalEntry.organization_id == ledger_org["org_id"]).all()
        assert entries, "expected entries from the fixtures above"
        assert all(entry.source_type for entry in entries)
        assert all(entry.total > 0 for entry in entries)
        for entry in entries:
            debits = sum((line.debit for line in entry.lines), Decimal("0"))
            credits = sum((line.credit for line in entry.lines), Decimal("0"))
            assert debits == credits, f"{entry.entry_number} is unbalanced"


def test_system_accounts_exist_for_every_posting_path(ledger_org):
    """Every account code the posting services look up must be bootstrapped."""
    required = {"1000", "1100", "1200", "1300", "1400", "2000", "2100", "2200", "2310", "2320", "2400", "3100", "4000", "4300", "5000", "5900", "6400", "7000"}
    with SessionLocal() as db:
        codes = {
            code
            for (code,) in db.query(Account.code).filter(Account.organization_id == ledger_org["org_id"]).all()
        }
    assert required <= codes, f"missing bootstrap accounts: {sorted(required - codes)}"
