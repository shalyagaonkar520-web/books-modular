# Architecture

## Shape of the system

```
Browser (React SPA)
      │  fetch /api/*  (Bearer access token, httpOnly refresh cookie)
      ▼
nginx  ──────────────  serves the built SPA, proxies /api to the API
      ▼
FastAPI application
      │  SQLAlchemy ORM
      ▼
PostgreSQL (SQLite locally)          DATA_DIR volume (uploaded documents)
```

## Backend layering

Requests flow through four layers, and each one has a single job.

1. **Routers** (`backend/routers/`) — one module per API area. They validate scope, resolve
   records inside the caller's organization, orchestrate services and return schema objects.
   They contain no arithmetic.
2. **Schemas** (`backend/schemas/`) — pydantic models. They own request validation and
   response shape, generate camelCase JSON from snake_case fields, and render `Decimal` as JSON
   numbers via a serializer on the shared `APIModel` base.
3. **Services** (`backend/services/`) — the domain logic:
   - `ledger.py` posts and reverses balanced journal entries and computes account balances
   - `inventory.py` moves stock and posts the matching inventory value
   - `bank.py` records bank movements and derives balances
   - `documents.py` computes line-item and document totals
   - `numbering.py` allocates per-organization document numbers
   - `money.py` centralises `Decimal` rounding, `periods.py` fiscal-year maths,
     `audit.py` the audit trail, `chart_of_accounts.py` the default accounts,
     `tenancy.py` scoped lookups and pagination, `ratelimit.py` the auth limiter
4. **Models** (`backend/models.py`) — SQLAlchemy ORM. Every business table has a string UUID
   primary key and an `organization_id`, so the schema is portable between SQLite and PostgreSQL.

## Why the ledger is the source of truth

Documents record intent; the journal records effect. Marking an invoice as sent posts one
balanced entry, and the profit and loss, balance sheet and trial balance are all computed from
journal lines. Two consequences follow:

- **Reports cannot drift from documents**, because they do not read documents at all.
- **Corrections are additive.** Voiding an invoice posts a reversing entry and restores stock;
  the original entry stays for audit. A document that already has payments cannot be edited
  until the payments are removed, which keeps the ledger consistent with the balances shown.

`ledger.post_entry` refuses an entry whose debits and credits differ, so an unbalanced state is
unreachable through any code path. The test suite asserts the trial balance still balances after
every workflow.

## Numbers

Money is `Numeric(14, 2)` in the database and `Decimal` in Python, rounded half-up through
`services/money.py`. Quantities are `Numeric(14, 3)`. Floats are never used for amounts. The API
emits numbers rather than strings so the UI can format without parsing, and the UI formats
everything through `frontend/src/utils/format.ts`.

## Frontend layering

- `frontend/src/api/` — one typed wrapper per endpoint over a `fetch` client that attaches the
  access token, retries once through `/api/auth/refresh` on a 401, and converts FastAPI error
  bodies into a message plus per-field errors.
- `frontend/src/auth/` — the session context (restored from the refresh cookie on load) and
  route guards.
- `frontend/src/components/ui/` — the shared kit: tables with sorting and pagination, modals,
  form fields with labels and error slots, badges, stat tiles, toasts and dependency-free SVG
  charts.
- `frontend/src/pages/` — one folder per module. Pages compose the kit and call the API
  wrappers; they hold no formatting or money logic of their own.
- `frontend/src/hooks/` — `useAsync` for loads with abort handling, `useSubmit` for mutations
  with error surfacing, `useDebounced` for search inputs.

State is deliberately local. Each page loads what it needs and reloads after a mutation, so
there is no client-side cache to invalidate or drift from the server.

## Multi-tenancy

An organization is the tenant boundary. Registration creates the organization, its default
chart of accounts, a petty cash account and the first administrator, in one transaction. Access
tokens carry the organization id, and every query filters on it. There is no cross-tenant
sharing, and no data is seeded beyond the accounts a new set of books needs to function.

## Migrations

Alembic owns the schema, and `AUTO_CREATE_TABLES` is forced off in production so the only way
to change it is a migration. CI applies migrations to PostgreSQL and runs `alembic check`, which
fails when the models and migrations disagree.
