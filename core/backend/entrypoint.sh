#!/usr/bin/env bash
# Starts the API. Migrations run only when RUN_MIGRATIONS=true, so that in
# production a backup can be taken before every schema change.
set -euo pipefail

WORKERS="${WEB_CONCURRENCY:-2}"
PORT="${PORT:-8000}"

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "Applying database migrations…"
  alembic -c database/alembic.ini upgrade head
fi

case "${1:-serve}" in
  serve)
    echo "Starting ${SERVICE_TITLE:-API} on port ${PORT} with ${WORKERS} worker(s)"
    exec gunicorn "${APP_MODULE}" \
      --worker-class uvicorn.workers.UvicornWorker \
      --workers "${WORKERS}" \
      --bind "0.0.0.0:${PORT}" \
      --access-logfile - \
      --error-logfile - \
      --timeout 60 \
      --graceful-timeout 30
    ;;
  migrate)
    alembic -c database/alembic.ini upgrade head
    echo "Migrations complete."
    ;;
  *)
    exec "$@"
    ;;
esac
