# Books products: one codebase, several apps

A **product** is a subset of Rooman Books' modules sold as its own app, with its own name, logo, colour, web address and Rooman One app key. Example: **Rooman Expenses** = expenses + bills + vendors + reports.

All products run on the same Books deployment and share its login, its organizations and its database. Nothing is copied or synced. The only thing that changes from one product to another is what a request is allowed to reach.

| | Rooman Books | Rooman Expenses |
|---|---|---|
| Web address | `books.futureacad.ae` (and any unknown host) | `expenses.futureacad.ae` |
| Modules | all 18 | vendors, bills, expenses, reports |
| Rooman One app key | `books` | `expenses` |
| Sign-in client | `OIDC_CLIENT_ID` | `OIDC_PRODUCT_CLIENT_IDS=expenses=…` |

## How it works

| Piece | Where |
|---|---|
| **Module registry**: one entry per module with its key, `dependsOn`, `uses` (read-only lookups), the API prefixes it owns, its pages, its sidebar entry and its roles | `apps/books/backend/content/modules.json`, with a byte-for-byte copy in `frontend/src/content/modules.json` |
| **Products**: key, name, app key, domains, modules, logo, colour | `apps/books/backend/content/products.json` |
| **Product for a request**: taken from `X-Forwarded-Host`, else `Host`. An unknown host gets the `fallback` product (Books, with every module) | `backend/services/products.py` |
| **Enforcement**: every module router is mounted behind `require_product_access`. A module that is not part of the product answers **403 `MODULE_NOT_IN_PRODUCT`**, for every caller and every method | `backend/main.py` |
| Organization plan and per-user module access still apply on top of the product (`require_module`) | `backend/deps.py` |
| App content (`/api/app-content`, `/api/public/app-content`) carries the `product`. Its modules are switched off outside the product. Its name, logo and colour come from the product. An organization's own logo and colour override the product's. An organization's app name is never used as another product's name | `backend/services/app_content.py` |
| Sidebar, routes, dashboard, reports and settings show only the product's modules | `frontend/src/components/layout/Sidebar.tsx`, `app/ModuleGuard.tsx`, `app/AppContentContext.tsx` (`isModuleEnabled`, `isInProduct`) |
| Sign in with Rooman One per product: each product has its own Core client, callback and landing page on its own address | `backend/routers/rooman_one_login.py` |

### What a product can reach

- **API prefixes owned by its modules** (`api` in modules.json): every method. If several prefixes match a path, the request needs a module from each of them. For example, `/api/reports/sales-by-customer` needs Reports **and** Invoices, so Rooman Expenses cannot reach it.
- **API of modules its modules `use`**: reads only (GET/HEAD/OPTIONS). Bills need the item and account pickers; expenses need bank accounts.
- **`coreApi` paths**: always open. These are the chart-of-accounts and bank-account pickers, the Razorpay webhook, and the payment confirmation links in emails.
- **Everything not owned by a module**: core, so always open. This covers sign-in, the organization, users, the dashboard, app content, subscription, the platform console and the organization admin panel. The dashboard blanks the sections of modules the product leaves out.

**Security note:** the product only narrows what an organization can reach. It never widens it. A spoofed `Host` header can only reach what that same organization could already reach in Rooman Books. The real billing boundary is the organization's plan.

`tests/test_products.py` checks that **every `/api` route is owned by a module or listed as core**. A new router therefore has to be declared in modules.json, or knowingly added to the test's `CORE_PREFIXES`.

## Add a product

Use a short lower-case key, e.g. `payroll-suite` → `payroll`. The steps below use `<key>`, `<Name>` and `<domain>`.

### 1. Declare it (Books repo)

Add an entry to `apps/books/backend/content/products.json`:

```json
{
  "key": "<key>",
  "name": "Rooman <Name>",
  "appKey": "<key>",
  "domains": ["<domain>"],
  "logoUrl": "/rooman-logo.png",
  "primaryColor": "#0f766e",
  "modules": ["payroll", "reports"]
}
```

- `modules` lists the modules to sell. Their `dependsOn` modules are added automatically, e.g. `bills` brings `vendors`.
- `logoUrl` is a site path (`/…`, served from `frontend/public`) or an `https://` URL.
- `url` is optional. Set it only when the app is not at `https://<first domain>`, e.g. in local development.
- A domain may belong to only one product. The load fails otherwise.

Then run the tests (`cd apps/books && python -m pytest tests/test_products.py`) and add tests for the new product's own rules if it has any.

### 2. Register the app key on Rooman One (Core)

