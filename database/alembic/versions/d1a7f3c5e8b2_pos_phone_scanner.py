"""point of sale: a phone as the counter's barcode scanner

Revision ID: d1a7f3c5e8b2
Revises: c9e5a3b7d1f4
Create Date: 2026-10-27 10:20:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'd1a7f3c5e8b2'
down_revision = 'c9e5a3b7d1f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pos_scanner_sessions',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('created_by', sa.String(length=32), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('connected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('phone_user_id', sa.String(length=32), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seq', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organization_id', sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pos_scanner_sessions_organization_id'), 'pos_scanner_sessions', ['organization_id'], unique=False)
    op.create_table(
        'pos_scans',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('session_id', sa.String(length=32), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['pos_scanner_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'seq', name='uq_pos_scan_session_seq'),
    )


def downgrade() -> None:
    op.drop_table('pos_scans')
    op.drop_index(op.f('ix_pos_scanner_sessions_organization_id'), table_name='pos_scanner_sessions')
    op.drop_table('pos_scanner_sessions')
