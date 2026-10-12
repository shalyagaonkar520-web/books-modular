# ---------- Rooman One Core API ----------
# Build context: the repository root (Core uses packages/sdk-python).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY packages/sdk-python /src/sdk-python
COPY core/backend/requirements.txt ./
RUN pip install --no-cache-dir /src/sdk-python -r requirements.txt

COPY core/backend/core_api ./core_api
COPY core/backend/database ./database
COPY core/backend/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

ENV ENVIRONMENT=production \
    PORT=8000 \
    APP_MODULE=core_api.main:app \
    SERVICE_TITLE="Rooman One Core API"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["serve"]