Core only knows app keys that exist in its `apps` table, and those rows are created by Alembic migrations. `core/backend/database/alembic/versions/0005_expenses_app.py` is the example. Copy it for `<key>` with `down_revision` set to the previous head. The central database is upgraded deliberately (see `docs/runbooks`), never on restart.

Then create the product's sign-in client inside the Core container:

```
python -m core_api.clients create-web --app <key> \
    --redirect-uri https://<domain>/api/auth/rooman-one/callback
```

It prints `OIDC_CLIENT_ID=<key>-web-…` and `OIDC_CLIENT_SECRET=…`. The secret is shown once.

### 3. Give organizations the app (entitlement)

Core lets someone sign in to an app only when their organization has an **active `org_apps` row** for it. Otherwise the sign-in ends with "Rooman <Name> isn't part of your organization's Rooman One plan."

- **New organizations** created on Rooman One get the apps listed in `SIGNUP_APPS`. Set `CORE_SIGNUP_APPS=books,<key>` in `infra/compose/.env`, or just `<key>` for a product-only sign-up.
- **Existing organizations:** Core has no command for this yet. A platform operator adds the row on the central database, after a backup:

  ```sql
  INSERT INTO org_apps (id, org_id, app_key, status, created_at, updated_at)
  VALUES (gen_random_uuid(), '<organization uuid>', '<key>', 'active', now(), now())
  ON CONFLICT ON CONSTRAINT uq_org_app DO UPDATE SET status = 'active', updated_at = now();
  ```

  To take the app away again, set `status = 'disabled'`.

Inside Books, the organization's **plan** decides which modules it may write to (`module_pricing.json`, `require_module`). An organization that only buys Rooman Expenses should be given a plan whose modules match the product.

### 4. Configure Books

In the Books `.env` (passed through by `apps/books/deployment/docker-compose.yml`). Use comma-separated `product=value` pairs, like `APP_LINKS`:

```
OIDC_PRODUCT_CLIENT_IDS=<key>=<key>-web-…
OIDC_PRODUCT_CLIENT_SECRETS=<key>=…
```

Rooman Books itself keeps `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI`. Until a product has a client id, its login page shows no "Sign in with Rooman One" button; email and password sign-in still works.

Leave `COOKIE_DOMAIN` empty. With it empty, each product's session cookie stays on its own address.

### 5. Point the address at Books

- DNS for `<domain>` → the same host as `books.futureacad.ae`, with a TLS certificate for it.
- The Books web container (`deployment/nginx.conf`, `server_name _`) already answers any host and passes `Host` to the API. An outer proxy that rewrites `Host` must send the original in `X-Forwarded-Host`.
- No new container, database or build: the same image serves every product.

### 6. Show it on Rooman One's own page (`APP_LINKS`)

Add the product's start URL to `APP_LINKS` in `infra/compose/.env`, so Rooman One's sign-in page offers it:

```
APP_LINKS=books=https://books.futureacad.ae/api/auth/rooman-one/start,<key>=https://<domain>/api/auth/rooman-one/start
```

Core shows an app only when the person's organization has it (step 3) **and** it has a link here.

## Checklist

- [ ] products.json entry, tests green (`pytest`, `vitest`, `tsc`, `eslint`)
- [ ] Core migration adding the `apps` row, applied to the central database after a backup
- [ ] `create-web` client for the product's callback URL
- [ ] `OIDC_PRODUCT_CLIENT_IDS` / `OIDC_PRODUCT_CLIENT_SECRETS` in the Books `.env`
- [ ] `org_apps` rows (or `SIGNUP_APPS`) for the organizations that bought it, and a matching Books plan
- [ ] DNS + TLS for the domain; `Host` / `X-Forwarded-Host` reaches Books
- [ ] `APP_LINKS` on Core

## Add a module

1. Write its router and services. Use only core services and the services of the modules in its `dependsOn`, never another module's router (`tests/test_module_boundaries.py` enforces this).
2. Declare it in `backend/features.py` (mounting, connected-app scopes) and in `backend/content/modules.json`: key, `api` prefixes, `routes`, `menu`, `roles`, `dependsOn`, `uses`. Copy modules.json to `frontend/src/content/modules.json`.
3. Add it to `content/module_pricing.json` and the app content default (`content/app_content_default.json` and the frontend copy). The keys must match across all three; `test_products.py` checks this.
4. Add its page route in `frontend/src/App.tsx`. The sidebar entry comes from the registry. If the menu names an icon the sidebar doesn't have yet, add it to `ICONS` in `Sidebar.tsx`.
