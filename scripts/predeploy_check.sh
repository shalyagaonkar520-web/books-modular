#!/usr/bin/env bash
# Everything that must pass before a release goes to the server.
#   scripts/predeploy_check.sh
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }

step "Backend lint"
python -m ruff check backend tests

step "Backend tests"
python -m pytest -q -p no:cacheprovider tests

step "Migrations: one head, upgrade and downgrade on a scratch SQLite database"
HEADS=$(python -m alembic -c database/alembic.ini heads | wc -l)
[ "$HEADS" -eq 1 ] || { echo "Expected one Alembic head, found $HEADS" >&2; exit 1; }
SCRATCH="$(mktemp -d)"
DATABASE_URL="sqlite:///$SCRATCH/check.db" python -m alembic -c database/alembic.ini upgrade head
DATABASE_URL="sqlite:///$SCRATCH/check.db" python -m alembic -c database/alembic.ini downgrade -1
DATABASE_URL="sqlite:///$SCRATCH/check.db" python -m alembic -c database/alembic.ini upgrade head
rm -rf "$SCRATCH"

step "Frontend type check, lint and tests"
(cd frontend && npx tsc --noEmit -p . && npx eslint src --max-warnings=0 && npx vitest run)

step "Frontend production build"
(cd frontend && npm run build)

step "Dependency audit (advisory)"
python -m pip_audit -r requirements.txt 2>/dev/null || echo "pip-audit not installed or found issues: review before deploying."
(cd frontend && npm audit --omit=dev --audit-level=high) || echo "npm audit found issues: review before deploying."

printf '\nAll checks passed.\n'
