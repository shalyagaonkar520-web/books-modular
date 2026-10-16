# Build from the Rooman One repo root:
#   docker build -f apps/billing-connector/Dockerfile -t rooman-billing-connector .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY packages/sdk-python /tmp/sdk
RUN pip install --no-cache-dir /tmp/sdk "psycopg[binary]>=3.2,<4" && rm -rf /tmp/sdk
COPY apps/billing-connector/connector.py .
RUN useradd --system --uid 10001 connector && mkdir /data && chown connector /data
USER connector
VOLUME /data
# Healthy while a round finished in the last 5 minutes.
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s \
  CMD python -c "import os,sys,time; sys.exit(0 if time.time() - os.path.getmtime('/data/heartbeat') < 300 else 1)"
CMD ["python", "connector.py"]
