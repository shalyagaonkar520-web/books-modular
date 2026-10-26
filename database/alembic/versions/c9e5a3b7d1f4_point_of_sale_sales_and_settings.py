"""point of sale: sales and settings

Revision ID: c9e5a3b7d1f4
Revises: b8d4f2a6c9e3
Create Date: 2026-10-26 14:05:42.310552
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = 'c9e5a3b7d1f4'
down_revision = 'b8d4f2a6c9e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pos_sales',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('client_sale_id', sa.String(length=64), nullable=False),
        sa.Column('invoice_id', sa.String(length=32), nullable=False),
        sa.Column('payment_id', sa.String(length=32), nullable=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('mode', sa.String(length=20), nullable=False),
        sa.Column('total', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('tendered', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('change_due', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('returned_amount', sa.Numeric(precision=14, scale=2), server_default='0', nullable=False),
        sa.Column('cashier_id', sa.String(length=32), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('organization_id', sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(['payment_id'], ['customer_payments.id']),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'client_sale_id', name='uq_pos_sale_org_client'),
    )
    with op.batch_alter_table('pos_sales', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_pos_sales_date'), ['date'], unique=False)
        batch_op.create_index(batch_op.f('ix_pos_sales_organization_id'), ['organization_id'], unique=False)

    # Plain ADD COLUMN, not a batch: on SQLite a batch would copy the whole
    # organizations table, which fails on databases made by create_all.
    op.add_column('organizations', sa.Column('pos_bank_account_id', sa.String(length=32), nullable=True))
    op.add_column('organizations', sa.Column('pos_allow_negative_stock', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column('organizations', sa.Column('pos_receipt_header', sa.Text(), nullable=True))
    op.add_column('organizations', sa.Column('pos_receipt_footer', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('pos_receipt_footer')
        batch_op.drop_column('pos_receipt_header')
        batch_op.drop_column('pos_allow_negative_stock')
        batch_op.drop_column('pos_bank_account_id')

    with op.batch_alter_table('pos_sales', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_pos_sales_organization_id'))
        batch_op.drop_index(batch_op.f('ix_pos_sales_date'))

    op.drop_table('pos_sales')
