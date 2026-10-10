#!/usr/bin/env bash
# Runs once, when the data volume is first created (docker-entrypoint-initdb.d).
# Creates the Core database, its two roles and the connection rules.
set -euo pipefail

: "${CORE_DB_NAME:?}" "${CORE_OWNER_PASSWORD:?}" "${CORE_APP_PASSWORD:?}" "${ALLOWED_CIDR:?}"

psql -v ON_ERROR_STOP=1 --username postgres --dbname postgres \
  -v db="$CORE_DB_NAME" -v owner_pw="$CORE_OWNER_PASSWORD" -v app_pw="$CORE_APP_PASSWORD" <<'SQL'
-- owner: owns the schema, used by migrations only
CREATE ROLE rooman_core_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- app: runtime user for the Core API, rows only
CREATE ROLE rooman_core_app LOGIN PASSWORD :'app_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  CONNECTION LIMIT 150;
CREATE DATABASE :"db" OWNER rooman_core_owner ENCODING 'UTF8' TEMPLATE template0;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO rooman_core_owner, rooman_core_app;
SQL

psql -v ON_ERROR_STOP=1 --username postgres --dbname "$CORE_DB_NAME" <<'SQL'
-- nobody but the owner may create objects in public
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO rooman_core_owner;
GRANT USAGE ON SCHEMA public TO rooman_core_app;
-- every table and sequence the owner creates later is usable by the app,
-- for rows only (no TRUNCATE, no DDL)
ALTER DEFAULT PRIVILEGES FOR ROLE rooman_core_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rooman_core_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rooman_core_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO rooman_core_app;
SQL

# Connection rules: local socket for administration inside the container;
# from outside only TLS, only the Core roles, only from ALLOWED_CIDR.
cat > "$PGDATA/pg_hba.conf" <<HBA
# TYPE   DATABASE         USER                               ADDRESS           METHOD
local    all              postgres                                             scram-sha-256
host     all              postgres                           127.0.0.1/32      scram-sha-256
hostssl  ${CORE_DB_NAME}  rooman_core_owner,rooman_core_app  ${ALLOWED_CIDR}   scram-sha-256
host     all              all                                0.0.0.0/0         reject
host     all              all                                ::/0              reject
HBA

echo "rooman core db: roles, database and pg_hba.conf created for ${CORE_DB_NAME}"
