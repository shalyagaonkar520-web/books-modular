# Rooman Books

Double-entry accounting for growing businesses: invoicing, purchases, inventory, banking,
time tracking, payroll and financial reporting. Every figure in the product is derived from
transactions you record. The application ships with **no sample or demo data**.

- **API**: Python 3.11+ / FastAPI / SQLAlchemy 2 / Alembic, PostgreSQL in production and SQLite for local work
- **Web**: React 18 + TypeScript + Vite with a plain-CSS design system and no UI framework dependency
- **Auth**: email and password with bcrypt hashing, short-lived JWT access tokens, rotating httpOnly refresh cookies, three roles
- **Deploy**: Docker images for the API and web tiers, nginx in front of the SPA, `docker compose` for the full stack

---

## Table of contents

1. [Quick start](#quick-start)
2. [Configuration](#configuration)
3. [How the accounting works](#how-the-accounting-works)
4. [Modules](#modules)
5. [API reference](#api-reference)
6. [Authentication and roles](#authentication-and-roles)
7. [Database and migrations](#database-and-migrations)
8. [Testing](#testing)
9. [Continuous integration](#continuous-integration)
10. [Deployment](#deployment)
11. [Project layout](#project-layout)

---

## Quick start

### Prerequisites

Python 3.11 or newer and Node.js 20 or newer. PostgreSQL is optional locally, since SQLite is the default.

### Local development

```bash
# 1. Install dependencies
python -m pip install -r requirements-dev.txt
npm install

# 2. Create your environment file and a signing key
cp .env.example .env
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env

# 3. Create the database schema
alembic upgrade head

# 4. Run both services
uvicorn backend.main:app --reload --port 8000     # terminal 1
npm run dev                                        # terminal 2
```

`./scripts/dev.sh` does all of the above in one command.

Open <http://localhost:3000>, choose **Create an organization**, and you become the administrator
of a fresh set of books. Interactive API documentation is at <http://127.0.0.1:8000/docs>.

### Everything in Docker

```bash
cp .env.example .env
# set SECRET_KEY and POSTGRES_PASSWORD in .env, then:
docker compose up --build
```

The web app is served on <http://localhost:3000> and proxies `/api` to the API container.
Migrations run automatically when the API container starts.

---

## Configuration

Settings are read from environment variables, or from `.env`. See `.env.example` for the full list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | *(required in production)* | Signs access tokens. The app refuses to start in production without it. |
| `ENVIRONMENT` | `development` | `development`, `test` or `production`. Production disables `/docs` and automatic table creation. |
| `DATABASE_URL` | `sqlite:///./data/roomanbooks.db` | SQLAlchemy URL. Use `postgresql+psycopg://…` for PostgreSQL. |
| `DATA_DIR` | `./data` | Where the SQLite file and uploaded documents live. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of browser origins allowed to call the API. |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS so the refresh cookie is marked `Secure`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `14` | Refresh cookie lifetime. |
| `ALLOW_PUBLIC_SIGNUP` | `true` | Set `false` so only administrators can add users. |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | `10` | Per-IP limit on login and registration attempts. |
| `MAX_UPLOAD_SIZE_MB` | `25` | Largest accepted document upload. |
| `WEB_CONCURRENCY` | `2` | Gunicorn worker count in the container. |

---

## How the accounting works

Rooman Books is a real double-entry system. Every financial document posts a balanced journal
entry, and all reports are derived from those journal lines rather than from the documents.

| Action | Journal effect |
| --- | --- |
| Invoice marked sent | Dr Accounts Receivable and Discount Given; Cr income accounts and Output GST. Tracked goods also post Dr Cost of Goods Sold / Cr Inventory Asset and reduce stock. |
| Payment received | Dr bank account; Cr Accounts Receivable, or Unearned Revenue for an unapplied advance. |
| Bill opened | Dr inventory or expense accounts and Input GST; Cr Accounts Payable and Purchase Discounts. Tracked goods increase stock and refresh the item's cost price. |
| Payment made | Dr Accounts Payable, or Prepaid Expenses for an advance; Cr bank account. |
| Expense | Dr expense account and Input GST; Cr the account it was paid through. |
| Inventory adjustment | Dr or Cr Inventory Asset against Inventory Adjustments. |
| Pay run paid | Dr Salaries and Wages; Cr provident fund, professional tax and TDS payable; Cr bank account for the net. |
| Manual journal | Whatever you enter, provided debits equal credits. |

Voiding or deleting a document posts a **reversing entry** rather than erasing history, and it
restores any stock the document moved. Documents that already have payments cannot be edited or
voided until those payments are removed. A journal entry is rejected outright unless debits equal
credits, so the trial balance and balance sheet always balance. The test suite asserts this after
every workflow.

---

## Modules

- **Dashboard** — cash position, receivables and payables split by current and overdue,
  cash-flow and income-versus-expense charts, inventory health, unbilled time, recent activity.
- **Items** — goods and services, HSN or SAC code and tax rate, selling and cost prices,
  perpetual inventory with reorder levels, and stock adjustments with an audit trail.
- **Customers and vendors** — contact details, GST treatment, payment terms, outstanding
  balance, and a per-contact transaction summary.
- **Sales** — invoices with line-level tax and discounts, draft and sent states, payments
  received including unapplied advances, and printable invoices.
- **Purchases** — vendor bills, payments made, and direct expenses paid from a bank or cash account.
- **Banking** — bank, cash and credit-card accounts, opening balances, manual transactions,
  transfers between accounts, and reconciliation.
- **Time tracking** — projects with hourly or fixed billing, timesheets, and one-click
  invoicing of unbilled billable hours.
- **Accountant** — chart of accounts, manual journals with reversal, a general ledger per
  account, and the trial balance.
- **Reports** — profit and loss, balance sheet, receivables and payables ageing, sales by
  customer, purchases by vendor, expenses by category, inventory summary, and GST summary.
- **Documents** — an authenticated file vault with SHA-256 integrity hashes and category filters.
- **Payroll** — employees with a salary structure, monthly pay runs with loss of pay, approval
  and payment posting, and printable payslips.
- **Settings** — organization profile and fiscal year, user management with roles, and the activity log.

---

## API reference

All routes are under `/api` and require `Authorization: Bearer <access token>` unless noted.
Request and response bodies use camelCase, and money is returned as JSON numbers.

### Authentication

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Public. Creates an organization, its chart of accounts and the first administrator. |
| `POST` | `/api/auth/login` | Public. Returns an access token and sets the refresh cookie. |
| `POST` | `/api/auth/refresh` | Public, cookie based. Rotates the refresh token. |
| `POST` | `/api/auth/logout` | Revokes the current refresh token. |
| `GET` `PUT` | `/api/auth/me` | Current profile. `PUT` updates the display name. |
| `POST` | `/api/auth/change-password` | Signs out every other session. |

### Core resources

| Method | Path |
| --- | --- |
| `GET` `POST` | `/api/items`, `/api/contacts`, `/api/invoices`, `/api/bills`, `/api/expenses`, `/api/customer-payments`, `/api/vendor-payments`, `/api/projects`, `/api/time-entries`, `/api/documents`, `/api/payroll/employees`, `/api/payroll/pay-runs`, `/api/inventory-adjustments` |
| `GET` `PUT` `DELETE` | `/api/items/{id}`, `/api/contacts/{id}`, `/api/invoices/{id}`, `/api/bills/{id}`, `/api/expenses/{id}`, `/api/projects/{id}` |
| `POST` | `/api/invoices/{id}/status`, `/api/bills/{id}/status`, `/api/time-entries/invoice`, `/api/payroll/pay-runs/{id}/approve`, `/api/payroll/pay-runs/{id}/pay` |
| `GET` | `/api/invoices/stats`, `/api/bills/stats`, `/api/contacts/{id}/summary`, `/api/documents/{id}/download` |

### Banking and accounting

| Method | Path |
| --- | --- |
| `GET` | `/api/banking/accounts`, `/api/banking/summary`, `/api/banking/transactions` |
| `POST` | `/api/banking/accounts`, `/api/banking/accounts/{id}/transactions`, `/api/banking/transfers`, `/api/banking/transactions/reconcile` |
| `GET` `POST` | `/api/accounting/accounts`, `/api/accounting/journals` |
| `POST` | `/api/accounting/journals/{id}/reverse` |
| `GET` | `/api/accounting/ledger/{accountId}`, `/api/accounting/trial-balance` |

### Reports, dashboard and administration

| Method | Path |
| --- | --- |
| `GET` | `/api/reports/profit-and-loss`, `/api/reports/balance-sheet`, `/api/reports/receivables-aging`, `/api/reports/payables-aging`, `/api/reports/sales-by-customer`, `/api/reports/purchases-by-vendor`, `/api/reports/expenses-by-category`, `/api/reports/inventory-summary`, `/api/reports/tax-summary` |
| `GET` | `/api/dashboard/summary?period=…`, `/api/dashboard/notifications` |
| `GET` `PUT` | `/api/organization` |
| `GET` `POST` | `/api/users` |
| `PATCH` | `/api/users/{id}` |
| `GET` | `/api/audit-logs`, and `/api/health` which is public |

List endpoints accept `page`, `page_size` and module-specific filters, and they return
`{ items, total, page, pageSize }`.

---

## Authentication and roles

Passwords are hashed with bcrypt and validated for length and character mix. Access tokens are
JWTs held in memory by the browser. The refresh token is an opaque value stored as a SHA-256
hash and delivered as an httpOnly cookie scoped to `/api/auth`. Refreshing rotates the token,
changing a password revokes every other session, and login and registration are rate limited per IP.

| Role | Can do |
| --- | --- |
| `admin` | Everything, including user management, organization settings, payroll runs and the activity log. |
| `staff` | All day-to-day bookkeeping: items, contacts, invoices, bills, expenses, banking, time and documents. |
| `viewer` | Read-only access to data and reports. |

Every table is scoped by organization and each request is filtered by the organization on the
caller's token, so one tenant can never read or modify another tenant's records.

---

## Database and migrations

Alembic owns the schema. In production `AUTO_CREATE_TABLES` is forced off, so migrations are the
only way the schema changes.

```bash
alembic upgrade head                              # apply migrations
alembic revision --autogenerate -m "add x"        # create a migration after editing models
alembic downgrade -1                              # roll back one revision
alembic check                                     # fail if models and migrations disagree
```

CI runs `alembic upgrade head` followed by `alembic check` against PostgreSQL on every pull
request, so a model change without a migration cannot merge.

---

## Testing

```bash
pytest -q                    # backend suite, SQLite by default
pytest -q --cov=backend      # with coverage
npm run test                 # frontend unit tests
npm run lint                 # ESLint, zero warnings tolerated
npx tsc -b                   # TypeScript project check
bash scripts/smoke_api.sh http://localhost:8000   # end to end against a running API
```

The backend suite covers registration and bootstrap, login and refresh rotation, role
enforcement, tenant isolation, item and contact lifecycles, invoice and bill posting, partial
and full payments, voiding and reversal, stock movement, banking and reconciliation, manual
journals, payroll, reports and dashboard consistency. Several tests assert that the trial
balance still balances after each workflow. Point `TEST_DATABASE_URL` at PostgreSQL to run the
same suite against it.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`.

| Job | What it does |
| --- | --- |
| Backend lint | `ruff check` over the API and tests |
| Backend tests (SQLite) | The full `pytest` suite with coverage |
| Backend tests (PostgreSQL) | Applies migrations, runs `alembic check`, then the suite against PostgreSQL 16 |
| Frontend | `tsc -b`, ESLint, Vitest, a production build, and uploads `dist` |
| Docker | Builds both images and health-checks the API container |
| Integration | Boots the API and runs the end-to-end workflow, asserting the ledger balances |

`.github/workflows/pr-checks.yml` additionally requires a Conventional Commits pull request
title and blocks committed `.env` files, databases, keys and hard-coded credentials.

Recommended branch protection for `main`: require every CI job to pass, require one review,
require branches to be up to date before merging, and use squash merges.

---

## Deployment

1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set `SECRET_KEY` to a 48-byte random value, `ENVIRONMENT=production`, `COOKIE_SECURE=true`,
   and `CORS_ORIGINS` to your web origin.
3. Build and run the images, or use `docker compose up -d --build`. The API entrypoint applies
   migrations before starting Gunicorn with Uvicorn workers as a non-root user.
4. Terminate TLS at your load balancer or ingress and forward to the web container on port 80.
5. Monitor `GET /api/health`, which returns 503 when the database is unreachable.
6. Back up PostgreSQL and the `DATA_DIR` volume, which holds uploaded documents.

Both containers declare health checks. The API sets `nosniff`, `DENY` framing, referrer and
HSTS headers, and nginx rate limits the authentication endpoints, caches hashed assets for a
year, and never caches the app shell.

---

## Project layout

```
backend/
  main.py              FastAPI app, middleware, health check
  config.py  db.py     settings and the SQLAlchemy engine and session
  models.py            ORM models for every table
  security.py deps.py  hashing, JWTs, current-user and role dependencies
  routers/             one module per API area
  schemas/             pydantic request and response models
  services/            ledger, inventory, banking, numbering and report helpers
alembic/               migration environment and versions
tests/                 pytest suite
src/
  api/                 typed client and endpoint wrappers
  auth/                auth context and route guards
  components/          UI kit and app layout
  pages/               one folder per module
  hooks/ utils/        data-fetching hooks and formatting helpers
  styles/index.css     the design system
scripts/               dev runner and end-to-end smoke test
docker/                container entrypoint and the nginx rate-limit include
```
