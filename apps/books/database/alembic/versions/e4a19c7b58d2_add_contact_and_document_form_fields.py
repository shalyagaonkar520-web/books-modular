"""add the contact, invoice and bill fields the entry forms were missing

Brings the forms in line with what an Indian books package is expected to
capture:

- contacts gain a business/individual flag, the primary contact entered in
  parts (salutation, first and last name), a separate mobile number, the
  vendor's bank details so a payment run does not need them re-keyed, a
  language, and an optional ledger account that overrides the org-wide
  receivables/payables account for that contact;
- invoices gain the customer's order number, a subject line and a salesperson;
- bills gain an order number and a subject line.

Everything added is nullable, or has a server default, so existing rows stay
valid without a backfill. contact_type defaults to 'business', which is what
every row created before this migration effectively was.

Revision ID: e4a19c7b58d2
Revises: c3f8a5b21d47
Create Date: 2026-09-16
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "e4a19c7b58d2"
down_revision = "c3f8a5b21d47"
branch_labels = None
depends_on = None

_CONTACT_COLUMNS = (
    ("contact_type", sa.String(length=12), "business"),
    ("salutation", sa.String(length=10), None),
    ("first_name", sa.String(length=60), None),
    ("last_name", sa.String(length=60), None),
    ("mobile", sa.String(length=40), None),
    ("bank_account_holder", sa.String(length=120), None),
    ("bank_name", sa.String(length=120), None),
    ("bank_account_number", sa.String(length=40), None),
    ("bank_ifsc", sa.String(length=20), None),
    ("language", sa.String(length=40), None),
)

_INVOICE_COLUMNS = (
    ("order_number", sa.String(length=120)),
    ("subject", sa.String(length=250)),
    ("salesperson", sa.String(length=120)),
)

_BILL_COLUMNS = (
    ("order_number", sa.String(length=120)),
    ("subject", sa.String(length=250)),
)


def upgrade() -> None:
    with op.batch_alter_table("contacts", schema=None) as batch_op:
        for name, type_, default in _CONTACT_COLUMNS:
            batch_op.add_column(sa.Column(name, type_, nullable=True, server_default=default))
        # Carries its own foreign key, so it is added with the constraint named
        # rather than through the plain loop above.
        batch_op.add_column(sa.Column("ledger_account_id", sa.String(length=32), nullable=True))
        batch_op.create_foreign_key("fk_contacts_ledger_account_id_accounts", "accounts", ["ledger_account_id"], ["id"])

    # contact_type is not nullable on the model, so fill the rows that existed
    # before this ran and then tighten it.
    op.execute("UPDATE contacts SET contact_type = 'business' WHERE contact_type IS NULL")
    with op.batch_alter_table("contacts", schema=None) as batch_op:
        batch_op.alter_column("contact_type", existing_type=sa.String(length=12), nullable=False)

    with op.batch_alter_table("invoices", schema=None) as batch_op:
        for name, type_ in _INVOICE_COLUMNS:
            batch_op.add_column(sa.Column(name, type_, nullable=True))

    with op.batch_alter_table("bills", schema=None) as batch_op:
        for name, type_ in _BILL_COLUMNS:
            batch_op.add_column(sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("bills", schema=None) as batch_op:
        for name, _ in _BILL_COLUMNS:
            batch_op.drop_column(name)

    with op.batch_alter_table("invoices", schema=None) as batch_op:
        for name, _ in _INVOICE_COLUMNS:
            batch_op.drop_column(name)

    with op.batch_alter_table("contacts", schema=None) as batch_op:
        batch_op.drop_constraint("fk_contacts_ledger_account_id_accounts", type_="foreignkey")
        batch_op.drop_column("ledger_account_id")
        for name, _, _default in _CONTACT_COLUMNS:
            batch_op.drop_column(name)
