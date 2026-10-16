#!/usr/bin/env bash
# Refresh apps/books/vendor from the monorepo (run from anywhere inside it).
set -euo pipefail
BOOKS="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$BOOKS/../.." && pwd)"
rm -rf "$BOOKS/vendor/sdk-python" "$BOOKS/vendor/contracts"
mkdir -p "$BOOKS/vendor/sdk-python" "$BOOKS/vendor/contracts"
cp -r "$ROOT/packages/sdk-python/rooman_sdk" "$ROOT/packages/sdk-python/pyproject.toml" "$BOOKS/vendor/sdk-python/"
cp -r "$ROOT/contracts/events" "$BOOKS/vendor/contracts/"
find "$BOOKS/vendor" -name __pycache__ -type d -prune -exec rm -rf {} +
echo "vendor/ refreshed from $ROOT"
