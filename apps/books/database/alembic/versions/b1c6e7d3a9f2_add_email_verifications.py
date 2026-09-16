"""add email_verifications

Adds the ``email_verifications`` table backing the pre-registration email
verification flow (send a token/OTP to an address, verify it, then require
that verified status when registering). ``user_id`` is nullable because a
verification row is created before any user account exists - it only gets
linked once that email goes on to register.

Revision ID: b1c6e7d3a9f2
Revises: 9850cea537f0
Create Date: 2026-09-16
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "b1c6e7d3a9f2"
down_revision = "9850cea537f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_verifications",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(length=32), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("token_hash", name="uq_email_verifications_token_hash"),
    )
    with op.batch_alter_table("email_verifications", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_email_verifications_user_id"), ["user_id"])
        batch_op.create_index(batch_op.f("ix_email_verifications_email"), ["email"])
        batch_op.create_index(batch_op.f("ix_email_verifications_token_hash"), ["token_hash"])


def downgrade() -> None:
    op.drop_table("email_verifications")
