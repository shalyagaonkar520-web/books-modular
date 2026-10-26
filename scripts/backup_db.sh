#!/usr/bin/env bash
# Back up the Rooman Books PostgreSQL database (docker compose deployment).
#
#   scripts/backup_db.sh                 # dump to ./backups, keep 14 days
#   BACKUP_DIR=/srv/backups KEEP_DAYS=30 scripts/backup_db.sh
#   OFFSITE=user@backup-host:/backups/roomanbooks scripts/backup_db.sh   # also copy off the server
#
# Cron (daily 02:30):  30 2 * * * cd /opt/roomanbooks && scripts/backup_db.sh >> /var/log/roomanbooks-backup.log 2>&1
#
# Restore with scripts/restore_db.sh. A backup that was never restored is not
# a backup: test a restore into a scratch database every month.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f deployment/docker-compose.yml --env-file .env"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1091
set -a; [ -f .env ] && . ./.env; set +a
DB="${POSTGRES_DB:-roomanbooks}"
USER_NAME="${POSTGRES_USER:-roomanbooks}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
OUT="$BACKUP_DIR/roomanbooks-$STAMP.dump"

echo "[$(date -Is)] Dumping $DB to $OUT"
# Custom format: compressed, and restorable table by table with pg_restore.
$COMPOSE exec -T db pg_dump -U "$USER_NAME" -d "$DB" --format=custom --no-owner --no-privileges > "$OUT.partial"
mv "$OUT.partial" "$OUT"
chmod 600 "$OUT"

# Refuse an empty or truncated dump.
SIZE=$(wc -c < "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  echo "Backup looks empty ($SIZE bytes): $OUT" >&2
  exit 1
fi
$COMPOSE exec -T db pg_restore --list < "$OUT" > /dev/null
sha256sum "$OUT" > "$OUT.sha256"
echo "[$(date -Is)] OK: $OUT ($SIZE bytes)"

# Uploaded documents and receipts live in the api_data volume.
FILES_OUT="$BACKUP_DIR/roomanbooks-files-$STAMP.tar.gz"
$COMPOSE exec -T api tar -czf - -C /app/data uploads 2>/dev/null > "$FILES_OUT" || echo "No uploads to back up."
chmod 600 "$FILES_OUT" 2>/dev/null || true

if [ -n "${OFFSITE:-}" ]; then
  echo "Copying to $OFFSITE"
  rsync -a --chmod=F600 "$OUT" "$OUT.sha256" "$FILES_OUT" "$OFFSITE/"
fi

find "$BACKUP_DIR" -name 'roomanbooks-*' -mtime +"$KEEP_DAYS" -delete
echo "[$(date -Is)] Done. Kept the last $KEEP_DAYS days in $BACKUP_DIR"
