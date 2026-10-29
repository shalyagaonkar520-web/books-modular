"""point of sale: a phone scanner session for the bill or for adding items

Revision ID: a4d8e2f6c0b9
Revises: f3c9d5a7b1e4
Create Date: 2026-10-28 10:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'a4d8e2f6c0b9'
down_revision = 'f3c9d5a7b1e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pos_scanner_sessions', sa.Column('purpose', sa.String(length=10), server_default='sale', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('pos_scanner_sessions', schema=None) as batch_op:
        batch_op.drop_column('purpose')
