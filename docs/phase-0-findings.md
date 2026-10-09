# Phase 0: where Books differs from the Rooman One plan

An audit of `roomanbooks` on 2026-10-09, at the `feat/editable-app-content` branch including its uncommitted work. Each item names the phase that resolves it.

| # | Area | Books today | Plan | Resolved in |
|---|---|---|---|---|
| 1 | Unmerged work | Org codes, `admin@<code>` logins, panel content access, the 409/503 handlers and the error boundaries existed only as uncommitted changes plus 2 untracked migrations (`b5e1d7c3a9f4`, `c7a2e9d4b1f6`) | Live | Imported here as one commit. **Still to be merged to `main` in `roomanbooks` and deployed.** |
| 2 | Hosting | Deploys to `books.futureacad.ae` with a self-hosted runner; Proxmox and CT103 are not mentioned; containers are `roomanbooks-api-1` and `roomanbooks-web-1` | CT103, `roomanbooks-api` and `roomanbooks-web` | Confirm the host; see `runbooks/deploy.md` |
| 3 | Backups | None scripted; manual SQLite copies in an untracked folder | Nightly, off-site, restore-tested | Phase 0 scripts; install on the host after go-ahead |
| 4 | Migrations on start | `entrypoint.sh` runs `alembic upgrade head` on every start | Backup before every change | Moving the deploy (runbook); Core and Bookings default to `RUN_MIGRATIONS=false` |
| 5 | IDs | UUID stored as `String(32)` hex | UUID | Core uses native UUID; `rooman_sdk.ids` converts both ways; Books unchanged |
| 6 | Tenant column | `organization_id` | `org_id` | Books keeps its name; events and Core use `org_id` |
| 7 | Users and orgs | `users.email` unique globally, one org per user | Memberships (many to many) | Phase 1 migration: one membership per user |
| 8 | Roles | Text column (admin, staff, viewer, employee) | `roles`/`permissions` tables | Phase 1 seeds built-in roles |
| 9 | Plans and content | Plan fields on `organizations`; pricing in `module_pricing.json`; app content, site content and trial days in `platform_settings` | Dedicated tables | Phase 1 migration mapping |
| 10 | Tokens | HS256 shared secret, 3 realms, 30 min / 14 days; org taken from the user row | RS256 via JWKS, 15 min / 30 days, org from the token | Phase 1 (Core), Phase 2 (Books) |
| 11 | 402 vs 403 | A module outside the plan returns **403**; an expired trial returns **402** on every guarded route | "Locked modules return 402" | Kept as today (Books' behaviour wins); `rooman_sdk.tokens` mirrors it |
| 12 | Login hardening | No MFA, no lockout; rate limiter in memory per worker | MFA for admins, lockout, shared limits | Phase 1 |
| 13 | Isolation | App code only; no RLS; app connects as the DB owner; `audit_logs` and `payment_events` have no org foreign key (`payment_events` org can be empty) | RLS plus least-privilege users | ADR 0004; Phase 1 (Core), Phase 2 (Books) |
| 14 | Razorpay keys | Process-wide env vars; a platform endpoint rewrites `.env` on disk | Secrets outside git, rotated | Phase 1 secret store |
| 15 | Network | API published on `:8000` on all interfaces (bypasses nginx rate limits); no TLS in repo; HSTS only on API responses | Only the gateway is public; TLS 1.2+ with HSTS | Gateway in Phase 0 locally; production change needs a go-ahead |
| 16 | Hard-coded email | `shalya@rooman.com` in `services/export_service.py` (3 places) | No hard-coded values | Phase 2 cleanup |
| 17 | CI | No dependency audits or secret scan; Conventional Commit titles not enforced | Audits on every PR | Phase 0 (`security.yml`, `pr-title.yml`) |
| 18 | Tests | SQLite with `create_all`; one shared DB per run | Isolation tests need Postgres | Phase 1 and 2 isolation suites run in the Postgres CI job |
| 19 | Dependencies | `react-router` 6.x has a moderate advisory; the fix is the v7 major upgrade | `npm audit` clean | Decide on the upgrade; CI gates at "high" |
| 20 | Minor | Two theme storage keys (`rooman_theme` vs `rooman_theme_mode` in `ProfilePage.tsx`) | — | Small fix in Books |
