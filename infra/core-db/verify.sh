#!/usr/bin/env bash
# Prove the central database is locked down as intended. Read-only checks,
# except a temporary table created and dropped by the owner.
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck source=/dev/null
. ./.env
set +a
DB="${CORE_DB_NAME:-rooman_core}"
C=rooman-core-db
pass=0
fail=0
ok() { echo "  ok   $1"; pass=$((pass + 1)); }
bad() { echo "  FAIL $1"; fail=$((fail + 1)); }
q() { docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$C" psql -U postgres -d "$DB" -Atc "$1"; }
as() { docker exec -e PGPASSWORD="$2" "$C" psql "host=127.0.0.1 dbname=$DB user=$1 sslmode=require" -Atc "$3"; }

echo "Checking ${DB} on ${C}:"
[ "$(q "show ssl")" = "on" ] && ok "TLS is on" || bad "TLS is off"
[ "$(q "show password_encryption")" = "scram-sha-256" ] && ok "passwords use scram-sha-256" || bad "weak password hashing"
[ "$(q "select rolsuper from pg_roles where rolname='rooman_core_app'")" = "f" ] && ok "app role is not a superuser" || bad "app role is a superuser"
[ "$(q "select rolbypassrls from pg_roles where rolname='rooman_core_app'")" = "f" ] && ok "app role cannot bypass row-level security" || bad "app role bypasses RLS"
[ "$(q "select pg_get_userbyid(datdba) from pg_database where datname='$DB'")" = "rooman_core_owner" ] && ok "database owned by rooman_core_owner" || bad "wrong database owner"

# Role permissions, checked by switching role inside the server. (Network
# logins as these roles only work from ALLOWED_CIDR, by design.)
if q "set role rooman_core_owner; create table _verify(id int); drop table _verify;" > /dev/null 2>&1; then
  ok "owner can change the schema (migrations)"
else
  bad "owner cannot create tables"
fi
if q "set role rooman_core_app; create table _verify_app(id int);" > /dev/null 2>&1; then
  bad "app role can create tables"
  q "drop table if exists _verify_app" > /dev/null
else
  ok "app role cannot create tables"
fi
# a table the owner creates must be usable by the app for rows (default privileges)
q "set role rooman_core_owner; create table _verify_rows(id int)" > /dev/null 2>&1 || true
if q "set role rooman_core_app; insert into _verify_rows values (1); update _verify_rows set id = 2; select count(*) from _verify_rows; delete from _verify_rows;" > /dev/null 2>&1; then
  ok "app role can read and write rows in the owner's tables"
else
  bad "app role cannot use the owner's tables (default privileges)"
fi
if q "set role rooman_core_app; truncate _verify_rows;" > /dev/null 2>&1; then
  bad "app role can truncate tables"
else
  ok "app role cannot truncate tables"
fi
q "drop table if exists _verify_rows" > /dev/null 2>&1 || true
# connection rules: a login from an address outside ALLOWED_CIDR must be refused
if as rooman_core_app "$CORE_APP_PASSWORD" "select 1" > /dev/null 2>&1; then
  bad "app role can log in from 127.0.0.1, outside ALLOWED_CIDR"
else
  ok "logins from outside ALLOWED_CIDR are rejected"
fi
allowed_ip="${ALLOWED_CIDR%/*}"
if [ "$(q "select count(*) from pg_hba_file_rules where type = 'hostssl' and address = '${allowed_ip}'")" -ge 1 ]; then
  ok "TLS logins allowed from ${ALLOWED_CIDR} only"
else
  bad "no hostssl rule for ${ALLOWED_CIDR}"
fi
published="$(docker port "$C" 5432/tcp)"
case "$published" in
  0.0.0.0:* | "[::]":* | :::*) bad "port is published on all interfaces ($published)" ;;
  *) ok "port published on $published only" ;;
esac

echo "${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
