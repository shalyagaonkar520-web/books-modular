#!/usr/bin/env bash
# Applies database migrations, then starts the API.
set -euo pipefail

WORKERS="${WEB_CONCURRENCY:-2}"
PORT="${PORT:-8000}"

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations…"
  alembic upgrade head
fi

case "${1:-serve}" in
  serve)
    echo "Starting Rooman Books API on port ${PORT} with ${WORKERS} worker(s)"
    exec gunicorn backend.main:app \
      --worker-class uvicorn.workers.UvicornWorker \
      --workers "${WORKERS}" \
      --bind "0.0.0.0:${PORT}" \
      --access-logfile - \
      --error-logfile - \
      --timeout 60 \
      --graceful-timeout 30
    ;;
  migrate)
    echo "Migrations complete."
    ;;
  *)
    exec "$@"
    ;;
esac
