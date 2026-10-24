# Connecting an app to Rooman Books

This guide is for developers of another Rooman app (Bookings, Billing, CRM…) or of a customer's own system that needs to use an organization's Books. It covers:

- getting a key;
- calling the API;
- receiving events.

## How it works

- **Asking:** your app calls the normal Books REST API with its own API key. The key only opens the features a platform admin granted it (for example *Invoices: read & write*, *Customers & vendors: read*). It never opens anything else.
- **Being told:** when something changes in Books (a customer is created, an invoice is paid…), Books sends your app a signed **webhook** for the events you subscribed to.
- **Same rules as a person:** the organization's subscription plan, suspension and trial lock apply to your app exactly as they do to its users.

Every Books feature is declared once in `backend/features.py`. A feature added there becomes available to connected apps automatically, behind its own permission, with no extra integration code.

## 1. Get a key

A platform admin opens **Organizations → (organization) → Connected apps → Connect an app** and chooses:

| Setting | What it means |
|---|---|
| App name | Shown in Books' activity log for everything your app does, as "&lt;name&gt; (connected app)". |
| What it can use | Per feature: *No access*, *Read*, or *Read & write*. |
| Webhook URL | Optional. The https address Books posts events to. |
| Events to send | Which events your app receives. Each event needs read access to its feature. |

Books then shows two values **once**:

- **API key** (`rbk_…`): keep it secret, server-side only. If it is lost, the admin issues a new key and the old one stops working at once.
- **Webhook signing secret** (`whsec_…`): used to verify that webhooks really come from Books.

## 2. Call the API

```http
GET /api/connect/v1/me
Authorization: Bearer rbk_1a2b3c4d_...
```

This describes your app, its organization, the features and access levels it holds, the API paths each feature opens, and the plan:

```json
{
  "app": { "id": "…", "name": "Rooman Bookings", "keyPrefix": "rbk_1a2b3c4d" },
  "organization": { "id": "…", "name": "Acme Pvt Ltd", "code": "acme", "subscription": "active" },
  "planModules": ["accounting", "customers", "invoices", "items", "paymentsReceived", "reports"],
  "features": [
    { "key": "contacts", "label": "Customers & vendors", "access": ["read", "write"], "paths": ["/api/contacts"] },
    { "key": "invoices", "label": "Invoices", "access": ["read", "write"], "paths": ["/api/invoices"] }
  ],
  "events": ["invoice.created", "payment_received.created"]
}
```

Everything else is the same API the Books web app uses, with the same JSON (camelCase). The interactive reference is at `/docs` on a non-production server.

| Feature key | API paths |
|---|---|
| `items` | `/api/items`, `/api/inventory-adjustments` |
| `contacts` | `/api/contacts` |
| `invoices` | `/api/invoices` |
| `paymentsReceived` | `/api/customer-payments` |
| `bills` | `/api/bills` |
| `paymentsMade` | `/api/vendor-payments` |
| `expenses` | `/api/expenses` |
| `banking` | `/api/banking` |
| `accounting` | `/api/accounting` |
| `timeTracking` | `/api/projects`, `/api/time-entries` |
| `documents` | `/api/documents` |
| `payroll` | `/api/payroll` |
| `reports` | `/api/reports` |

Read access opens `GET`; write access also opens `POST`, `PUT`, `PATCH` and `DELETE`. Users, settings, the dashboard, subscriptions and the admin panels are never reachable with a key.

### Example: create a customer, then an invoice

```http
POST /api/contacts
Authorization: Bearer rbk_…
Idempotency-Key: booking-8841-customer
Content-Type: application/json

{ "type": "customer", "displayName": "Priya Sharma", "email": "priya@example.com" }
```

```http
POST /api/invoices
Authorization: Bearer rbk_…
Idempotency-Key: booking-8841-invoice
Content-Type: application/json

{ "customerId": "<id from above>", "date": "2026-10-10",
  "lines": [{ "description": "Consultation, 10 Oct", "quantity": 1, "rate": 1500, "taxRate": 18 }] }
```

### Safe retries: `Idempotency-Key`

