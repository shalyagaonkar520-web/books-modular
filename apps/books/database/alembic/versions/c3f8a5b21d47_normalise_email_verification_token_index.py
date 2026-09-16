"""normalise the email_verifications.token_hash index

``EmailVerification.token_hash`` is declared ``unique=True, index=True``, which
SQLAlchemy renders as a single UNIQUE index named
``ix_email_verifications_token_hash``. Migration b1c6e7d3a9f2 instead built a
separately named UNIQUE CONSTRAINT alongside a non-unique index of that name,
so the schema it produced did not match the model and ``alembic check`` (run in
CI) reported drift.

This rebuilds it the way the model declares it: drop the standalone constraint
and make the index itself unique. It is written as a follow-up rather than an
edit to b1c6e7d3a9f2 because that revision is already applied in production, so
correcting it in place would never be picked up there.

Uniqueness of the column is preserved throughout - the unique index is created
before the old constraint's own implicit index goes away on backends that pair
them.

Revision ID: c3f8a5b21d47
Revises: b1c6e7d3a9f2
Create Date: 2026-09-16
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c3f8a5b21d47"
down_revision = "b1c6e7d3a9f2"
branch_labels = None
depends_on = None

_INDEX = "ix_email_verifications_token_hash"
_CONSTRAINT = "uq_email_verifications_token_hash"


def _existing(inspector, name: str, kind: str) -> bool:
    if kind == "index":
        return any(i["name"] == name for i in inspector.get_indexes("email_verifications"))
    return any(c["name"] == name for c in inspector.get_unique_constraints("email_verifications"))


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    with op.batch_alter_table("email_verifications", schema=None) as batch_op:
        if _existing(inspector, _INDEX, "index"):
            batch_op.drop_index(_INDEX)
        if _existing(inspector, _CONSTRAINT, "unique"):
            batch_op.drop_constraint(_CONSTRAINT, type_="unique")
        batch_op.create_index(_INDEX, ["token_hash"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("email_verifications", schema=None) as batch_op:
        batch_op.drop_index(_INDEX)
        batch_op.create_unique_constraint(_CONSTRAINT, ["token_hash"])
        batch_op.create_index(_INDEX, ["token_hash"])
