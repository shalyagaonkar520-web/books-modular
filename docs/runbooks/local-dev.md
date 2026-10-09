# Runbook: local development

## Whole stack (Docker)

Requires Docker with virtualization. On Windows that means Docker Desktop on WSL 2: run `wsl --install` as administrator, then reboot.

```bash
cp infra/compose/.env.example infra/compose/.env
# Fill every empty secret, e.g. python -c "import secrets; print(secrets.token_urlsafe(32))"
docker compose -f infra/compose/docker-compose.yml up -d --build
docker compose -f infra/compose/docker-compose.yml ps
```

| URL | Service |
|---|---|
| http://books.localhost | Books web + API (same images as production) |
| http://id.localhost | Core web; `/api/health` is the Core API |
| http://bookings.localhost/api/health | Bookings API |
| http://127.0.0.1:8088 | Traefik dashboard (local only) |

`*.localhost` resolves to 127.0.0.1 in modern browsers and in curl. Only the gateway publishes a port, and only on 127.0.0.1. To reach a database, use `docker compose exec books-db psql -U roomanbooks`.

Reset everything, **deleting local data**: `docker compose -f infra/compose/docker-compose.yml down -v`.

## One service without Docker

```bash
# Books: unchanged from before the move
cd apps/books && ./scripts/dev.sh

# Core (port 8001, SQLite file)
cd core/backend
python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
export DATABASE_URL=sqlite:///./core-dev.db
alembic -c database/alembic.ini upgrade head
uvicorn core_api.main:app --reload --port 8001

# Core web (port 3001, proxies /api to 8001)
npm ci && npm run dev --workspace @rooman/core-web
```

Bookings works the same way as Core (`apps/bookings/backend`, `bookings_api.main:app`).

## Regenerating docs after a schema or API change

```bash
python scripts/gen_docs.py books      # with Books' dependencies installed
python scripts/gen_docs.py core
python scripts/gen_docs.py bookings
```

Commit the changed `docs/erd/*.md` and `docs/api/*.json`.
