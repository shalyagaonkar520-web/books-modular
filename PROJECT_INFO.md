# Rooman Books — Project Information

> A one-stop overview of what Rooman Books is, what it does, how it is built, and where AI tools
> fit in, both for building it and as future product features.
> For setup commands and the full API list, see [README.md](README.md). For internals, see
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 1. What is Rooman Books?

Rooman Books is a **cloud accounting and business-management web application** for small and
growing businesses, built for the Indian market (GST, HSN/SAC codes, INR, PF/PT/TDS payroll).
It is similar in scope to Zoho Books or Tally, delivered as a multi-tenant SaaS product.

At its core it is a **true double-entry accounting system**. Every invoice, bill, payment,
expense, stock movement and pay run automatically posts a balanced journal entry. All reports
(Profit & Loss, Balance Sheet, Trial Balance and others) are computed from those journal entries,
so the books always balance and reports can never drift from the underlying transactions.

The product ships with **no demo or sample data**. Every number a customer sees comes from
transactions they recorded themselves.

### Who uses it

| User | What they do |
| --- | --- |
| **Business owners and accountants** (organization users) | Run day-to-day bookkeeping: invoicing, purchases, banking, payroll, reports |
| **Employees** | Log in to a self-service portal to see their profile, payslips, leaves and timesheets |
| **Organization panel admins** | Manage their organization's users, module access, branding/content and activity log |
| **Platform super-admins** (Rooman) | Run the whole SaaS: approve organizations, manage subscriptions, trials, website content, email settings and connected apps |
| **Connected apps** (Rooman Billing, Bookings, CRM, or customer systems) | Read and write Books data through API keys and receive webhooks |

---

## 2. Features and modules

### 2.1 Core accounting app (for each organization)

| Module | What it does |
| --- | --- |
| **Dashboard** | Cash position, receivables and payables (current vs overdue), cash-flow and income-vs-expense charts, inventory health, unbilled time, recent activity, notifications |
| **Items** | Goods and services catalogue with HSN/SAC codes, tax rates, selling and cost prices, perpetual inventory, reorder levels, stock adjustments with audit trail |
| **Customers and vendors** | Contact records, GST treatment, payment terms, outstanding balances, per-contact transaction summary, bulk delete |
| **Sales** | GST invoices with line-level tax and discounts, draft and sent states, payments received (including advances), printable invoices, automatic overdue reminders |
| **Purchases** | Vendor bills, payments made to vendors, direct expenses paid from bank or cash |
| **Expense dashboard** | Spending overview and expense trends |
| **Banking** | Bank, cash and credit-card accounts, opening balances, manual transactions, transfers, reconciliation |
| **Time tracking** | Projects (hourly or fixed billing), timesheets, one-click invoicing of unbilled hours |
| **Accountant** | Chart of accounts, manual journals with reversal, general ledger per account, trial balance |
| **Reports** | Profit & Loss, Balance Sheet, receivables and payables ageing, sales by customer, purchases by vendor, expenses by category, inventory summary, GST (tax) summary |
| **Documents** | Secure file vault with SHA-256 integrity hashes and categories, plus **Excel import** that categorizes rows and commits them as transactions |
| **Payroll** | Employees with salary structures, leaves, monthly pay runs with loss of pay, approve-then-pay workflow, PF/PT/TDS deductions, printable payslips |
| **Razorpay payments hub** | Imports Razorpay payments, refunds and settlements; rule-based categorization; matching payments to invoices; reconciliation; analytics and a financial dashboard; scheduled background sync |
| **Financial dashboard** | Combined receivables/payables and financial-health views |
| **Settings** | Organization profile and fiscal year, user invites and roles, email settings, activity log, profile and active sessions |

### 2.2 Cross-cutting features

- **PDF and Excel export** for invoices, bills, expenses, contacts and payments (single documents and full lists).
- **Email sending** of invoices, payment receipts, due reminders and messages through the platform's SMTP (Gmail) settings.
- **Audit log** of every change, showing who did what and when.
- **Reversals instead of deletes.** Voiding a document posts a reversing entry and restores stock, so history is never erased.
- **Per-organization document numbering** (INV-0001 and so on).
- **Editable app content.** Labels, text and branding of the app can be customized per organization without code changes.

### 2.3 Accounts, security and access

- Email and password sign-up with **email verification (OTP)**, forgot and reset password, and user **invitations**.
- **JWT access tokens** plus rotating httpOnly **refresh cookies**; changing a password signs out every other session; session list with remote sign-out.
- **Three roles**: `admin` (everything), `staff` (day-to-day bookkeeping), `viewer` (read-only), plus **per-user module access**.
- **Strict multi-tenancy**: every record belongs to one organization, and one tenant can never see another's data.
- Rate-limited login, idempotent payment handling, input bounds validation, security headers (HSTS, nosniff, frame deny).

