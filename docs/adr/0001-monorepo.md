# ADR 0001: One monorepo, with Books imported with its history

- Status: Accepted
- Date: 2026-10-09

## Context

Rooman One has several services (Core, Books, Bookings, later Billing, CRM and an events app) and shared code: the Python SDK, the `@rooman/shell` header and design tokens, and the event contracts. These must change together. For example, a new event field touches the contract, the SDK and the publisher in one review.

Books already lives in its own repository (`rooman-itsd/roomanbooks`), with 83 commits, a CI pipeline and a production deploy workflow.

## Decision

- One repository, laid out as `core/`, `apps/<app>/`, `packages/`, `contracts/`, `infra/` and `docs/`.
- Books is imported into `apps/books/` with `git filter-repo --to-subdirectory-filter`, so every commit, author and date is kept and `git log`/`git blame` keep working.
- Books keeps its own `backend/` and `frontend/` split, its own `requirements*.txt` and its own `package-lock.json`. It is not made part of the root npm workspace, so its dependency tree does not change.
- Each service still builds its own image and owns its own database. Being in one repo does not let services share a database or import each other's code; shared code goes in `packages/`.
- CI runs every pipeline on every pull request (`.github/workflows/`). There are no path filters, so a required check can never be silently skipped.

## Consequences

- One pull request can change a contract and every producer and consumer, and CI tests them together.
- Production Books keeps deploying from the `roomanbooks` repository until the deploy is deliberately moved (see `docs/runbooks/deploy.md`). Until then, changes made to Books in either repository must be brought across, so Books changes should be frozen in the old repository once the monorepo is adopted.
- CI time grows with the number of services. If it gets slow, add path filters with an always-passing summary job, not plain filters.

## Alternatives considered

- **Polyrepo with published packages.** Every contract change becomes several coordinated releases. Too slow for a small team.
- **Converting `roomanbooks` in place.** It would keep GitHub issues and pull requests, but rewrites the production repository and its deploy path while Books is live. The import leaves production untouched.
