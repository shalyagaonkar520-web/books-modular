"""organization: what its admin panel may edit in the app content

``organizations.panel_content_access`` - JSON list of module keys plus
"branding" / "general", set by the platform admin. NULL (every existing row)
= the modules of the organization's plan, no extras.

Revision ID: c7a2e9d4b1f6
Revises: b5e1d7c3a9f4
Create Date: 2026-10-07
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c7a2e9d4b1f6"
down_revision = "b5e1d7c3a9f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.add_column(sa.Column("panel_content_access", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.drop_column("panel_content_access")
