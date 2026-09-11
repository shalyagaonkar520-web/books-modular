"""add email invite flow

Lets an admin invite a user by email instead of choosing a temporary
password for them. ``users.password_hash`` becomes nullable so an invited
row can exist before the invitee sets their own password, and a hashed,
expiring ``invite_token`` (mirroring how refresh tokens are stored) is added
so the accept-invite link can be verified without storing the raw token.

Revision ID: 540ce640f6cb
Revises: a1c4d8e2f6b0
Create Date: 2026-09-11
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "540ce640f6cb"
down_revision = "a1c4d8e2f6b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column("password_hash", existing_type=sa.String(length=255), nullable=True)
        batch_op.add_column(sa.Column("invite_token_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_users_invite_token_hash"), ["invite_token_hash"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_users_invite_token_hash"))
        batch_op.drop_column("invite_token_expires_at")
        batch_op.drop_column("invite_token_hash")
        batch_op.alter_column("password_hash", existing_type=sa.String(length=255), nullable=False)
