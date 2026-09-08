#!/usr/bin/env bash
# Starts the API and the Vite dev server together for local development.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found; creating one from .env.example with development defaults."
  cp .env.example .env
  {
    printf '\nENVIRONMENT=development\n'
    printf 'DATABASE_URL=sqlite:///./data/roomanbooks.db\n'
    printf 'SECRET_KEY=%s\n' "$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  } >> .env
fi

mkdir -p data

cleanup() {
  echo
  echo "Stopping services…"
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Applying database migrations…"
alembic upgrade head

echo "Starting API on http://127.0.0.1:8000 (API docs at /docs)"
uvicorn backend.main:app --reload --port 8000 &

echo "Starting web app on http://localhost:3000"
npm run dev &

wait
