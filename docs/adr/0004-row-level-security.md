# ADR 0004: Postgres row-level security under the app-level org filter

- Status: Accepted (Core from Phase 1; Books from Phase 2)
- Date: 2026-10-09

## Context

Tenant isolation in Books today is application code only: every query goes through `get_or_404`, which compares `organization_id`. One missed filter in one endpoint leaks another tenant's data. Books also connects to Postgres as the database owner, so the database itself enforces nothing.

## Decision

1. **App filter stays first.** Every query is filtered by the org from the token, and a record from another org returns **404**.
2. **Row-level security as the second line.** Every tenant table gets RLS enabled and forced, with a policy on the tenant column:

   ```sql
   ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
   ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON invoices
     USING (organization_id = current_setting('app.org_id', true))
     WITH CHECK (organization_id = current_setting('app.org_id', true));
   ```

   The request's DB session runs `SET LOCAL app.org_id = '<org from token>'` at the start of each transaction. With no org set, the policy matches nothing.
3. **Least-privilege database users.** Each service has:
   - an **owner** role, used only by Alembic migrations;
   - a **runtime** role (no superuser, no `BYPASSRLS`, not the table owner) with only `SELECT/INSERT/UPDATE/DELETE` on its own tables.

   Platform jobs that must see every org (super admin, the outbox publisher, Razorpay sync) use a separate role with `BYPASSRLS`, and are audited.
4. **Migrations create the policies** with working downgrades, and a CI test lists every table that has the tenant column and fails if any lacks a policy.
5. **Child tables** without the tenant column (`invoice_lines`, `journal_lines`, ...) get a policy through their parent (`EXISTS` on the parent row), or gain the column. This is decided per table in Phase 2.

## Consequences

- A forgotten filter returns nothing instead of another tenant's rows.
- Tests must run on Postgres, not only SQLite, because RLS does not exist in SQLite. Isolation tests run in the PostgreSQL CI job.
- `SET LOCAL` must happen inside the transaction, so it works with PgBouncer in transaction mode. The session middleware does it per request.
- A small per-query cost from the policy predicate, which the existing `organization_id` indexes cover.

## Alternatives considered

- **Database per tenant.** Strongest isolation, but thousands of databases to migrate, back up and connect to. Rejected for now.
- **Schema per tenant.** The same operational cost, and harder cross-tenant platform reporting.
- **App filter only.** That is today's state; one bug away from a leak.
