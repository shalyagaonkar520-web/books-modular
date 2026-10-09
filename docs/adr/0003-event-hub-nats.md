# ADR 0003: NATS JetStream as the event hub, fed by a transactional outbox

- Status: Accepted (open decision §9: may switch to Redis Streams before Phase 2)
- Date: 2026-10-09

## Context

Apps tell each other what happened through events, such as `invoice.created` or `appointment.completed`. We need durable, at-least-once delivery with retries, a dead-letter queue and replay, per-consumer progress, and a small operational footprint for a small team on a Proxmox host.

An event must never be lost when a change commits, or sent when it does not. Writing to the database and then publishing (two systems, no shared transaction) breaks that.

## Decision

- **Outbox.** Each service writes events to its own `outbox` table in the same transaction as the business change (`rooman_sdk.outbox.enqueue`). A publisher worker reads pending rows (`FOR UPDATE SKIP LOCKED`), publishes them and marks them published.
- **Hub.** NATS with JetStream: one stream per source service (`BOOKS`, `CORE`, ...), subjects `<source>.<type>` (e.g. `books.invoice.created`), and durable pull consumers per subscriber.
- **Delivery.** At least once. Consumers record handled event IDs in `processed_events` (`rooman_sdk.consumer.handle_once`) and skip repeats. Retries use exponential backoff via `MaxDeliver` and `BackOff`. After N failures the message is moved to a DLQ stream, with an admin replay screen (Phase 2).
- **Integrity.** Every event carries `org_id` and is signed with HMAC-SHA256 (`rooman_sdk.events.sign`). Consumers reject unsigned or mis-signed events.
- **Contracts.** Schemas are versioned in `contracts/events/` and tested in CI.

## Consequences

- A single small Go binary with file storage; it runs in one container next to the apps.
- The outbox makes "change saved ⇔ event recorded" a database guarantee, independent of the hub being up.
- Ordering is guaranteed per stream, not globally. Consumers must not depend on cross-service ordering.

## Alternatives considered

- **Redis Streams.** Simple and familiar, but persistence and DLQ handling are weaker, and we would build more of the retry and dead-letter logic ourselves. It remains the fallback if the team prefers Redis.
- **Kafka or Redpanda.** More than we need at this scale, and heavier to run.
- **Postgres LISTEN/NOTIFY only.** No durable consumer state across services, and it couples consumers to the producer's database.
