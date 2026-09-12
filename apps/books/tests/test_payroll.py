"""Payroll: salary_day, the daily-accrual display fields on an employee, and
leave records that automatically feed loss-of-pay when a pay run is created."""
import calendar
from datetime import date

from tests.conftest import auth, register_org


def _employee(client, h, **overrides):
    payload = {"name": "Asha Rao", "dateOfJoining": "2020-01-01", "basicSalary": 30000}
    payload.update(overrides)
    res = client.post("/api/payroll/employees", headers=h, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_salary_day_round_trips_and_clamps_to_month_length(client):
    ctx = register_org(client, "PayrollDay")
    h = auth(ctx["token"])
    emp = _employee(client, h, salaryDay=31)
    assert emp["salaryDay"] == 31

    today = date.today()
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    next_pay = date.fromisoformat(emp["nextPayDate"])
    # A month shorter than 31 days clamps the pay date to its own last day.
    assert next_pay.day == min(31, days_in_month) or (next_pay.month != today.month and next_pay.day == calendar.monthrange(next_pay.year, next_pay.month)[1])

    updated = client.put(f"/api/payroll/employees/{emp['id']}", headers=h, json={"salaryDay": 5}).json()
    assert updated["salaryDay"] == 5


def test_salary_day_unset_defaults_to_last_day_of_month(client):
    ctx = register_org(client, "PayrollDefault")
    h = auth(ctx["token"])
    emp = _employee(client, h)
    assert emp["salaryDay"] is None

    next_pay = date.fromisoformat(emp["nextPayDate"])
    assert next_pay.day == calendar.monthrange(next_pay.year, next_pay.month)[1]


def test_accrual_fields_are_internally_consistent(client):
    ctx = register_org(client, "PayrollAccrual")
    h = auth(ctx["token"])
    emp = _employee(client, h, basicSalary=30000, hra=5000, otherAllowances=1000)

    gross = 36000
    days_in_period = emp["daysInPeriod"]
    assert days_in_period == calendar.monthrange(date.today().year, date.today().month)[1]
    assert abs(emp["dailyRate"] - round(gross / days_in_period, 2)) < 0.01
    assert emp["daysElapsedThisPeriod"] >= 1
    assert abs(emp["accruedThisPeriod"] - round(emp["dailyRate"] * emp["daysElapsedThisPeriod"], 2)) < 0.02
    assert emp["accruedThisPeriod"] <= gross + 0.01


def test_employee_not_yet_joined_this_period_has_no_accrual_yet(client):
    ctx = register_org(client, "PayrollFuture")
    h = auth(ctx["token"])
    future = date.today().replace(day=28) if date.today().month == 12 else date.today().replace(month=date.today().month + 1, day=1)
    emp = _employee(client, h, dateOfJoining=future.isoformat())
    assert emp["daysElapsedThisPeriod"] == 0
    assert emp["accruedThisPeriod"] == 0


def test_leave_crud_and_duplicate_rejected(client):
    ctx = register_org(client, "PayrollLeave")
    h = auth(ctx["token"])
    emp = _employee(client, h)

    created = client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=h, json={"date": "2026-09-03", "leaveType": "unpaid", "notes": "Sick"})
    assert created.status_code == 201, created.text
    rec = created.json()
    assert rec["employeeId"] == emp["id"] and rec["leaveType"] == "unpaid"

    dup = client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=h, json={"date": "2026-09-03"})
    assert dup.status_code == 409

    listed = client.get(f"/api/payroll/employees/{emp['id']}/leaves", headers=h).json()
    assert len(listed) == 1

    deleted = client.delete(f"/api/payroll/leaves/{rec['id']}", headers=h)
    assert deleted.status_code == 200
    assert client.get(f"/api/payroll/employees/{emp['id']}/leaves", headers=h).json() == []


def test_unpaid_leave_auto_fills_loss_of_pay_on_pay_run(client):
    ctx = register_org(client, "PayrollLop")
    h = auth(ctx["token"])
    emp = _employee(client, h, basicSalary=30000)

    for day in ("2026-09-10", "2026-09-11"):
        res = client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=h, json={"date": day, "leaveType": "unpaid"})
        assert res.status_code == 201, res.text
    # Paid leave must never count as loss-of-pay.
    client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=h, json={"date": "2026-09-12", "leaveType": "paid"})

    run = client.post("/api/payroll/pay-runs", headers=h, json={"periodYear": 2026, "periodMonth": 9}).json()
    slip = run["payslips"][0]
    assert slip["lossOfPayDays"] == 2
    days_in_month = calendar.monthrange(2026, 9)[1]
    expected_lop = round(30000 * 2 / days_in_month, 2)
    assert abs(slip["lossOfPayAmount"] - expected_lop) < 0.02


def test_explicit_loss_of_pay_override_wins_over_leave_records(client):
    ctx = register_org(client, "PayrollLopOverride")
    h = auth(ctx["token"])
    emp = _employee(client, h, basicSalary=30000)

    client.post(f"/api/payroll/employees/{emp['id']}/leaves", headers=h, json={"date": "2026-10-05", "leaveType": "unpaid"})

    run = client.post(
        "/api/payroll/pay-runs", headers=h,
        json={"periodYear": 2026, "periodMonth": 10, "lossOfPay": {emp["id"]: 5}},
    ).json()
    slip = run["payslips"][0]
    assert slip["lossOfPayDays"] == 5
