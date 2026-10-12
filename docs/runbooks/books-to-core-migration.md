# Runbook: copy Books identity data into Core

`core_api.migrate_books` copies organizations, users, memberships, module access, platform admins, panel admins, panel content access, Books subscriptions, the Books module catalog, app content and platform settings into Core. It keeps every ID and password hash.

## Guarantees

- **Books is only read.** It opens Books read-only (`default_transaction_read_only` on PostgreSQL, `mode=ro` on SQLite). It cannot change Books even by mistake.
- **Safe to re-run.** Each record is inserted, updated or left as is to match Books. The second run reports everything as `same`, with identical checksums.
- **Core-only data is untouched.** Records Core has that Books never had stay as they are.
- **One transaction.** If anything fails, nothing is saved. `--dry-run` runs everything, then rolls back.
- **Checksums prove it.** For every entity, the report shows the SHA-256 of the records as Books says they should be and as Core holds them. Exit code 1 if any pair differs.

## Rehearsal on a copy (do this first, twice)

1. Take a fresh backup of Books (`infra/backup/pg_backup.sh`) and restore it into a scratch PostgreSQL. Never point this at production for a rehearsal.
2. Create a read-only user on the copy:
   `CREATE ROLE core_reader LOGIN PASSWORD '…'; GRANT CONNECT ON DATABASE roomanbooks TO core_reader; GRANT USAGE ON SCHEMA public TO core_reader; GRANT SELECT ON organizations, users, platform_admins, org_panel_admins, platform_settings TO core_reader;`
3. On the Core host, with Core's env loaded (`DATABASE_URL` set to the runtime role):
   ```bash
   alembic -c database/alembic.ini upgrade head          # uses MIGRATIONS_DATABASE_URL (owner)
   python -m core_api.migrate_books --books-url 'postgresql+psycopg://core_reader:…@<books-copy>/roomanbooks' --dry-run
   python -m core_api.migrate_books --books-url '…'      # run 1: everything "new"
   python -m core_api.migrate_books --books-url '…'      # run 2: everything "same", identical checksums
   ```
4. Keep both reports with the rehearsal notes. Phase 1 is done when run 2 matches run 1 on a copy of production.

## Reading the report

```
entity                  books   new  updated   same  removed  checksum (books = core)
organizations               1     0        0      1        0  OK  de9b1f2121e16476
```

- `books`: records Books has.
- `new` / `updated` / `same`: what this run did.
- `removed`: copies dropped because the Books field is now empty (only per-user module access, panel content access and Books app content).
- `OK`: Core now matches Books for that entity. `MISMATCH` means stop and investigate.

Each run also writes an `audit_log` row (`migration.books_to_core`) with the counts.

## Mapping notes

| Books | Core |
|---|---|
| `organizations.deleted_at` set | status `archived` |
| `is_suspended` | status `suspended` (reason kept) |
| `approval_status` pending / rejected | status `pending` / `rejected` |
| `code` NULL (old rows) | `<name-slug>-<first 6 of id>` |
| `users.is_active = false` | user and membership `disabled` |
| `users.password_hash` NULL | `invited` |
| `users.role`, `organization_id` | one `memberships` row |
| `users.module_access` JSON | `user_module_access` (app `books`) |
| plan fields on the organization | `org_subscriptions` (app `books`) |
| `module_pricing.json` | `plans` (`books/standard`) + `plan_modules` |
| `platform_settings` `app_content`, `app_content:org:<id>` | `app_content` (shared / per organization) |
| other `platform_settings` | `platform_settings` |
| emails | stored lower-cased |
