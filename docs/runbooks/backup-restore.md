# Runbook: backups and restore

## What is backed up

| Item | How | Where in the backup |
|---|---|---|
| Each Postgres database (Books, later Core, Bookings, ...) | `pg_dump --format=custom` inside its container, checked with `pg_restore --list` | `<container>__<db>.dump` |
| Data volumes (Books uploads, `DATA_DIR`) | `tar` of the volume, read-only mount | `volume__<name>.tar.gz` |
| Sizes, table counts, SHA-256 of every file | written by the script | `MANIFEST` |

Each run is a folder `BACKUP_DIR/<UTC timestamp>/`, readable only by root. Local copies are kept for `RETENTION_DAYS` (default 14). Each run is copied off-site with rclone or rsync. **The off-site target is still an open decision (`<BACKUP_TARGET>`).** Until it is set, the script warns that the backup exists only on the host.

## Set up on a host (only with an explicit go-ahead for that host; never CT100)

```bash
sudo install -d -m 700 /etc/rooman /var/backups/rooman
sudo cp infra/backup/backup.env.example /etc/rooman/backup.env && sudo chmod 600 /etc/rooman/backup.env
sudo editor /etc/rooman/backup.env           # check container names: docker ps
sudo BACKUP_ENV=/etc/rooman/backup.env infra/backup/pg_backup.sh   # first run by hand
sudo cp infra/backup/rooman-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now rooman-backup.timer
```

The script only reads from the databases. A second copy can't overlap, because a lock file prevents it. A failed run exits non-zero, which shows in `systemctl status rooman-backup` and, if set, in the missing `HEALTHCHECK_URL` ping.

## Take a backup before any change

Every database change and every deploy starts with a fresh backup:

```bash
sudo BACKUP_ENV=/etc/rooman/backup.env /opt/rooman-one/infra/backup/pg_backup.sh
```

Note the folder name it prints. That is your restore point.

## Restore test (monthly, and after any change to the backup set)

```bash
sudo infra/backup/restore_test.sh                      # newest backup
sudo infra/backup/restore_test.sh /var/backups/rooman/20261009T013000Z
```

It checks every dump's SHA-256 against the MANIFEST, restores each one into a throwaway `postgres:16-alpine` container **with no network**, and prints the table count, the Alembic revision and the five largest tables. It never touches a live database.

Record each test here:

| Date | Backup folder | Result | Duration | By |
|---|---|---|---|---|
| | | | | |

## Real restore of Books (data loss or corruption)

Agree the restore point with the team first: everything written after it is lost.

1. Stop writes: `docker compose -p roomanbooks stop api web`.
2. Take a backup of the **current** state anyway (`pg_backup.sh`), in case the restore is the wrong call.
3. Restore into the running database container:

   ```bash
   DUMP=/var/backups/rooman/<stamp>/roomanbooks-db-1__roomanbooks.dump
   sha256sum "$DUMP"     # must match the MANIFEST line
   docker exec -i roomanbooks-db-1 pg_restore -U roomanbooks -d roomanbooks --clean --if-exists --no-owner --no-acl --exit-on-error < "$DUMP"
   ```

4. Restore uploads if needed:

   ```bash
   docker run --rm -v roomanbooks_api_data:/data -v /var/backups/rooman/<stamp>:/b:ro alpine:3.20 \
     sh -c 'rm -rf /data/* && tar -C /data -xzf /b/volume__roomanbooks_api_data.tar.gz'
   ```

5. Start the stack with migrations off, so the restored schema isn't changed underneath you: `RUN_MIGRATIONS=false docker compose -p roomanbooks up -d`. Check `alembic current` matches the code.
6. Check `/api/health`, sign in as a test org, and open the trial balance.
