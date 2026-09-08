#!/usr/bin/env bash
# End-to-end smoke test against a running API: registers an organization and
# walks a real accounting workflow, asserting the ledger stays balanced.
set -euo pipefail

BASE="${1:-http://localhost:8000}"
SUFFIX="$(date +%s)$$"
EMAIL="smoke${SUFFIX}@example.com"

say() { printf '\n== %s\n' "$1"; }
jqr() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1"; }

say "health"
curl -fsS "$BASE/api/health" | grep -q '"status":"healthy"'

say "register organization"
TOKEN=$(curl -fsS -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Admin\",\"email\":\"$EMAIL\",\"password\":\"Str0ngPass!\",\"organizationName\":\"Smoke Org $SUFFIX\"}" \
  | jqr "['accessToken']")
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

say "create bank account"
BANK=$(curl -fsS -X POST "$BASE/api/banking/accounts" "${AUTH[@]}" \
  -d '{"name":"Smoke Bank","type":"bank","openingBalance":100000,"openingBalanceDate":"2026-04-01","isPrimary":true}' | jqr "['id']")

say "create customer, vendor and item"
CUST=$(curl -fsS -X POST "$BASE/api/contacts" "${AUTH[@]}" -d '{"type":"customer","displayName":"Smoke Customer","paymentTermsDays":15}' | jqr "['id']")
VEND=$(curl -fsS -X POST "$BASE/api/contacts" "${AUTH[@]}" -d '{"type":"vendor","displayName":"Smoke Vendor"}' | jqr "['id']")
ITEM=$(curl -fsS -X POST "$BASE/api/items" "${AUTH[@]}" \
  -d '{"name":"Smoke Item","sku":"SMK-1","type":"goods","sellingPrice":1000,"costPrice":600,"taxRate":18,"trackInventory":true,"openingStock":50,"openingStockRate":600,"reorderLevel":5}' | jqr "['id']")

say "raise and part-pay an invoice"
INV=$(curl -fsS -X POST "$BASE/api/invoices" "${AUTH[@]}" \
  -d "{\"customerId\":\"$CUST\",\"date\":\"2026-09-01\",\"status\":\"sent\",\"lines\":[{\"itemId\":\"$ITEM\",\"description\":\"Smoke Item\",\"quantity\":4,\"rate\":1000,\"taxRate\":18}]}")
INV_ID=$(echo "$INV" | jqr "['id']")
echo "$INV" | grep -q '"total":4720'
curl -fsS -X POST "$BASE/api/customer-payments" "${AUTH[@]}" \
  -d "{\"customerId\":\"$CUST\",\"invoiceId\":\"$INV_ID\",\"bankAccountId\":\"$BANK\",\"date\":\"2026-09-05\",\"amount\":2000,\"mode\":\"upi\"}" > /dev/null
curl -fsS "$BASE/api/invoices/$INV_ID" "${AUTH[@]}" | grep -q '"status":"partially_paid"'

say "record a bill and an expense"
curl -fsS -X POST "$BASE/api/bills" "${AUTH[@]}" \
  -d "{\"vendorId\":\"$VEND\",\"date\":\"2026-09-02\",\"status\":\"open\",\"lines\":[{\"itemId\":\"$ITEM\",\"description\":\"Restock\",\"quantity\":10,\"rate\":580,\"taxRate\":18}]}" > /dev/null
RENT=$(curl -fsS "$BASE/api/accounting/accounts?type=expense" "${AUTH[@]}" | python3 -c "import sys,json;print(next(a['id'] for a in json.load(sys.stdin) if a['code']=='6300'))")
curl -fsS -X POST "$BASE/api/expenses" "${AUTH[@]}" \
  -d "{\"date\":\"2026-09-03\",\"accountId\":\"$RENT\",\"paidThroughAccountId\":\"$BANK\",\"amount\":15000,\"taxRate\":18}" > /dev/null

say "ledger integrity"
python3 - "$BASE" "$TOKEN" <<'PY'
import json, sys, urllib.request
base, token = sys.argv[1], sys.argv[2]

def get(path):
    req = urllib.request.Request(base + path, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as res:
        return json.load(res)

tb = get("/api/accounting/trial-balance")
assert abs(tb["totalDebit"] - tb["totalCredit"]) < 0.005, f"trial balance out by {tb['totalDebit'] - tb['totalCredit']}"
bs = get("/api/reports/balance-sheet")
assert bs["isBalanced"], "balance sheet does not balance"
dash = get("/api/dashboard/summary?period=this_fiscal_year")
assert dash["receivables"]["totalReceivables"] > 0, "expected receivables"
assert dash["payables"]["totalPayables"] > 0, "expected payables"
pl = get("/api/reports/profit-and-loss")
assert pl["income"]["total"] > 0, "expected income"
print(f"trial balance {tb['totalDebit']:.2f} = {tb['totalCredit']:.2f}; balance sheet balanced; dashboard populated")
PY

say "smoke test passed"
