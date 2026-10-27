"""point of sale: the phone scanner opens from its QR code without signing in

A secret key in the QR link (only its SHA-256 is stored) replaces the
phone's sign-in, and each scan carries a quantity.

Revision ID: f3c9d5a7b1e4
Revises: e2b8c4f6a9d3
Create Date: 2026-10-27 19:30:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'f3c9d5a7b1e4'
down_revision = 'e2b8c4f6a9d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Plain ADD COLUMN (nullable / with a default), no table copy on SQLite.
    op.add_column('pos_scanner_sessions', sa.Column('token_hash', sa.String(length=64), nullable=True))
    op.create_index('ix_pos_scanner_sessions_token_hash', 'pos_scanner_sessions', ['token_hash'], unique=True)
    op.add_column('pos_scans', sa.Column('quantity', sa.Numeric(precision=14, scale=3), server_default='1', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('pos_scans', schema=None) as batch_op:
        batch_op.drop_column('quantity')
    op.drop_index('ix_pos_scanner_sessions_token_hash', table_name='pos_scanner_sessions')
    with op.batch_alter_table('pos_scanner_sessions', schema=None) as batch_op:
        batch_op.drop_column('token_hash')
