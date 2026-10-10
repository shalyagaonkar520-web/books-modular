#!/usr/bin/env bash
# Prove a backup can be restored, without touching any live database.
#
#   infra/backup/restore_test.sh /var/backups/rooman/20261009T013000Z
#   infra/backup/restore_test.sh            # newest backup in BACKUP_DIR
#
# For every dump in the folder it checks the SHA-256 against the MANIFEST,
# restores it into a throwaway postgres:16 container with no network, and
# reports the table count, the Alembic revision and the largest tables by
# row count. The container is removed afterwards. Run it monthly and after
# every change to the backup set; record the result in docs/runbooks/backup-restore.md.
set -euo pipefail

BACKUP_ENV="${BACKUP_ENV:-/etc/rooman/backup.env}"
if [ -f "$BACKUP_ENV" ]; then
  # shellcheck source=/dev/null
  . "$BACKUP_ENV"
fi
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rooman}"
DOCKER="${DOCKER:-docker}"
PG_IMAGE="${PG_IMAGE:-postgres:16-alpine}"

RUN_DIR="${1:-$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort | tail -n 1)}"
[ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || { echo "no backup folder found" >&2; exit 1; }
MANIFEST="$RUN_DIR/MANIFEST"
[ -f "$MANIFEST" ] || { echo "no MANIFEST in $RUN_DIR" >&2; exit 1; }

NAME="rooman-restore-test-$$"
cleanup() { "$DOCKER" rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Restore test of $RUN_DIR"
started=$(date +%s)
"$DOCKER" run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=restore-test "$PG_IMAGE" > /dev/null
for _ in $(seq 1 60); do
  "$DOCKER" exec "$NAME" pg_isready -U postgres > /dev/null 2>&1 && break
  sleep 1
done

status=0
while read -r kind _container db file _rest; do
  [ "$kind" = "db" ] || continue
  dump="$RUN_DIR/$file"
  expected="$(grep -F " $file " "$MANIFEST" | sed -n 's/.*sha256=\([0-9a-f]*\).*/\1/p')"
  actual="$(sha256sum "$dump" | cut -d' ' -f1)"
  if [ "$expected" != "$actual" ]; then
    echo "FAIL $file: checksum does not match the MANIFEST"
    status=1
    continue
  fi
  target="restore_${db}"
  "$DOCKER" exec "$NAME" createdb -U postgres "$target"
  if ! "$DOCKER" exec -i "$NAME" pg_restore -U postgres -d "$target" --no-owner --no-acl --exit-on-error < "$dump"; then
    echo "FAIL $file: pg_restore reported an error"
    status=1
    continue
  fi
  tables="$("$DOCKER" exec "$NAME" psql -U postgres -d "$target" -Atc \
    "select count(*) from information_schema.tables where table_schema='public'")"
  revision="$("$DOCKER" exec "$NAME" psql -U postgres -d "$target" -Atc \
    "select version_num from alembic_version" 2>/dev/null || echo none)"
  echo "OK   $db: $tables tables, alembic revision $revision"
  "$DOCKER" exec "$NAME" psql -U postgres -d "$target" -Atc \
    "select '       ' || relname || ' ' || n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 5" || true
done < "$MANIFEST"

echo "Finished in $(( $(date +%s) - started ))s"
exit "$status"
