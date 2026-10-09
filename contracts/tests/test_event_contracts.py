"""Event contracts: every schema is valid, every example matches its schema,
and the SDK envelope produces events the contracts accept."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from rooman_sdk.events import Actor, EventEnvelope

EVENTS = Path(__file__).resolve().parents[1] / "events"
SCHEMAS = sorted(p for p in EVENTS.glob("*.v*.schema.json"))
ENVELOPE = json.loads((EVENTS / "envelope.schema.json").read_text(encoding="utf-8"))
REGISTRY = (
    Registry()
    .with_resource("envelope.schema.json", Resource.from_contents(ENVELOPE))
    .with_resource(ENVELOPE["$id"], Resource.from_contents(ENVELOPE))
)

STARTING_SET = {
    "org.created", "org.plan_changed", "user.invited", "user.removed",
    "customer.created", "customer.updated",
    "appointment.created", "appointment.completed", "appointment.cancelled",
    "invoice.created", "payment.received",
    "subscription.created", "subscription.renewed", "subscription.cancelled",
}  # fmt: skip


def _validator(path: Path) -> Draft202012Validator:
    schema = json.loads(path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, registry=REGISTRY, format_checker=FormatChecker())


def _event_name(path: Path) -> str:
    return path.name.split(".v")[0]


def test_starting_set_is_complete():
    assert {_event_name(p) for p in SCHEMAS} == STARTING_SET


@pytest.mark.parametrize("path", SCHEMAS, ids=_event_name)
def test_example_matches_schema(path):
    example = json.loads((EVENTS / "examples" / path.name.replace(".schema", "")).read_text(encoding="utf-8"))
    errors = list(_validator(path).iter_errors(example))
    assert not errors, [e.message for e in errors]


@pytest.mark.parametrize("path", SCHEMAS, ids=_event_name)
def test_schema_rejects_missing_org_and_unknown_fields(path):
    validator = _validator(path)
    example = json.loads((EVENTS / "examples" / path.name.replace(".schema", "")).read_text(encoding="utf-8"))
    without_org = {k: v for k, v in example.items() if k != "org_id"}
    assert not validator.is_valid(without_org)
    assert not validator.is_valid({**example, "data": {**example["data"], "unexpected": 1}})


def test_sdk_envelope_is_accepted_by_the_contract():
    path = EVENTS / "invoice.created.v1.schema.json"
    example = json.loads((EVENTS / "examples" / "invoice.created.v1.json").read_text(encoding="utf-8"))
    event = EventEnvelope(
        type="invoice.created",
        org_id=example["org_id"],
        actor=Actor(type="user", id="u1"),
        source="books",
        data=example["data"],
    )
    assert _validator(path).is_valid(json.loads(event.to_json()))
