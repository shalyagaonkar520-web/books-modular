# Connecting Rooman Billing to Rooman Books

This guide is for the developers of Rooman Billing. It covers what Billing sends to Books, where, and how, so Billing's customers, plans, invoices and payments appear in Books automatically and are posted to the ledger.

Data flows **one way only: Billing → Books**. Records that arrive from Billing are read-only in Books; they are changed in Billing, and the change flows across.

## What to send

| When this happens in Billing | Send event | Books creates |
|---|---|---|
| A customer is created | `customer.created` | Contact (customer) |
| A customer's name, email, phone, GSTIN or address changes | `customer.updated` | Updates that contact |
| A plan or add-on is created or its price changes | `plan.upserted` | Item (service, price, GST, HSN/SAC) |
| An invoice is raised (new, renewal, upgrade, prorated) | `invoice.created` | Invoice, marked sent and posted to the ledger |
| A payment is received | `payment.received` | Payment received, applied to the invoice(s) and deposited to the bank |

Send `customer.created` before that customer's first invoice. If an invoice or payment arrives first, Books answers **409** and Billing retries in 30 seconds.

Not sent (they stay in Billing): trials, plan rules, coupons as rules (only the discount on an invoice), dunning and reminders, renewal dates.

## Where and how

```
POST https://books.futureacad.ae/api/internal/events
Content-Type: application/json
X-Rooman-Signature: sha256=<hex HMAC-SHA256 of the exact body, key = EVENT_SIGNING_SECRET>
```

- **The shared secret** is agreed once and set in both apps as `EVENT_SIGNING_SECRET`.
- **The signature is checked before anything is read.** A missing or wrong signature gets **401**.
- **The body is the event envelope** below, serialized exactly as it is signed.

If Billing is in Python, `rooman_sdk` does the work:
- `EventEnvelope(...).to_json()` builds the body;
- `rooman_sdk.events.sign(body, secret)` builds the header;
- `rooman_sdk.outbox` saves the event in the same transaction as the change, so an event is never lost.

### Envelope (every event)

```json
{
  "id": "evt_<32 hex>",
  "type": "invoice.created",
  "version": 1,
  "org_id": "<organization UUID - the same id as in Books and Core>",
  "actor": {"type": "service", "id": "billing"},
  "source": "billing",
  "occurred_at": "2026-10-16T10:00:00Z",
  "data": { "...": "see below" }
}
```

Rules for the envelope:
- **`source`** must be `"billing"`. Books ignores customer events from other sources.
- **`org_id`** is the organization's ID in Books (35 organizations today), written as a UUID.
- **Money** is always a string with at most 2 decimals, e.g. `"1178.82"`. Never a float.
- **Billing's IDs** can be in any format, up to 64 characters.

## Event data

### customer.created / customer.updated
```json
{"app_local_id": "cus_123", "display_name": "Asha Traders", "email": "asha@example.com", "phone": "+919811111111",
 "type": "customer", "company_name": "Asha Traders Pvt Ltd", "gstin": "29ABCDE1234F1Z5", "billing_address": "12 MG Road, Bengaluru",
 "party_id": null}
```
- **`app_local_id`** is Billing's customer ID, and is required.
- **`party_id`** is the shared customer ID from Core, optional for now.
- **`customer.updated`** also needs `"changed": ["display_name", ...]`.

### plan.upserted
```json
{"plan_id": "plan_pro_monthly", "name": "Pro (monthly)", "description": "Pro plan billed monthly",
 "price": "999.00", "currency": "INR", "tax_rate": "18", "hsn_sac": "998314", "is_active": true}
```

### invoice.created
```json
{"invoice_id": "inv_789", "number": "BIL-0001", "customer_id": "cus_123", "date": "2026-10-16", "due_date": "2026-10-31",
 "currency": "INR", "subtotal": "999.00", "discount_total": "0.00", "tax_total": "179.82", "total": "1178.82",
 "lines": [{"description": "Pro (monthly), Oct 2026", "plan_id": "plan_pro_monthly", "quantity": "1", "rate": "999.00", "tax_rate": "18", "hsn_sac": "998314"}]}
```
- **Books recalculates the lines and GST itself.** If its total differs from `total` by more than ₹0.05, it answers **422** (not retried), so a wrong invoice never reaches the ledger.
- **Billing's invoice number** is kept as the reference. The Books invoice gets the next Books number.

### payment.received
```json
{"payment_id": "pay_456", "customer_id": "cus_123", "amount": "1178.82", "currency": "INR", "method": "upi",
 "received_on": "2026-10-16", "reference": "pay_RZP123", "applied_to": [{"invoice_id": "inv_789", "amount": "1178.82"}]}
```
- **`method`** is one of `cash`, `bank_transfer`, `upi`, `card` or `cheque`. Anything else is recorded as `other`.
- **Overpayment:** anything paid beyond the named invoices is kept as the customer's advance.
- **Bank account:** the money is deposited to the organization's default bank account in Books.

## Answers from Books

| Status | Meaning | Billing should |
|---|---|---|
| 200 | Done, or already done before (safe to resend) | Mark it delivered |
| 202 | An event type Books does not use | Mark it delivered |
| 401 | Signature missing or wrong | Check the shared secret |
| 409 | A record it depends on has not arrived yet | Retry (after `Retry-After` seconds) |
| 422 | Can never be applied as sent (unknown organization, totals don't add up, bad data); `detail` says why | Stop retrying and show it as failed |
| 5xx / no answer | Books is busy or down | Retry with backoff |

**Every event is applied once:** a resent event, or the same Billing record in a new event, never creates a second copy in Books.

## In Books
- **Marked "from Billing":** invoices, payments, contacts and items carry `source_app = "billing"` and Billing's ID.
- **Read-only:** editing or deleting them answers **409** with "This record comes from Rooman Billing and is read-only in Books".
- **Switched on by** `INTEGRATION_ENABLED=true` and `EVENT_SIGNING_SECRET` in Books' `.env`.
