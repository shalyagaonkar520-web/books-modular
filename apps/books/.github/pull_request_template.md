## What changed

<!-- One or two sentences on the change and why it is needed. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor or chore
- [ ] Documentation

## Accounting impact

<!-- Delete this section if the change cannot affect the ledger. -->

- [ ] No journal postings changed
- [ ] Journal postings changed, and the trial balance still balances (a test covers it)
- [ ] Stock movements changed, and a test covers the new behaviour
- [ ] A database migration is included (`alembic revision --autogenerate`) and `alembic check` passes

## How this was verified

<!-- Commands you ran and what you saw. -->

```
pytest -q
npm run test
npx tsc -b
npm run lint
```

## Checklist

- [ ] No sample, demo or placeholder data was introduced
- [ ] New or changed endpoints are covered by tests
- [ ] Money values use `Decimal` on the server and the `@/utils/format` helpers in the UI
- [ ] Errors are surfaced to the user rather than swallowed
- [ ] Read-only (`viewer`) users cannot reach new mutating controls
- [ ] No secrets, `.env` files or databases are committed
