# Rooman One

A suite of business apps for Indian businesses that share one login, one company account and one customer list. Customers sign in once, use the apps their plan includes, and data flows between the apps automatically.

## Layout

| Path | What it is |
|---|---|
| `apps/books/` | **Rooman Books**, the live accounting app. Moved here with its full git history; it still has its own `backend/`, `frontend/`, `database/`, `tests/` and `deployment/`. |
| `apps/bookings/` | Rooman Bookings (appointments). Service skeleton; features arrive in Phase 4. |
| `core/backend/` | Core: identity, organizations, plans, app access, shared customer record. Skeleton; identity arrives in Phase 1. |
| `core/frontend/` | The sign-in site at `id.<domain>`. |
| `packages/shell/` | `@rooman/shell`: the shared header, design tokens and light/dark theme. |
| `packages/sdk-python/` | `rooman_sdk`: Core token checks, event envelope and signing, outbox, consume-once helper. |
| `contracts/` | Versioned event schemas (`contracts/events`) with examples and tests. |
| `infra/` | Local Docker Compose stack (`infra/compose`) and backup scripts (`infra/backup`). |
| `docs/` | Architecture, ADRs, ERDs, OpenAPI files and runbooks. |
| `scripts/` | Repo tooling, such as `gen_docs.py`, which regenerates the ERDs and OpenAPI files. |

## Run everything locally

You need Docker with virtualization enabled (on Windows: WSL 2).

```bash
cp infra/compose/.env.example infra/compose/.env    # fill in the empty secrets
docker compose -f infra/compose/docker-compose.yml up -d --build
```

- http://books.localhost: Rooman Books, the same images as production
- http://id.localhost: Core
- http://bookings.localhost/api/health: Bookings

See [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md) for running a single service without Docker.

## Tests

```bash
# Books (unchanged commands, run inside apps/books)
cd apps/books && pytest -q && (cd frontend && npm ci && npm test)

# Core and Bookings
cd core/backend && pip install -r requirements-dev.txt && pytest -q
cd apps/bookings/backend && pip install -r requirements-dev.txt && pytest -q

# SDK and event contracts
pip install -e "packages/sdk-python[dev]" && (cd packages/sdk-python && pytest -q) && pytest -q contracts/tests

# Shell and Core web
npm ci && npm test
```

CI runs all of this on every pull request, plus lint, type checks, migration checks on PostgreSQL, Docker image builds, `pip-audit`, `npm audit` and a gitleaks secret scan (`.github/workflows/`).

## Rules that never bend

1. Apps own their data. No app reads or writes another app's database.
2. Core owns identity, organizations, plans and app access.
3. Use the API to ask for something now. Use events to tell others something happened.
4. Every row and every message carries the organization ID; no tenant ever sees another's data.
5. Every schema change is an Alembic migration with a working downgrade, and a backup is taken first.
6. Books keeps working for current customers at every step.

Details are in [docs/architecture.md](docs/architecture.md) and the [ADRs](docs/adr/).