### 2.4 SaaS business layer

- **Modular pricing.** Customers build their own plan from modules (base ₹499/month for Dashboard and Settings, then priced add-ons such as Items, Customers, Invoices and Payments; yearly billing equals 10× monthly).
- **Free trial** (configurable, default 3 days) covering every module.
- **Plan requests and approval.** An organization requests a plan, and a super-admin approves or rejects it.
- **Subscription lock.** An expired organization is locked (HTTP 402) until a plan is approved or the trial is extended.
- **Organization approval gate.** New sign-ups can require super-admin approval.

### 2.5 Admin panels

| Panel | Key capabilities |
| --- | --- |
| **Platform (super-admin) panel** | Cross-tenant dashboard; create, approve, reject, archive, restore and delete organizations; subscription and trial management; platform users and admins; impersonate a user for support; panel-admin management and password resets; public website and pricing content editor; app-content editor; SMTP email settings; connected apps; data exports |
| **Organization admin panel** | Separate login for an organization's panel admins; organization dashboard; user management and per-user module access; user overview; organization profile; activity log; organization-level app content |
| **Employee portal** | An employee's own profile, payslips, leaves and time entries, and nothing belonging to anyone else |

### 2.6 Integrations

- **Razorpay**: payments, webhooks, refunds, settlements, reconciliation and scheduled sync. See [docs/RAZORPAY.md](docs/RAZORPAY.md).
- **Connected apps API**: other systems get scoped API keys (`rbk_…`) with per-feature read or read-write access, and receive **signed webhooks** (`whsec_…`) when data changes. See [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).
- **Rooman Billing → Books connector**: a read-only sidecar that streams Billing events into Books (part of the wider **Rooman One** platform).
- **SMTP / Gmail** for all outbound email.

### 2.7 Public website

A marketing landing page with pricing, driven by content that super-admins edit from the platform panel.

### 2.8 Advanced accounting, compliance and automation

| Area | What it does |
| --- | --- |
| **Sales documents** | Quotes (accept / decline, expiry) -> sales orders -> invoices in one click; credit notes that reverse income, GST and stock, applied to invoices or refunded; customer advances applied to invoices or refunded |
| **Purchase documents** | Purchase orders -> bills; vendor credits applied to bills or refunded; vendor advances |
| **Recurring** | Recurring invoices, bills and journals on weekly / monthly / quarterly / yearly schedules, with catch-up, pause and an hourly runner |
| **Books lock** | A lock date after which nothing can be posted, edited, voided or deleted (enforced in the ledger) |
| **India compliance** | Place of supply with CGST + SGST / IGST split; TCS on invoices; TDS and reverse charge on bills; GSTR-1 (B2B, B2CL, B2CS, exports, credit notes, HSN) and GSTR-3B with statutory ITC set-off as JSON and Excel; TDS / TCS register; e-invoice (IRP 1.1) and e-way bill JSON with IRN recording |
| **Multi-currency** | Invoices, bills and payments in the contact's currency, booked in INR at the document rate; realised exchange gain / loss on payment; currency rate table |
| **Fixed assets** | Asset register with straight-line or declining-balance depreciation posted monthly; disposal with gain / loss |
| **Budgets** | Monthly budgets per income / expense account and budget vs actual |
| **Inventory control** | Warehouses with per-warehouse stock, transfer orders, batches with expiry, composite items (bill of materials + assembly), price lists, stock ledger with running balance |
| **Reports** | Adds the cash-flow statement (indirect method) and a 13-week cash forecast |
| **Automation** | Workflow rules (email / signed webhook on create, update, delete, overdue), custom fields, approval limits for invoices and bills, scheduled report emails, document branding |
| **Customer portal** | Private share links to view / download invoices and accept or decline quotes without logging in |
| **AI assistant** | Scan a bill or receipt into a draft bill; suggest ledger accounts for bank lines; answer questions about the books using read-only tools (Claude API; off unless `ANTHROPIC_API_KEY` is set) |
| **Branches** | Tag invoices, bills, expenses and journals with a branch; the profit and loss runs for one branch |
| **Serial numbers** | Serial-tracked items: serials received on bills, sold on invoices, returned on void; register serials for stock on hand |
| **Mileage and projects** | Mileage claims (km x rate) as travel expenses; project profitability (revenue less bills, expenses and time at cost rate) |
| **Statements** | Customer / vendor statement of account from the ledger with running balance, PDF and email |
| **Bank statement import** | Upload the bank's CSV; lines auto-match to booked transactions, become payments of open invoices / bills, or are booked to an account (AI suggestions); matching reconciles |
| **Insights** | Anomaly alerts (duplicate bills, unusual amounts, missing GSTIN, overdrawn accounts), customer credit-risk scores, daily digest email with an optional AI summary |
| **Cash planning** | What-if planner over the 13-week forecast: late collections, bad debts, new monthly costs, one-off purchases |
| **Getting paid** | AI-written payment reminders (template fallback); UPI pay-by-QR on invoice PDFs and the customer portal; invoices and reminders on WhatsApp (Cloud API, off unless `WHATSAPP_TOKEN` is set) |
| **Tally** | Export ledgers and vouchers as Tally XML; import Tally ledger masters as accounts, customers and vendors |
| **Installable app** | PWA: install on phone or desktop, offline app shell, camera capture for bill scanning |

