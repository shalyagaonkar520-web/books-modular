"""change log, login history, reviewers and support by user

Revision ID: c729f56a9c5b
Revises: e82c2bfa58af
Create Date: 2026-10-29 19:17:16.592411
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'c729f56a9c5b'
down_revision = 'e82c2bfa58af'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('change_logs',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('organization_id', sa.String(length=32), nullable=False),
    sa.Column('user_id', sa.String(length=32), nullable=True),
    sa.Column('user_name', sa.String(length=160), nullable=True),
    sa.Column('user_role', sa.String(length=20), nullable=True),
    sa.Column('action', sa.String(length=10), nullable=False),
    sa.Column('entity_type', sa.String(length=60), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('entity_label', sa.String(length=200), nullable=True),
    sa.Column('changes', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('review_status', sa.String(length=10), nullable=True),
    sa.Column('reviewed_by_id', sa.String(length=32), nullable=True),
    sa.Column('reviewed_by_name', sa.String(length=120), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('review_note', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    for col in ('created_at', 'entity_id', 'entity_type', 'organization_id', 'review_status', 'user_id'):
        op.create_index(f'ix_change_logs_{col}', 'change_logs', [col], unique=False)

    op.create_table('login_events',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('organization_id', sa.String(length=32), nullable=True),
    sa.Column('user_id', sa.String(length=32), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('success', sa.Boolean(), nullable=False),
    sa.Column('reason', sa.String(length=120), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    for col in ('created_at', 'organization_id', 'user_id'):
        op.create_index(f'ix_login_events_{col}', 'login_events', [col], unique=False)

    op.add_column('support_tickets', sa.Column('created_by_user_id', sa.String(length=32), nullable=True))
    op.add_column('support_tickets', sa.Column('created_by_email', sa.String(length=255), nullable=True))
    op.create_index('ix_support_tickets_created_by_user_id', 'support_tickets', ['created_by_user_id'], unique=False)

    op.add_column('users', sa.Column('review_scope', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('sessions_revoked_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('sessions_revoked_at')
        batch_op.drop_column('review_scope')

    op.drop_index('ix_support_tickets_created_by_user_id', table_name='support_tickets')
    with op.batch_alter_table('support_tickets', schema=None) as batch_op:
        batch_op.drop_column('created_by_email')
        batch_op.drop_column('created_by_user_id')

    op.drop_table('login_events')
    op.drop_table('change_logs')
