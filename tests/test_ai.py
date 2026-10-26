"""AI assistant (Claude API mocked - no network) and the cash-flow forecast."""

import json
from datetime import date, timedelta
from types import SimpleNamespace

import anthropic
import httpx
import pytest

from backend.config import get_settings
from backend.services import ai
from tests.conftest import auth, invite_and_accept, register_org

TODAY = date.today()


def _text(payload):
    return SimpleNamespace(type="text", text=payload if isinstance(payload, str) else json.dumps(payload))


def _response(*blocks, stop="end_turn"):
    return SimpleNamespace(content=list(blocks), stop_reason=stop, stop_details=None)


class FakeClient:
    """Answers each messages.create with the next scripted response and records the calls."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture
def fake(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "anthropic_api_key", "test-key")
    holder = {}

    def install(*responses):
        client = FakeClient(responses)
        monkeypatch.setattr(ai, "client_factory", lambda: client)
        holder["client"] = client
        return client

    return install


@pytest.fixture
def books(client):
    ctx = register_org(client, "Ai")
    h = auth(ctx["token"])
    bank = client.post(
        "/api/banking/accounts",
        headers=h,
        json={"name": "Bank", "type": "bank", "openingBalance": 50000, "openingBalanceDate": "2025-01-01"},
    ).json()
    vendor = client.post(
        "/api/contacts",
        headers=h,
        json={"type": "vendor", "displayName": "Paper Mart", "gstin": "29AAACP1234A1Z5", "gstTreatment": "registered_business"},
    ).json()
    customer = client.post("/api/contacts", headers=h, json={"type": "customer", "displayName": "Big Buyer"}).json()
    accounts = {a["code"]: a for a in client.get("/api/accounting/accounts", headers=h).json()}
    return {"h": h, "bank": bank, "vendor": vendor, "customer": customer, "accounts": accounts}


def test_not_configured_answers_503(client, books, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "")
    assert client.get("/api/ai/status", headers=books["h"]).json()["configured"] is False
    res = client.post("/api/ai/ask", headers=books["h"], json={"question": "How are we doing?"})
    assert res.status_code == 503


def test_extract_document_matches_vendor_and_accounts(client, books, fake):
    draft = {
        "document_type": "bill",
        "vendor_name": "PAPER MART",
        "vendor_gstin": "29aaacp1234a1z5",
        "bill_number": "PM-88",
        "date": TODAY.isoformat(),
        "due_date": "",
        "currency": "INR",
        "subtotal": 1000,
        "discount": 0,
        "tax_total": 180,
        "total": 1180,
        "payment_method": "",
        "category": "Office Supplies",
        "notes": "",
        "lines": [
            {
                "description": "A4 paper",
                "hsn_sac": "4802",
                "quantity": 10,
                "rate": 100,
                "tax_rate": 18,
                "amount": 1000,
                "account_code": "6200",
            },
            {"description": "Bogus", "hsn_sac": "", "quantity": 1, "rate": 0, "tax_rate": 0, "amount": 0, "account_code": "9999"},
        ],
    }
    client_ = fake(_response(_text(draft)))
    res = client.post("/api/ai/extract-document", headers=books["h"], files={"file": ("bill.png", b"\x89PNG fake", "image/png")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vendor_id"] == books["vendor"]["id"]
    assert body["lines"][0]["account_id"] == books["accounts"]["6200"]["id"]
    assert body["lines"][1]["account_id"] is None
    call = client_.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["fallbacks"] == "default"
    assert call["output_config"]["format"]["type"] == "json_schema"
    content = call["messages"][0]["content"]
    assert content[0]["type"] == "image" and content[0]["source"]["media_type"] == "image/png"
    assert "6200: Office Supplies" in content[1]["text"]

    bad = client.post("/api/ai/extract-document", headers=books["h"], files={"file": ("x.txt", b"hello", "text/plain")})
    assert bad.status_code == 400


def test_categorize_keeps_only_known_accounts(client, books, fake):
    fake(
        _response(
            _text(
                {
                    "suggestions": [
                        {"index": 0, "account_code": "6100", "confidence": "high", "reason": "bank charge"},
                        {"index": 1, "account_code": "1010", "confidence": "low", "reason": "a bank account is never a counter-account"},
                        {"index": 7, "account_code": "6300", "confidence": "high", "reason": "out of range"},
                    ]
                }
            )
        )
    )
    res = client.post(
        "/api/ai/categorize",
        headers=books["h"],
        json={
            "rows": [
                {"description": "SMS CHARGES", "amount": 17.7, "type": "withdrawal"},
                {"description": "NEFT", "amount": 500, "type": "deposit"},
            ]
        },
    )
    assert res.status_code == 200, res.text
    s = res.json()["suggestions"]
    assert len(s) == 1 and s[0]["account_code"] == "6100" and s[0]["index"] == 0


def test_ask_runs_read_only_tools(client, books, fake):
    h = books["h"]
    client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": books["customer"]["id"],
            "date": TODAY.isoformat(),
            "status": "sent",
            "lines": [{"accountId": books["accounts"]["4000"]["id"], "description": "Work", "quantity": 1, "rate": 25000, "taxRate": 0}],
        },
    )
    tool_call = SimpleNamespace(type="tool_use", id="tu_1", name="search_invoices", input={"status": "unpaid"})
    pl_call = SimpleNamespace(type="tool_use", id="tu_2", name="profit_and_loss", input={})
    client_ = fake(_response(tool_call, pl_call, stop="tool_use"), _response(_text("Big Buyer owes Rs 25,000.")))
    res = client.post("/api/ai/ask", headers=h, json={"question": "Who owes us money?"})
    assert res.status_code == 200, res.text
    assert res.json() == {"answer": "Big Buyer owes Rs 25,000.", "tools_used": ["search_invoices", "profit_and_loss"]}
    # Both results go back in one user message, matched to their tool_use ids.
    results = client_.calls[1]["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in results] == ["tu_1", "tu_2"]
    invoices = json.loads(results[0]["content"])
    assert invoices[0]["contact"] == "Big Buyer" and invoices[0]["balance_due"] == 25000
    assert "net_profit" in json.loads(results[1]["content"])
    assert "tool_choice" not in client_.calls[0]


def test_ask_respects_roles_and_bad_tool_input(client, books, fake):
    h = books["h"]
    invite_and_accept(client, h, "Sam Staff", "sam.staff@ai.example.com", "staff", "Staff1Pass!")
    staff = auth(
        client.post("/api/auth/login", json={"email": "sam.staff@ai.example.com", "password": "Staff1Pass!"}).json()["accessToken"]
    )
    blocked = SimpleNamespace(type="tool_use", id="tu_1", name="balance_sheet", input={})
    bad_date = SimpleNamespace(type="tool_use", id="tu_2", name="sales_by_customer", input={"start_date": "last week"})
    client_ = fake(_response(blocked, bad_date, stop="tool_use"), _response(_text("I cannot see that.")))
    res = client.post("/api/ai/ask", headers=staff, json={"question": "What is our balance sheet?"})
    assert res.status_code == 200
    results = client_.calls[1]["messages"][-1]["content"]
    assert all(r["is_error"] for r in results)
    assert "role" in results[0]["content"] and "YYYY-MM-DD" in results[1]["content"]


def test_api_errors_and_refusals_are_mapped(client, books, fake):
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    fake(anthropic.RateLimitError("slow down", response=httpx.Response(429, request=request), body=None))
    assert client.post("/api/ai/ask", headers=books["h"], json={"question": "Profit?"}).status_code == 429
    fake(anthropic.APIConnectionError(request=request))
    assert client.post("/api/ai/ask", headers=books["h"], json={"question": "Profit?"}).status_code == 503
    refusal = SimpleNamespace(content=[], stop_reason="refusal", stop_details=SimpleNamespace(explanation="Declined", category=None))
    fake(refusal)
    res = client.post("/api/ai/ask", headers=books["h"], json={"question": "Profit?"})
    assert res.status_code == 422 and res.json()["detail"] == "Declined"


def test_cash_forecast(client, books):
    h = books["h"]
    due = (TODAY + timedelta(days=10)).isoformat()
    client.post(
        "/api/invoices",
        headers=h,
        json={
            "customerId": books["customer"]["id"],
            "date": TODAY.isoformat(),
            "dueDate": due,
            "status": "sent",
            "lines": [{"accountId": books["accounts"]["4000"]["id"], "description": "x", "quantity": 1, "rate": 20000, "taxRate": 0}],
        },
    )
    client.post(
        "/api/bills",
        headers=h,
        json={
            "vendorId": books["vendor"]["id"],
            "date": TODAY.isoformat(),
            "dueDate": due,
            "lines": [{"accountId": books["accounts"]["6200"]["id"], "description": "y", "quantity": 1, "rate": 80000, "taxRate": 0}],
        },
    )
    f = client.get("/api/ai/cash-forecast", headers=h).json()
    assert f["openingCash"] == 50000 and len(f["weeks"]) == 13
    week2 = f["weeks"][1]
    assert week2["inflow"] == 20000 and week2["outflow"] == 80000
    assert f["lowestBalance"] == -10000 and f["lowestWeek"] == f["weeks"][1]["weekStart"]
