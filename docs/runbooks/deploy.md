# Runbook: deploy and roll back Books

## Today (unchanged by Phase 0)

Production Books still deploys from the **`rooman-itsd/roomanbooks`** repository, as it did before the monorepo:

- `.github/workflows/deploy.yml` in that repo runs after CI passes on `main`, on the self-hosted runner `[self-hosted, roomanbooks]`.
- It runs `git reset --hard origin/main` in `/opt/roomanbooks`, then `docker compose -p roomanbooks -f deployment/docker-compose.yml up -d --build`.
- It checks `127.0.0.1:8000/api/health` and `127.0.0.1/healthz`, and on failure checks out the previous SHA and rebuilds.
- The deploy target in that workflow is `books.futureacad.ae`. **Confirm this is the CT103 host before relying on this runbook.** The repository does not mention Proxmox or CT103 anywhere.

A copy of that workflow sits in this repo at `apps/books/.github/workflows/deploy.yml`. GitHub only reads workflows from the repo root, so it is **inactive** here on purpose.

### Known gap

`deployment/entrypoint.sh` runs `alembic upgrade head` on every container start. So a deploy that includes a migration changes the database **without a backup first**. Until the deploy moves to the monorepo, take a backup by hand (`docs/runbooks/backup-restore.md`) before merging any Books PR that adds a migration.

## Moving the Books deploy to this repo (planned; needs an explicit go-ahead)

1. Freeze merges to `roomanbooks` and bring across any commits made there since the import (`git log` in both, compare).
2. Add a root workflow `.github/workflows/deploy-books.yml` that:
   - runs on the same self-hosted runner;
   - checks out this repo to `/opt/rooman-one`;
   - **runs `infra/backup/pg_backup.sh` first, and stops if it fails**;
   - runs `docker compose -p roomanbooks -f apps/books/deployment/docker-compose.yml run --rm api migrate`;
   - starts the stack with `RUN_MIGRATIONS=false`.

   Keep the project name `-p roomanbooks`, so the existing volumes (`roomanbooks_postgres_data`, `roomanbooks_api_data`) are reused and no data moves.
3. Copy `/opt/roomanbooks/.env` to `/opt/rooman-one/apps/books/.env`, unchanged.
4. Do a dry run on a staging copy, then switch production, then disable `deploy.yml` in `roomanbooks` and archive that repository.

## Rolling back a Books deploy

- **Code only (no migration in the release):** on the host, `cd /opt/roomanbooks && git checkout <previous sha> && docker compose -p roomanbooks -f deployment/docker-compose.yml up -d --build`. The deploy workflow does this automatically when health checks fail.
- **Release included a migration:**
  1. Run `docker compose -p roomanbooks -f deployment/docker-compose.yml run --rm api alembic -c database/alembic.ini downgrade <previous revision>`. Every migration has a downgrade, but a downgrade can drop data written since the upgrade, so read it first.
  2. Then do the code rollback above.
  3. If the downgrade is unsafe, restore the pre-deploy backup instead (`backup-restore.md`).
- Time each rollback rehearsal and record it here:

| Date | Release | Kind | Time to healthy | By |
|---|---|---|---|---|
| | | | | |
