"""Rooman Expenses: a product of the Books codebase, with its own app key.

Rooman Expenses (expenses, bills, vendors and reports from apps/books) signs in
with Rooman One as the app ``expenses``. Its OIDC client
(``python -m core_api.clients create-web --app expenses ...``) needs this row,
and an organization reaches it once it has an active ``org_apps`` row for it
(see docs/books-products.md).

Revision ID: 0005_expenses_app
Revises: 0004_sign_in
Create Date: 2026-10-22
"""

from __future__ import annotations

from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision = "0005_expenses_app"
down_revision = "0004_sign_in"
branch_labels = None
depends_on = None

_APP = {"key": "expenses", "name": "Rooman Expenses", "status": "active"}


def upgrade() -> None:
    now = datetime.now(UTC)
    apps = sa.table(
        "apps",
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("base_url", sa.String),
        sa.column("status", sa.String),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(apps, [{**_APP, "base_url": None, "created_at": now, "updated_at": now}])


def downgrade() -> None:
    # Refused by the foreign keys while a client or an organization still uses the app:
    # remove those deliberately first rather than have a downgrade delete them.
    op.execute(sa.text("DELETE FROM apps WHERE key = :key").bindparams(key=_APP["key"]))
