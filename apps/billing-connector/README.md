# Rooman Billing → Rooman Books connector

Sends Billing's customers, plans, invoices and payments to Books, one way, as signed events
(see `docs/billing-to-books.md`). It **reads Billing's database with a read-only login** and
does not change Billing's code, so Billing's own deploys never undo it.

| In Billing | Sent when | Books creates |
|---|---|---|
| Customer | new, or name/email/phone/GSTIN/address changes | Contact (read-only) |
| Plan (with its product's GST rate and HSN/SAC) | new, or changed | Service item |
| Invoice | once issued (not drafts, not voided drafts) | Invoice, posted to the ledger |
| Payment (succeeded) | once matched to invoice(s); if still unmatched after 24 h, as an advance | Payment received |

Every 30 s it checks for anything new or changed. It remembers what it sent (`/data/state.db`):
nothing is sent twice; "not yet" answers (409) are retried; refusals (422) are kept with Books' reason
and retried only if the record changes in Billing.

## Commands (on CT111)
```bash
cd /opt/rooman-billing-connector
docker compose -p billing-connector up -d                       # start
docker compose -p billing-connector logs -f                     # watch
docker compose -p billing-connector exec connector python connector.py status   # sent / waiting / refused
```

## Not sent (yet)
Credit notes and refunds, voids after issue, gateway fees. Voiding an issued invoice in Billing does not void it in Books.

Tested end to end with the real Books app: `apps/books/tests/test_billing_connector.py`.
