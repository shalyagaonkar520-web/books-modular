#!/usr/bin/env bash
# Nightly backup of every Rooman One database and data volume.
#
#   BACKUP_ENV=/etc/rooman/backup.env infra/backup/pg_backup.sh
#
# For each database in DATABASES it runs pg_dump (custom format) inside the
# database's own container, checks the dump can be read back (pg_restore
# --list), and records its SHA-256. Data volumes in VOLUMES (e.g. Books
# uploads) are archived with tar. The run is written to a dated folder with a
# MANIFEST, copied off-site, and folders older than RETENTION_DAYS are removed.
#
# It only reads from the databases. It never restores, drops or writes.
# Exit status is non-zero if any step fails, so cron or a timer can alert.
set -euo pipefail

BACKUP_ENV="${BACKUP_ENV:-/etc/rooman/backup.env}"
if [ -f "$BACKUP_ENV" ]; then
  # shellcheck source=/dev/null
  . "$BACKUP_ENV"
fi

: "${DATABASES:?set DATABASES, e.g. \"roomanbooks-db-1|roomanbooks|roomanbooks\"}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rooman}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
VOLUMES="${VOLUMES:-}"
OFFSITE_RCLONE_REMOTE="${OFFSITE_RCLONE_REMOTE:-}"   # e.g. "b2:rooman-backups/ct103"
OFFSITE_RSYNC_TARGET="${OFFSITE_RSYNC_TARGET:-}"     # e.g. "backup@host:/srv/rooman/ct103"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"               # optional: pinged on success
DOCKER="${DOCKER:-docker}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$BACKUP_DIR/$STAMP"
LOCK="$BACKUP_DIR/.lock"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$BACKUP_DIR"
exec 9>"$LOCK"
flock -n 9 || fail "another backup is already running"

mkdir -p "$RUN_DIR.partial"
trap 'rm -rf "$RUN_DIR.partial"' EXIT
MANIFEST="$RUN_DIR.partial/MANIFEST"
{
  echo "rooman backup $STAMP"
  echo "host $(hostname)"
} > "$MANIFEST"

for entry in $DATABASES; do
  IFS='|' read -r container db user <<< "$entry"
  [ -n "$container" ] && [ -n "$db" ] && [ -n "$user" ] || fail "bad DATABASES entry: $entry"
  out="$RUN_DIR.partial/${container}__${db}.dump"
  log "dumping $db from $container"
  "$DOCKER" exec "$container" pg_dump -U "$user" -d "$db" --format=custom --no-owner --no-acl > "$out" \
    || fail "pg_dump failed for $db on $container"
  [ -s "$out" ] || fail "empty dump for $db"
  # Prove the file is a readable archive before calling the backup good.
  "$DOCKER" exec -i "$container" pg_restore --list < "$out" > /dev/null \
    || fail "dump for $db is not readable by pg_restore"
  tables="$("$DOCKER" exec "$container" psql -U "$user" -d "$db" -Atc \
    "select count(*) from information_schema.tables where table_schema='public'")"
  printf 'db %s %s %s bytes=%s tables=%s sha256=%s\n' "$container" "$db" "$(basename "$out")" \
    "$(stat -c %s "$out")" "$tables" "$(sha256sum "$out" | cut -d' ' -f1)" >> "$MANIFEST"
done

for volume in $VOLUMES; do
  out="$RUN_DIR.partial/volume__${volume}.tar.gz"
  log "archiving volume $volume"
  "$DOCKER" run --rm -v "$volume:/data:ro" alpine:3.20 tar -C /data -czf - . > "$out" \
    || fail "could not archive volume $volume"
  printf 'volume %s %s bytes=%s sha256=%s\n' "$volume" "$(basename "$out")" \
    "$(stat -c %s "$out")" "$(sha256sum "$out" | cut -d' ' -f1)" >> "$MANIFEST"
done

mv "$RUN_DIR.partial" "$RUN_DIR"
trap - EXIT
chmod -R go-rwx "$RUN_DIR"
log "local backup complete: $RUN_DIR"

if [ -n "$OFFSITE_RCLONE_REMOTE" ]; then
  log "copying off-site with rclone to $OFFSITE_RCLONE_REMOTE/$STAMP"
  rclone copy "$RUN_DIR" "$OFFSITE_RCLONE_REMOTE/$STAMP" --checksum || fail "rclone copy failed"
elif [ -n "$OFFSITE_RSYNC_TARGET" ]; then
  log "copying off-site with rsync to $OFFSITE_RSYNC_TARGET/$STAMP"
  rsync -a --chmod=go-rwx "$RUN_DIR/" "$OFFSITE_RSYNC_TARGET/$STAMP/" || fail "rsync failed"
else
  log "WARNING: no off-site target configured; this backup exists only on this host"
fi

log "removing local backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*Z' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

if [ -n "$HEALTHCHECK_URL" ]; then
  curl -fsS -m 10 "$HEALTHCHECK_URL" > /dev/null || log "WARNING: health check ping failed"
fi
log "done"
