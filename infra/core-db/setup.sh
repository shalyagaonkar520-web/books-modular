#!/usr/bin/env bash
# Set up the central (Core) database on this server.
#
#   cd /opt/rooman-one/infra/core-db
#   cp .env.example .env && chmod 600 .env && editor .env
#   sudo ./setup.sh
#
# Safe to re-run: it never overwrites an existing certificate or database.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Create .env from .env.example first." >&2; exit 1; }
[ "$(stat -c %a .env)" = "600" ] || { echo ".env must be chmod 600 (it holds passwords)." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. ./.env
set +a

for v in BIND_IP ALLOWED_CIDR POSTGRES_PASSWORD CORE_OWNER_PASSWORD CORE_APP_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "Set $v in .env." >&2; exit 1; }
done
for v in POSTGRES_PASSWORD CORE_OWNER_PASSWORD CORE_APP_PASSWORD; do
  val="${!v}"; [ "${#val}" -ge 20 ] || { echo "$v must be at least 20 characters." >&2; exit 1; }
done
case "$BIND_IP" in
  0.0.0.0 | "*" | ::) echo "BIND_IP must be the private address, not $BIND_IP." >&2; exit 1 ;;
esac
case "$ALLOWED_CIDR" in
  0.0.0.0/0 | ::/0) echo "ALLOWED_CIDR must name the app servers, not the whole internet." >&2; exit 1 ;;
esac
# Capture first: with pipefail, `ip | grep -q` fails when grep exits early (SIGPIPE).
addrs="$(ip -o addr show)"
grep -q " $BIND_IP/" <<< "$addrs" || { echo "BIND_IP $BIND_IP is not an address of this server." >&2; exit 1; }

# TLS certificate (self-signed, 10 years). Replace with your CA's if you have one.
mkdir -p certs
if [ ! -f certs/server.key ]; then
  echo "Creating a TLS certificate for ${TLS_COMMON_NAME:-core-db.internal}"
  openssl req -new -x509 -days 3650 -nodes -newkey rsa:3072 \
    -subj "/CN=${TLS_COMMON_NAME:-core-db.internal}" \
    -addext "subjectAltName=DNS:${TLS_COMMON_NAME:-core-db.internal},IP:${BIND_IP}" \
    -keyout certs/server.key -out certs/server.crt
fi
# postgres (uid 70 in the alpine image) must own the key, readable by it only
chown 70:70 certs/server.key certs/server.crt
chmod 600 certs/server.key
chmod 644 certs/server.crt
chmod +x initdb/*.sh

docker compose up -d
echo "Waiting for the database to become healthy..."
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' rooman-core-db 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' rooman-core-db)" = "healthy" ] || { docker logs --tail 50 rooman-core-db; exit 1; }

./verify.sh

cat <<EOF

Done. Connection settings for the Core API (put the passwords in its own .env):
  DATABASE_URL=postgresql+psycopg://rooman_core_app:<CORE_APP_PASSWORD>@${BIND_IP}:${PORT:-5432}/${CORE_DB_NAME:-rooman_core}?sslmode=verify-ca&sslrootcert=/path/to/core-db.crt
  MIGRATIONS_DATABASE_URL=postgresql+psycopg://rooman_core_owner:<CORE_OWNER_PASSWORD>@${BIND_IP}:${PORT:-5432}/${CORE_DB_NAME:-rooman_core}?sslmode=verify-ca&sslrootcert=/path/to/core-db.crt
Copy certs/server.crt (public, not the key) to the app server as core-db.crt.
Next: open the firewall for ALLOWED_CIDR only (see docs/runbooks/core-db-server.md).
EOF
