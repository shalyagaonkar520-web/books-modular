"""custom roles: org_roles and users.custom_role_id

An organization admin defines roles with No access / View / Edit per feature
(services/permissions); a user on one has role "custom" and custom_role_id.

Revision ID: afa09bd6b861
Revises: 9f9d806e8710
Create Date: 2026-10-29 15:18:27.127383
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'afa09bd6b861'
down_revision = '9f9d806e8710'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('org_roles',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('description', sa.String(length=250), nullable=True),
    sa.Column('permissions', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('organization_id', sa.String(length=32), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id', 'name', name='uq_org_role_org_name')
    )
    with op.batch_alter_table('org_roles', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_org_roles_organization_id'), ['organization_id'], unique=False)

    # Plain ADD COLUMN, no table copy on SQLite (where the foreign key is left out).
    op.add_column('users', sa.Column('custom_role_id', sa.String(length=32), nullable=True))
    if op.get_bind().dialect.name != 'sqlite':
        op.create_foreign_key('fk_users_custom_role_id', 'users', 'org_roles', ['custom_role_id'], ['id'])



def downgrade() -> None:
    if op.get_bind().dialect.name != 'sqlite':
        op.drop_constraint('fk_users_custom_role_id', 'users', type_='foreignkey')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('custom_role_id')

    with op.batch_alter_table('org_roles', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_org_roles_organization_id'))

    op.drop_table('org_roles')
