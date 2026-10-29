"""plans by users, plan end and support requests

Organizations get plan_key / max_users / plan_ends_at (services/plans), and
support_tickets + support_messages hold requests to the platform and their chat.

Revision ID: 156a0ad64bee
Revises: afa09bd6b861
Create Date: 2026-10-29 16:18:47.468356
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '156a0ad64bee'
down_revision = 'afa09bd6b861'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('support_tickets',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('subject', sa.String(length=200), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('status', sa.String(length=10), nullable=False),
    sa.Column('created_by_name', sa.String(length=120), nullable=False),
    sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_message_by', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('organization_id', sa.String(length=32), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('support_tickets', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_support_tickets_organization_id'), ['organization_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_support_tickets_status'), ['status'], unique=False)

    op.create_table('support_messages',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('ticket_id', sa.String(length=32), nullable=False),
    sa.Column('author_kind', sa.String(length=10), nullable=False),
    sa.Column('author_name', sa.String(length=120), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['ticket_id'], ['support_tickets.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('support_messages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_support_messages_ticket_id'), ['ticket_id'], unique=False)

    # Plain ADD COLUMN, no table copy on SQLite.
    op.add_column('organizations', sa.Column('plan_key', sa.String(length=20), nullable=True))
    op.add_column('organizations', sa.Column('max_users', sa.Integer(), nullable=True))
    op.add_column('organizations', sa.Column('plan_ends_at', sa.DateTime(timezone=True), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('plan_ends_at')
        batch_op.drop_column('max_users')
        batch_op.drop_column('plan_key')

    with op.batch_alter_table('support_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_support_messages_ticket_id'))

    op.drop_table('support_messages')
    with op.batch_alter_table('support_tickets', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_support_tickets_status'))
        batch_op.drop_index(batch_op.f('ix_support_tickets_organization_id'))

    op.drop_table('support_tickets')
