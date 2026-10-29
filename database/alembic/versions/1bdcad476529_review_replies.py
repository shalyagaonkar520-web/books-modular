"""review replies

Revision ID: 1bdcad476529
Revises: c729f56a9c5b
Create Date: 2026-10-29 21:59:40.348903
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '1bdcad476529'
down_revision = 'c729f56a9c5b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('change_logs', sa.Column('review_reply', sa.Text(), nullable=True))
    op.add_column('change_logs', sa.Column('review_reply_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('change_logs', schema=None) as batch_op:
        batch_op.drop_column('review_reply_at')
        batch_op.drop_column('review_reply')