Send a unique `Idempotency-Key` header (up to 120 characters) on every write. If the request times out and you retry with the same key, Books returns the first response (header `Idempotent-Replayed: true`) instead of doing the work twice.

| Situation | Answer |
|---|---|
| Same key, a different body | 422 |
| Same key, first request still running | 409; retry after 2 seconds |
| First request failed with a 5xx | Not stored, so your retry runs again |
| Key older than 24 hours | Expired |

### Errors and limits

| Status | Meaning |
|---|---|
| 401 | Missing, wrong, rotated or revoked key. |
| 402 | The organization's free trial has ended without a plan. |
| 403 | The key lacks the permission (the message names it, e.g. `invoices:write`), or the feature is not in the organization's plan. |
| 404 | Not found, or belongs to another organization. Keys never see other organizations. |
| 409 | Duplicate (e.g. an invoice number already used), or an idempotent request still running. |
| 422 | Validation error. `detail` lists the fields. |
| 429 | More than the per-app limit (default 300 requests a minute). Slow down and retry. |
| 503 | Books is busy. Retry after `Retry-After` seconds. |

Error bodies look like `{"detail": "…", "requestId": "…"}`. Quote the `requestId` when reporting a problem.

## 3. Receive events

Books POSTs JSON to your webhook URL:

```http
POST /webhooks/books
Content-Type: application/json
X-Rooman-Event: invoice.created
X-Rooman-Delivery: 5b1f…            (same value on every retry of this delivery)
X-Rooman-Signature: t=1760090000,v1=3f7a…

{
  "id": "e81c…",                    (event id: de-duplicate on this)
  "type": "invoice.created",
  "version": 1,
  "source": "books",
  "organizationId": "…",
  "occurredAt": "2026-10-10T09:30:00+00:00",
  "data": { "id": "…", "invoiceNumber": "INV-000123", "customerId": "…", "status": "sent", "total": "1770.00", "amountPaid": "0.00", "date": "2026-10-10", "dueDate": "2026-10-25" }
}
```

`data` is a short summary. Fetch the full record from the API with its `id` if you need more.

### Event types

`<record>.created`, `<record>.updated` and `<record>.deleted` for each of:

| Record | Needs read access to |
|---|---|
| `contact` | contacts |
| `item` | items |
| `invoice` | invoices |
| `payment_received` | paymentsReceived |
| `bill` | bills |
| `payment_made` | paymentsMade |
| `expense` | expenses |

A test from the admin screen sends `ping`.

### Verify every webhook

Compute an HMAC-SHA256 of `"<t>.<raw body>"` with the signing secret. Compare it with `v1` in constant time, and reject anything older than 5 minutes.

```python
import hashlib, hmac, time

def verify(secret: str, header: str, body: bytes) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    expected = hmac.new(secret.encode(), f"{parts['t']}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
```

```js
import crypto from 'node:crypto';
function verify(secret, header, rawBody) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
```

### Answer quickly, process once

- Reply with any **2xx within 10 seconds**, then do the work, ideally in a queue.
- Anything else counts as a failure.
- Failures are retried after 30 s, 2 min, 10 min, 1 h, 6 h, 12 h and 24 h. After that the delivery is marked failed, and a platform admin can send it again from **Connected apps → Deliveries**.
- Delivery is *at least once*. Store the event `id` and ignore repeats.
- Redirects are not followed.

### Webhook addresses

- In production, webhook URLs must be `https://`.
- Addresses on the private network (other Rooman apps on the same servers) are refused unless the server's `WEBHOOK_ALLOWED_HOSTS` lists the host. This stops a webhook from being aimed at internal services.

## Security summary

- Only the SHA-256 of a key is stored. Keys are shown once and can be rotated or revoked at any time.
- Each key is tied to one organization and to an internal account that:
  - can never sign in;
  - is not counted as a user or an admin;
  - is not listed with the organization's users.
- Default deny: a key reaches only the paths of features it was granted. Admin, user, settings and platform areas are always closed to it.
- Everything a key changes is in the organization's activity log under the app's name.
- Rate limited per app. Writes are idempotent with `Idempotency-Key`.
- Webhooks are signed, are never sent to internal addresses unless allowed, and don't follow redirects.
