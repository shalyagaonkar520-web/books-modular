# Contracts

Agreements between Rooman One services. A change here is a change to a public interface: review it like an API change.

## Events (`events/`)

- `envelope.schema.json`: the wrapper every event uses (`id`, `type`, `version`, `org_id`, `actor`, `source`, `occurred_at`, `data`).
- `<type>.v<version>.schema.json`: one schema per event type and version. `x-source` names the service that publishes it.
- `examples/`: one valid example per schema. The tests check every example against its schema.

### Rules

- Every event carries `org_id`. Consumers must use it to scope everything they do.
- Money is a decimal **string** (`"1180.00"`), never a number.
- Delivery is at least once. Consumers skip repeats by `id` (`rooman_sdk.consumer.handle_once`).
- Events are signed with HMAC-SHA256 over the canonical JSON (`rooman_sdk.events.sign`). The signature travels in the `Rooman-Signature` message header.
- **Adding** an optional field is a compatible change within the same version.
- **Removing or renaming** a field, or making one required, needs a new version (`.v2`). The publisher sends both versions until every consumer has moved over.

## Running the tests

```bash
pip install -e packages/sdk-python[dev]
pytest contracts/tests
```

API contracts (OpenAPI) are generated from each service's FastAPI app; see `docs/api/`.
