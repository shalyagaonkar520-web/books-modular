"""add organization subscriptions (trial, plan, pending request)

Columns on ``organizations`` (see the Organization model and
services/subscription):

  * ``trial_ends_at`` - end of the free trial (NULL = no trial / not started);
  * ``subscription_status`` - ``trial`` | ``active`` ("expired" is derived);
  * ``pending_request`` - JSON of a plan request awaiting a super-admin;
  * ``subscription_requested_at`` / ``subscription_decided_at`` /
    ``subscription_note`` - request and decision times, last rejection reason;
  * ``requested_modules`` / ``billing_cycle`` / ``monthly_price`` /
    ``plan_price`` - the active plan.

Existing rows become ``active`` with no plan and no trial, so nothing changes
for them (every module, never locked).

Revision ID: f3b8d2a6c9e1
Revises: e7c2a9f4d1b8
Create Date: 2026-09-30
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "f3b8d2a6c9e1"
down_revision = "e7c2a9f4d1b8"
branch_labels = None
depends_on = None

_COLUMNS = (
    "trial_ends_at",
    "subscription_status",
    "pending_request",
    "subscription_requested_at",
    "subscription_decided_at",
    "subscription_note",
    "requested_modules",
    "billing_cycle",
    "monthly_price",
    "plan_price",
)


def upgrade() -> None:
    op.add_column("organizations", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("subscription_status", sa.String(length=20), nullable=False, server_default="active"))
    op.add_column("organizations", sa.Column("pending_request", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("subscription_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("subscription_decided_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("subscription_note", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("requested_modules", sa.Text(), nullable=True))
    op.add_column("organizations", sa.Column("billing_cycle", sa.String(length=10), nullable=True))
    op.add_column("organizations", sa.Column("monthly_price", sa.Numeric(precision=12, scale=2), nullable=True))
    op.add_column("organizations", sa.Column("plan_price", sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        for column in reversed(_COLUMNS):
            batch.drop_column(column)
