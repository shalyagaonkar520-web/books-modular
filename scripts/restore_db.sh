#!/usr/bin/env bash
# Restore a backup made by scripts/backup_db.sh. DESTRUCTIVE: replaces the
# current database. The API is stopped first so nothing writes during it.
#
#   scripts/restore_db.sh backups/roomanbooks-20261010-023000.dump
#   TARGET_DB=roomanbooks_restore_test scripts/restore_db.sh <dump>   # restore test into a scratch DB
set -euo pipefail

cd "$(dirname "$0")/.."
DUMP="${1:?usage: scripts/restore_db.sh <backup.dump>}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }
if [ -f "$DUMP.sha256" ]; then
  sha256sum -c "$DUMP.sha256"
fi

COMPOSE="docker compose -f deployment/docker-compose.yml --env-file .env"
# shellcheck disable=SC1091
set -a; [ -f .env ] && . ./.env; set +a
USER_NAME="${POSTGRES_USER:-roomanbooks}"
LIVE_DB="${POSTGRES_DB:-roomanbooks}"
TARGET="${TARGET_DB:-$LIVE_DB}"

if [ "$TARGET" = "$LIVE_DB" ]; then
  read -r -p "This REPLACES the live database '$LIVE_DB'. Type the database name to continue: " answer
  [ "$answer" = "$LIVE_DB" ] || { echo "Cancelled."; exit 1; }
  $COMPOSE stop api
fi

$COMPOSE exec -T db dropdb -U "$USER_NAME" --if-exists "$TARGET"
$COMPOSE exec -T db createdb -U "$USER_NAME" "$TARGET"
$COMPOSE exec -T db pg_restore -U "$USER_NAME" -d "$TARGET" --no-owner --no-privileges --exit-on-error < "$DUMP"
echo "Restored $DUMP into $TARGET."
$COMPOSE exec -T db psql -U "$USER_NAME" -d "$TARGET" -c "select count(*) as organizations from organizations;" -c "select version_num from alembic_version;"

if [ "$TARGET" = "$LIVE_DB" ]; then
  $COMPOSE start api
  echo "API started again."
fi
