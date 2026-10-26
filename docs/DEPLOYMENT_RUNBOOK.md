# Deployment runbook: Rooman Books on CT103

This runbook covers updating the running server (Proxmox container CT103, Docker: `roomanbooks-web`, `roomanbooks-api`, `roomanbooks-db-1` on postgres:16) to the current release. Do every step in order, and don't skip the backup.

- **Expected downtime:** about 5 minutes, while the API restarts and applies migrations.
- **Never touch CT100.** It is an unrelated Postgres server.

## What this release changes in the database

The API applies these Alembic migrations automatically when it starts (`deployment/entrypoint.sh`). Each one has a tested downgrade.

| Revision | Change | Existing data |
|---|---|---|
| `a8d4c1e6f2b9` | `users.module_access`: per-user edit access | New nullable column |
| `b5e1d7c3a9f4` | `organizations.code` (backfilled from the name) plus admin-panel first-login setup and reset requests | Backfills a unique code for every organization |
| `c7a2e9d4b1f6` | `organizations.panel_content_access` | New nullable column |
| `d3f8a1c6e9b2` | Connected apps: `app_connections`, `integration_events`, `webhook_deliveries`, `idempotency_records` | New tables only |

The server's current revision decides which of these run. Step 2 records it.

**Behaviour changes users will notice:**
- Every subscription plan now always includes the core modules: Items, Customers, Invoices, Payments received, Accountant and Reports. Plans already active are not changed until their next plan change.
- Payments recorded without an invoice settle the oldest unpaid invoices first.

## 0. Before the window (on your PC)

```bash
scripts/predeploy_check.sh          # lint, all tests, migrations up/down, frontend build
git status                          # everything committed
git push origin <release branch>    # then merge to main through a PR
```

## 1. Sign in and look

```bash
ssh <you>@<CT103 address>
cd <APP_DIR>                        # the folder with deployment/docker-compose.yml and .env
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
git log --oneline -1                # what is deployed now
df -h /                             # need free space for a backup and new images
```

## 2. Back up (mandatory)

```bash
scripts/backup_db.sh                # prints the dump path; check it says OK
ls -lh backups/ | tail -3
docker compose -f deployment/docker-compose.yml --env-file .env exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select version_num from alembic_version;"
```

Write down the backup file name and the `version_num`. Copy the backup off the server (`OFFSITE=… scripts/backup_db.sh`, or `scp`) before going on.

If the server has no `scripts/backup_db.sh` yet (old checkout), run the dump by hand:

```bash
docker exec roomanbooks-db-1 pg_dump -U roomanbooks -d roomanbooks --format=custom > ~/roomanbooks-before-release.dump
```

## 3. Check `.env`

Compare with `.env.example`. These must be set for production:

| Setting | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | 32+ random characters. Keep the existing one: changing it signs everyone out and changes webhook secrets. |
| `POSTGRES_PASSWORD` | The existing password. |
| `CORS_ORIGINS` | The public web address, e.g. `https://books.rooman.com` |
| `COOKIE_SECURE` | `true` when served over https |
| `APP_URL` | The public web address, used in invite and reset emails |
| `SMTP_*` | The mail account (an App Password for Gmail) |

New settings, all optional with safe defaults:
- `TRUSTED_PROXIES`, `API_BIND` (`127.0.0.1` keeps the API reachable only through nginx);
- `INTEGRATION_RATE_LIMIT_PER_MINUTE`, `WEBHOOKS_ENABLED`, `WEBHOOK_ALLOWED_HOSTS`.

## 4. Update and start

```bash
git fetch origin && git checkout main && git pull --ff-only
docker compose -f deployment/docker-compose.yml --env-file .env build
docker compose -f deployment/docker-compose.yml --env-file .env up -d
docker compose -f deployment/docker-compose.yml --env-file .env logs -f api   # watch the migrations run, then Ctrl+C
```

A healthy start ends with `Running upgrade … -> d3f8a1c6e9b2` and then `Starting Rooman Books API`.

## 5. Check it works

```bash
curl -fsS http://127.0.0.1:${API_PORT:-8000}/api/health     # "status": "healthy", "database": "ok"
docker compose -f deployment/docker-compose.yml --env-file .env exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select version_num from alembic_version;"   # d3f8a1c6e9b2
```

In the browser:
1. Sign in as a normal user. Open invoices, record a payment and check receivables.
2. Super admin `/platform`. Open an organization and check its tabs, including Connected apps.
3. Org admin panel `/org-admin`.
4. Light/dark toggle.
5. A plan request shows the core modules ticked and locked.

## 6. If something is wrong: roll back

**The app fails but the database is fine:**

```bash
git checkout <previous commit from step 1>
docker compose -f deployment/docker-compose.yml --env-file .env build
docker compose -f deployment/docker-compose.yml --env-file .env run --rm -e RUN_MIGRATIONS=false api \
  alembic -c database/alembic.ini downgrade <version_num from step 2>
docker compose -f deployment/docker-compose.yml --env-file .env up -d
```

**The data is wrong:** restore the backup from step 2.

```bash
scripts/restore_db.sh backups/<file from step 2>.dump    # asks you to type the database name
```

## 7. After the release

- Schedule backups. Run `crontab -e` and add:

  ```
  30 2 * * * cd <APP_DIR> && OFFSITE=<user@backup-host:/path> scripts/backup_db.sh >> /var/log/roomanbooks-backup.log 2>&1
  ```

- Monthly: restore the latest backup into a scratch database (`TARGET_DB=roomanbooks_restore_test scripts/restore_db.sh <dump>`) and check the counts it prints.
- Proxmox: keep a scheduled `vzdump` backup of CT103 as a second layer, and check that the CT102 backup task that looked stuck has finished.
