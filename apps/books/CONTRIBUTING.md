# Contributing to Rooman Books

## Getting set up

```bash
python -m pip install -r requirements-dev.txt
npm install
cp .env.example .env
python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(48))" >> .env
alembic upgrade head
./scripts/dev.sh
```

## Branching and pull requests

- Branch from `main` using `feat/…`, `fix/…`, `chore/…` or `docs/…`.
- Pull request titles must follow Conventional Commits, for example
  `fix(invoices): restore stock when a sent invoice is voided`. CI enforces this.
- Keep pull requests focused. A schema change, its migration and its tests belong together.
- Every pull request must pass backend lint, the backend suite on SQLite and PostgreSQL,
  frontend typecheck, lint, unit tests and build, the Docker builds, and the integration
  smoke test. Squash merge once a reviewer approves.

## The rules that matter here

1. **No sample data.** The product must never invent a number. If there is nothing to show,
   render an empty state.
2. **Money is `Decimal` on the server.** Use the helpers in `backend/services/money.py`
   (`money()`, `qty()`) and never `float` arithmetic for amounts. In the UI, format through
   `@/utils/format`.
3. **Every financial change posts a balanced journal entry** through
   `backend/services/ledger.py`. Never write to `journal_lines` directly, and never delete
   history: post a reversal instead.
4. **Tenant scope is not optional.** Every query filters on `organization_id`, and route
   handlers resolve records with `get_or_404(db, Model, id, user.organization_id, …)`.
5. **Validate at the edge.** Request shapes belong in `backend/schemas/`; business rules
   raise `HTTPException` with a message a user can act on.
6. **Tests come with the change.** Add cases for the happy path, the validation failures and,
   when the ledger is touched, an assertion that the trial balance still balances.

## Adding an endpoint

1. Define the request and response models in `backend/schemas/`.
2. Add the handler to the matching module in `backend/routers/`, depending on
   `get_current_user` for reads and `require_write` or `require_admin` for writes.
3. Record an audit entry for mutations with `backend/services/audit.record`.
4. Add a typed wrapper to `src/api/endpoints.ts` and the response type to `src/api/types.ts`.
5. Cover it in `tests/`, then run the commands in the pull request template.

## Changing the schema

```bash
# edit backend/models.py, then:
alembic revision --autogenerate -m "describe the change"
# review the generated file, then:
alembic upgrade head
alembic check     # must report no new operations
```

## Code style

- Python: `ruff check backend tests` must be clean. Type hints on public functions, and
  docstrings where the intent is not obvious from the name.
- TypeScript: strict mode with no `any`, and `npm run lint` must report zero warnings.
  Reuse the components in `src/components/ui/` rather than adding new styling.
- CSS: extend `src/styles/index.css` using the existing custom properties. No inline style
  objects except for values computed at runtime.
