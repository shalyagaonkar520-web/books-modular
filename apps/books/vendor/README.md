# Vendored Rooman One code

Books' image is built from `apps/books` only (production builds it on its own server), so it cannot reach the monorepo's `packages/` and `contracts/`. These are exact copies, refreshed with `scripts/sync_vendor.sh`; `tests/test_vendor_in_sync.py` fails if they drift from the originals.

- `sdk-python/`: `rooman_sdk` (event envelope and signing, outbox, consume-once helper, token checks)
- `contracts/events/`: the event schemas Books validates incoming events against
