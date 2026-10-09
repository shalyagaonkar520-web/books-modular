"""organization code; admin-panel logins that must set their own credentials

* ``organizations.code`` - short unique code from the name ("rooman",
  "rooman-2"); the default admin-panel login is ``admin@<code>``. Existing
  organizations are backfilled, oldest first.
* ``org_panel_admins.must_change_credentials`` - the admin must choose their
  own login ID and password before using the panel (default login, or after a
  reset). Existing logins: false.
* ``org_panel_admins.reset_requested_at`` - a pending "forgot password"
  request for the platform admin.

Revision ID: b5e1d7c3a9f4
Revises: a8d4c1e6f2b9
Create Date: 2026-10-06
"""

from __future__ import annotations

import re

import sqlalchemy as sa

from alembic import op

revision = "b5e1d7c3a9f4"
down_revision = "a8d4c1e6f2b9"
branch_labels = None
depends_on = None


def _base(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")[:30].strip("-")
    return base or "org"


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.add_column(sa.Column("code", sa.String(length=40), nullable=True))
    conn = op.get_bind()
    taken: set = set()
    for org_id, name in conn.execute(sa.text("SELECT id, name FROM organizations ORDER BY created_at, id")).fetchall():
        base = _base(name)
        code, n = base, 1
        while code in taken:
            n += 1
            code = f"{base}-{n}"
        taken.add(code)
        conn.execute(sa.text("UPDATE organizations SET code = :code WHERE id = :id"), {"code": code, "id": org_id})
    with op.batch_alter_table("organizations") as batch:
        batch.create_index("ix_organizations_code", ["code"], unique=True)

    with op.batch_alter_table("org_panel_admins") as batch:
        batch.add_column(sa.Column("must_change_credentials", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("reset_requested_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("org_panel_admins") as batch:
        batch.drop_column("reset_requested_at")
        batch.drop_column("must_change_credentials")
    with op.batch_alter_table("organizations") as batch:
        batch.drop_index("ix_organizations_code")
        batch.drop_column("code")
