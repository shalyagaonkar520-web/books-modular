"""gst billing extras: bill of supply and delivery challans

An invoice can be titled Bill of Supply (document_type), and delivery
challans are a new document that posts nothing until it is invoiced.

Revision ID: 9f9d806e8710
Revises: a4d8e2f6c0b9
Create Date: 2026-10-29 11:30:41.610695
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = '9f9d806e8710'
down_revision = 'a4d8e2f6c0b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('delivery_challans',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('challan_number', sa.String(length=30), nullable=False),
    sa.Column('customer_id', sa.String(length=32), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('reason', sa.String(length=120), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('invoice_id', sa.String(length=32), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('organization_id', sa.String(length=32), nullable=False),
    sa.Column('subtotal', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('discount_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('tax_total', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('total', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('reference', sa.String(length=120), nullable=True),
    sa.Column('subject', sa.String(length=250), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('terms', sa.Text(), nullable=True),
    sa.Column('created_by', sa.String(length=32), nullable=True),
    sa.ForeignKeyConstraint(['customer_id'], ['contacts.id'], ),
    sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('organization_id', 'challan_number', name='uq_delivery_challan_org_number')
    )
    with op.batch_alter_table('delivery_challans', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_delivery_challans_customer_id'), ['customer_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_delivery_challans_date'), ['date'], unique=False)
        batch_op.create_index(batch_op.f('ix_delivery_challans_organization_id'), ['organization_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_delivery_challans_status'), ['status'], unique=False)

    op.create_table('delivery_challan_lines',
    sa.Column('delivery_challan_id', sa.String(length=32), nullable=False),
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=14, scale=3), nullable=False),
    sa.Column('rate', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('tax_rate', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('tax_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('serial_numbers', sa.Text(), nullable=True),
    sa.Column('item_id', sa.String(length=32), nullable=True),
    sa.Column('account_id', sa.String(length=32), nullable=True),
    sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
    sa.ForeignKeyConstraint(['delivery_challan_id'], ['delivery_challans.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['item_id'], ['items.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('delivery_challan_lines', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_delivery_challan_lines_delivery_challan_id'), ['delivery_challan_id'], unique=False)

    # Plain ADD COLUMN (nullable), no table copy on SQLite.
    op.add_column('invoices', sa.Column('document_type', sa.String(length=20), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_column('document_type')

    with op.batch_alter_table('delivery_challan_lines', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_delivery_challan_lines_delivery_challan_id'))

    op.drop_table('delivery_challan_lines')
    with op.batch_alter_table('delivery_challans', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_delivery_challans_status'))
        batch_op.drop_index(batch_op.f('ix_delivery_challans_organization_id'))
        batch_op.drop_index(batch_op.f('ix_delivery_challans_date'))
        batch_op.drop_index(batch_op.f('ix_delivery_challans_customer_id'))

    op.drop_table('delivery_challans')