---

## 3. Tech stack

### Backend

| Area | Technology |
| --- | --- |
| Language | Python 3.11+ |
| Web framework | **FastAPI** (served by Uvicorn, with Gunicorn in production) |
| ORM and migrations | **SQLAlchemy 2** and **Alembic** |
| Validation | **Pydantic v2** and pydantic-settings |
| Database | **PostgreSQL 16** in production, **SQLite** for local development |
| Auth | PyJWT, passlib with bcrypt |
| Payments | Razorpay Python SDK |
| Documents | **ReportLab** (PDF generation), **openpyxl** (Excel import and export) |
| Money maths | Python `Decimal` and `Numeric(14,2)` columns. Floats are never used for money. |

### Frontend

| Area | Technology |
| --- | --- |
| Framework | **React 18** and **TypeScript** |
| Build tool | **Vite 5** |
| Routing | React Router 6 |
| UI | Custom plain-CSS design system (no UI framework), **lucide-react** icons |
| Animation | **Motion** (Framer Motion) and **Lenis** smooth scrolling (landing page) |
| Testing | **Vitest**, Testing Library, jsdom |
| Linting | ESLint (zero warnings allowed), TypeScript strict checks |

### DevOps and infrastructure

| Area | Technology |
| --- | --- |
| Containers | **Docker** images for the API and the web app; **docker compose** for the full stack (db, api, web) |
| Web server | **nginx** serves the React build, proxies `/api`, and rate-limits auth endpoints |
| CI/CD | **GitHub Actions**: ruff lint, pytest on SQLite and PostgreSQL, Alembic drift check, frontend type-check, lint, tests and build, Docker build and health check, end-to-end ledger test, PR title and secret checks, deploy workflow |
| Hosting | Proxmox containers (Rooman One infrastructure) behind a reverse proxy; live at `books.futureacad.ae` |
| Scripts | Dev runner, database backup and restore, pre-deploy check, smoke test, super-admin creation |

### Repository layout

```
backend/      FastAPI app: routers/ (API), schemas/ (validation), services/ (business logic), models.py
frontend/     React + TypeScript + Vite single-page app
database/     Alembic migrations and local data
deployment/   Dockerfile, docker-compose, nginx configs
docs/         Architecture, deployment runbook, integrations, Razorpay
scripts/      Dev, backup/restore, smoke tests
tests/        40+ pytest suites (auth, ledger rules, sales, purchases, payroll, Razorpay, security…)
```

---

## 4. How it works (in one picture)

```
Browser (React app)
     │  HTTPS /api/*   (JWT access token + refresh cookie)
     ▼
nginx  ── serves the React build, proxies /api, rate-limits login
     ▼
FastAPI  ── Routers → Schemas → Services (ledger, inventory, bank, payroll…) → Models
     ▼
PostgreSQL                    File storage (uploaded documents)

Side channels: Razorpay API and webhooks · SMTP email · connected-app API keys and webhooks
```

**Golden rule:** documents record *intent*, and the journal records *effect*. Reports read only
the journal, and the system refuses any journal entry where debits ≠ credits.

---

## 5. AI tools: where AI can be used

Every calculation in the books stays deterministic accounting logic. The **AI assistant**
(section 2.8; `backend/services/ai.py`, model set by `AI_MODEL`, default `claude-opus-5-5`)
only reads data or returns drafts and suggestions a person reviews; it never posts. AI also
helps with **building** the product faster.

### 5.1 AI tools for building and maintaining the project

| Tool | Use it for |
| --- | --- |
| **Claude Code** (CLI, VS Code extension, desktop) | Building features end to end across the backend and frontend, writing tests and Alembic migrations, code review (`/code-review`), security review (`/security-review`), refactoring, debugging, writing docs |
| **Claude Code in GitHub Actions** | Automated PR reviews and fixing CI failures |
| **GitHub Copilot or Cursor** | Inline autocomplete while typing |
| **Figma with AI** (Figma MCP) | Designing screens and turning designs into React components |
| **v0 / Lovable / 21st.dev** | Quick UI prototypes for new pages and components |
| **Canva AI** | Marketing banners, social posts and pitch decks for the product |

