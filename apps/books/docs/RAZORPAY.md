# Razorpay integration

Rooman Books imports Razorpay payments into its own transaction table, categorises
them, matches them to invoices and posts the resulting entries through the existing
double-entry ledger. This document covers configuration, how the sync behaves, and
what it deliberately refuses to do on its own.

## Configuration

All credentials are read from the server environment. There are no defaults in the
code — a missing key means the integration reports itself as *not connected*, never
that it silently used something else.

| Variable | Required | Purpose |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | yes | Razorpay API key id (`rzp_test_…` / `rzp_live_…`) |
| `RAZORPAY_KEY_SECRET` | yes | API secret. Server-side only; never sent to the browser |
| `RAZORPAY_WEBHOOK_SECRET` | for webhooks | Signing secret used to verify inbound webhooks. Required when running live in production |
| `RAZORPAY_MODE` | no (`test`) | `test` or `live`. Controls display and the offline development fallbacks |
| `RAZORPAY_SYNC_ENABLED` | no (`true`) | Enables the background sync loop |
| `RAZORPAY_SYNC_INTERVAL_MINUTES` | no (`30`) | How often the loop checks Razorpay (5–1440) |
| `RAZORPAY_SYNC_INITIAL_DAYS` | no (`365`) | How far back the first import reaches |
| `RAZORPAY_SYNC_OVERLAP_MINUTES` | no (`60`) | Re-scan window before the last sync so late captures are not missed |

`RAZORPAY_MODE` does **not** decide which Razorpay account is used — the key does.
A `rzp_live_` key talks to the live account even when the mode says `test`. Use a
`rzp_test_` key pair for test runs.

### Running in test mode

1. In the Razorpay dashboard, switch to **Test mode** and copy the key pair from
   *Settings → API Keys*.
2. Put them in `.env` (which is gitignored) as `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET`, and leave `RAZORPAY_MODE=test`.
3. Restart the API. Open **Settings → Integrations → Razorpay** and confirm the
   status reads *Connected · Test mode*.
4. Press **Sync now**. The first run imports up to `RAZORPAY_SYNC_INITIAL_DAYS` of
   history; later runs only fetch what is new.

Switching to live is a server configuration change: replace the key pair with the
live one, set `RAZORPAY_MODE=live`, and restart. Nothing in the UI can change modes,
and no secret is ever entered through the browser.

### Webhooks

Create a webhook in the Razorpay dashboard pointing at
`https://<your-host>/api/razorpay/webhook`, set its signing secret to
`RAZORPAY_WEBHOOK_SECRET`, and subscribe to `payment.captured`, `payment.failed`,
`refund.created`, `refund.processed` and `settlement.processed`.

Every request is verified against the secret with HMAC SHA256 before it is read.
Unsigned and wrongly signed requests are rejected with `400`. Events are recorded by
`event_id`, so a replayed webhook is answered `already_processed` rather than
double-counted.

## How synchronisation works

A run walks Razorpay's `payment.all` endpoint using `skip`/`count` pagination (100
per page, the API maximum), stopping at the first short page. Each payment is keyed
on its Razorpay payment id, which carries a **unique constraint** — the same payment
cannot be imported twice regardless of which path saw it first.

Each page is committed as it completes, so a run interrupted halfway keeps
everything it had already imported; the next run continues safely without creating
duplicates. Windows overlap the previous run by `RAZORPAY_SYNC_OVERLAP_MINUTES`
because a payment captured just after the last cursor would otherwise be missed.

Every run writes a `razorpay_sync_logs` row that always reaches a terminal state —
`completed`, `partial` or `failed` — with counts and, on failure, the reason.
Nothing fails silently. A single malformed record is counted as failed and the rest
of the page still imports.

Automatic syncing is opt-in per organisation: the loop only visits organisations
that have run at least one sync from the integrations screen, so one set of
credentials is never fanned out across every tenant.

## Categorisation

Applied in order; the first match wins:

1. **A user rule** (Payments → Categories) — accepted outright.
2. **A linked invoice or matched customer** — accepted outright.
3. **Description / notes keywords** — stored as a *suggestion* with a confidence.
4. **The payment's own attributes** — a low-confidence *suggestion*.
5. Otherwise **uncategorised**, left for a person.

Only the first two ever post accounting entries on their own. Everything else stays
a suggestion with its confidence visible until somebody accepts it, so a
low-confidence guess never becomes a journal entry.

## Invoice matching

Open invoices are scored on whether the payment references the invoice id or number,
whether the customer agrees, and whether the amount matches the outstanding balance.
A payment from a known customer is never matched to a different customer's invoice.

The sync **suggests**; it does not book. An invoice is marked paid only when a person
confirms the match, or would be only when the evidence is conclusive. If two invoices
score within 0.20 of each other the match is reported as *ambiguous* and left alone —
paying off the wrong invoice is more expensive than asking.

Confirming a match posts, through the existing ledger:

```
Dr  Razorpay / bank deposit account   25,000
    Cr  Accounts Receivable                    25,000

Dr  Bank Fees and Charges                500
Dr  Input GST                             90
    Cr  Razorpay / bank deposit account          590
```

Net settled: 24,410.

## What is stored

Payments keep the Razorpay ids, amount, currency, status, method, payer email and
contact, description, timestamps, fee, tax, refund total, category and reconciliation
state, plus a sanitised copy of the gateway payload for audit.

Card data is reduced to **network, type, issuer and last four digits**. Full card
numbers, CVVs, one-time passwords, tokens and any other credential are stripped
before the payload is written, and there is a test asserting it.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/razorpay/integration/status` | Connection state, mode, last sync |
| `POST` | `/api/razorpay/sync` | Run a sync (`{"full": true}` re-scans the history window) |
| `GET` | `/api/razorpay/sync/logs` | Sync history |
| `GET` | `/api/razorpay/sync/logs/{id}` | One sync log |
| `GET` | `/api/razorpay/overview` | Dashboard figures, computed from the transaction table |
| `GET` | `/api/razorpay/payments` | Transactions, with full filtering and search |
| `GET` | `/api/razorpay/payments/{id}` | Transaction detail, refunds, journal entry, raw reference |
| `POST` | `/api/razorpay/payments/{id}/category` | Accept or change the category |
| `GET` | `/api/razorpay/payments/{id}/invoice-matches` | Ranked invoice candidates |
| `POST` | `/api/razorpay/payments/{id}/match-invoice` | Confirm a match and post the entries |
| `POST` | `/api/razorpay/payments/{id}/reconciliation` | Set the reconciliation state |
| `GET` | `/api/razorpay/categories` | Available categories and rule match types |
| `GET`/`POST`/`PUT`/`DELETE` | `/api/razorpay/category-rules[/{id}]` | Manage rules |
| `POST` | `/api/razorpay/category-rules/reapply` | Re-run categorisation over undecided transactions |
| `POST` | `/api/razorpay/webhook` | Signature-verified webhook receiver |

Every endpoint except the webhook requires a bearer token and is scoped to the
caller's organisation. Mutating endpoints additionally require a write role. The
webhook is unauthenticated by design and is protected by signature verification
instead.

## Screens

- **Razorpay payments** (sidebar) — Overview, Transactions, Reconciliation,
  Categories, Sync history.
- **Settings → Integrations → Razorpay** — connection status, mode, last successful
  sync, and the Sync now / Full re-import actions.
