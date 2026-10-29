"""custom plan features

A custom plan names the features (services/permissions keys) the organization
may use; organizations.plan_features holds them (NULL = every feature).

Revision ID: e82c2bfa58af
Revises: 156a0ad64bee
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'e82c2bfa58af'
down_revision = '156a0ad64bee'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Plain ADD COLUMN, no table copy on SQLite.
    op.add_column('organizations', sa.Column('plan_features', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('plan_features')