### 5.2 AI features that can be added to the product

Recommended engine: the **Claude API** (Anthropic), for example Claude Sonnet for everyday tasks
and Claude Haiku for cheap, high-volume classification. Add it as a new backend service, e.g.
`backend/services/ai.py`, gated as a priced module in `module_pricing.json` like other add-ons.

| # | AI feature | Where it plugs in | Value |
| --- | --- | --- | --- |
| 1 | **Bill and receipt scanning (OCR)**: upload a photo or PDF of a vendor bill and AI fills in vendor, date, line items, GST and totals | Documents → Purchases (Bills, Expenses) | Removes manual data entry |
| 2 | **Smart transaction categorization**: suggest the expense account or category for bank and Razorpay transactions | `razorpay_categorize.py`, Banking, Excel import | Faster reconciliation; complements the existing rules |
| 3 | **Smart Excel import**: map any customer spreadsheet's columns to Books fields automatically | `excel_import.py` (Documents → Import) | Easier onboarding from Tally, Zoho or Excel |
| 4 | **Bank reconciliation assistant**: suggest which invoice or bill a bank or Razorpay payment belongs to | `razorpay_matching.py`, Banking reconcile | Fewer unmatched entries |
| 5 | **"Ask your books" chat**: questions in plain English, such as "What were my top 5 expenses last quarter?" or "Who owes me money?" | New chat panel; AI calls existing report APIs as tools (read-only) | Accounting insight for non-accountants |
| 6 | **Report explanations**: plain-language summary of P&L or Balance Sheet changes month over month | Reports, Dashboard | Owners understand their numbers |
| 7 | **Cash-flow forecasting**: predict upcoming cash position from receivables, payables and history | Dashboard, Financial dashboard | Early warning of cash shortfalls |
| 8 | **Anomaly and fraud detection**: flag duplicate bills, unusual amounts or odd vendor patterns | Purchases, Banking, Audit log | Catches errors and fraud |
| 9 | **Smart payment reminders**: AI-written, tone-adjusted overdue reminder emails | `auto-remind-overdue`, email service | Better collections |
| 10 | **GST and HSN code suggestions**: suggest the HSN/SAC code and tax rate from the item description | Items form | Fewer tax mistakes |
| 11 | **Payroll and HR assistant**: answer employee questions about payslips and leaves in the employee portal | Employee portal | Fewer HR queries |
| 12 | **Platform-admin insights**: churn risk, trial-to-paid prediction, usage summaries across organizations | Platform dashboard | Better SaaS business decisions |
| 13 | **Support copilot**: in-app help that knows the product's docs | Help widget | Lower support load |

### 5.3 Guardrails for AI in an accounting product

- **AI suggests, humans confirm.** AI must never post journal entries on its own. Every AI output is a draft or suggestion that a user approves, and posting still goes through `ledger.post_entry`, which enforces debits = credits.
- **Tenant isolation.** Send AI only the calling organization's data, and use the same scoped lookups as the rest of the API.
- **Read-only tools for chat.** The "Ask your books" assistant should only call report and list endpoints, never write endpoints.
- **Audit everything.** Log AI-assisted actions in the audit log as "AI-suggested, approved by <user>".
- **Privacy.** Keep API keys server-side only (like the Razorpay and SMTP secrets), avoid sending unneeded personal data, and let organizations opt out.
- **Cost control.** Make AI a paid module, cache results, and use smaller models for bulk classification.

### 5.4 Suggested rollout order

1. **Bill/receipt OCR** and **transaction categorization**: highest time savings, easy to verify.
2. **Smart Excel import** and **HSN/GST suggestions**: smoother onboarding, fewer errors.
3. **"Ask your books" chat** and **report explanations**: the headline AI feature for marketing.
4. **Forecasting, anomaly detection and platform insights**: these need more historical data.

---

## 6. Quick facts

| | |
| --- | --- |
| Product | Rooman Books, a SaaS double-entry accounting and business-management app |
| Market | Indian SMBs (GST, INR, PF/PT/TDS) |
| Architecture | React SPA → nginx → FastAPI → PostgreSQL, Dockerized |
| Tenancy | Multi-organization, fully isolated |
| Pricing model | Pick-your-modules monthly or yearly plans with a free trial |
| Integrations | Razorpay, SMTP/Gmail, connected-apps API and webhooks, Rooman Billing |
| Quality | 40+ backend test suites, frontend tests, CI on every PR, ledger-balance assertions |
| AI today | None (deterministic accounting) |
| AI opportunity | OCR, categorization, reconciliation, chat over books, forecasting, anomaly detection |
