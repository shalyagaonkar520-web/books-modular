# Runbook: the central (Core) database server

The central database holds only what every app shares: users, organizations, memberships, roles, plans, app access, the shared customer list (`parties`) and the audit log. Business data stays in each app's own database (Books in CT103, and so on). Apps reach Core through its API, never by connecting to this database.

```
Proxmox server 192.168.1.50                Proxmox server 192.168.1.60 ("Rooman")
  Books container 192.168.1.54  ── 5432/TLS ──►  CT104 rooman-one-core-db 192.168.1.64
  (Books + its own database)                     (central Core database, this runbook)
                                                 CT100 postgres-db: unrelated, never touch
```

The two are separate physical servers on the same 192.168.1.0/24 network, so a failure of one does not take down the other.

## 1. Create the container in Proxmox (server "Rooman", 192.168.1.60)

Proxmox UI → **Create CT**:

| Field | Value |
|---|---|
| CT ID / Hostname | `104` / `rooman-one-core-db` |
| Unprivileged | yes |
| Template | Debian 12 standard |
| Disk | `local-lvm`, 32 GB |
| CPU / Memory / Swap | 2 cores / 4096 MB / 1024 MB |
| Network | `vmbr0`, **static** IPv4, e.g. `192.168.1.64/24`, gateway as for CT103. Check first that the address is free. |
| DNS | same as CT103 |

After it's created: **CT104 → Options → Features → enable `nesting` and `keyctl`**, the same as CT103, so Docker runs inside the LXC. Then **Options → Start at boot: yes**.

Firewall, so only Books' container (and later the Core API's) can reach PostgreSQL:
**CT104 → Firewall → Add**: Direction `in`, Action `ACCEPT`, Protocol `tcp`, Dest. port `5432`, Source `192.168.1.54/32` (the Books container on the .50 server). Then **Firewall → Options → Firewall: Yes, Input policy: DROP**. Also add an `ACCEPT` rule for `tcp 22` from your admin machine, or you will lock yourself out of SSH.

## 2. Install Docker in CT104

```bash
apt update && apt -y full-upgrade
apt -y install ca-certificates curl git openssl
curl -fsSL https://get.docker.com | sh
```

## 3. Get the kit and configure it

```bash
git clone <rooman-one repo url> /opt/rooman-one        # or copy infra/core-db over
cd /opt/rooman-one/infra/core-db
cp .env.example .env && chmod 600 .env
nano .env
```

In `.env`:
- `BIND_IP`: CT104's own address (e.g. `192.168.1.64`). PostgreSQL is published here only.
- `ALLOWED_CIDR`: the container that runs the Core API, as `/32`. Until Core is deployed, use the Books container's address, `192.168.1.54/32`.
- three passwords of 20+ characters each (`openssl rand -base64 32 | tr -d '/+=' | cut -c1-32`). Store them in your password manager.

## 4. Start it

```bash
sudo ./setup.sh
```

The script refuses to run with weak or missing settings, or with the database published on all interfaces. It then:
- creates a TLS certificate;
- starts PostgreSQL 16;
- creates the database with two roles:
  - `rooman_core_owner` runs migrations;
  - `rooman_core_app` is the runtime user: rows only, no schema changes, not a superuser, cannot bypass row-level security;
- runs `verify.sh`, which must report `0 failed`.

It is safe to re-run. It never replaces an existing certificate or database.

## 5. Connect the Core API (from its own container)

Copy `certs/server.crt` (the public certificate, **not** the key) to the API host as `core-db.crt`. Then set:

```
DATABASE_URL=postgresql+psycopg://rooman_core_app:<app password>@192.168.1.64:5432/rooman_core?sslmode=verify-ca&sslrootcert=/run/secrets/core-db.crt
MIGRATIONS_DATABASE_URL=postgresql+psycopg://rooman_core_owner:<owner password>@192.168.1.64:5432/rooman_core?sslmode=verify-ca&sslrootcert=/run/secrets/core-db.crt
```

Migrations: `alembic -c database/alembic.ini upgrade head` (it uses `MIGRATIONS_DATABASE_URL`). The API itself only ever uses `DATABASE_URL`.

## 6. Backups

Use the shared backup script on CT104. In `/etc/rooman/backup.env`:

```
DATABASES="rooman-core-db|rooman_core|rooman_core_owner"
```

Then follow `docs/runbooks/backup-restore.md`, with an off-site target. Books and Core sit on different physical servers (.50 and .60), so as a cheap extra layer each server can also keep a copy of the other's backups. A Proxmox-level backup of CT104 (Datacenter → Backup) helps too, but it doesn't replace `pg_dump`.

## Changing who may connect

`pg_hba.conf` is written once, when the database is first created. To allow another app host later:

```bash
docker exec -it rooman-core-db sh -c 'vi "$PGDATA/pg_hba.conf"'   # add a hostssl line for the new /32
docker exec rooman-core-db psql -U postgres -c 'select pg_reload_conf()'
```

Also add a matching Proxmox firewall rule.

## Rotating a password

```bash
docker exec -it rooman-core-db psql -U postgres -c "ALTER ROLE rooman_core_app PASSWORD '<new>'"
```

Update `.env` here and the API's `DATABASE_URL`, then restart the API. Do the owner role the same way before the next migration.
