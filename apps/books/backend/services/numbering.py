"""Sequential document numbering per organization (INV-00001, BILL-00001 ...)."""

from __future__ import annotations

from sqlalchemy import insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models import DocumentSequence

PREFIXES = {
    "invoice": "INV",
    "bill": "BILL",
    "customer_payment": "PAY",
    "vendor_payment": "VPAY",
    "expense": "EXP",
    "journal": "JRN",
    "inventory_adjustment": "ADJ",
    "employee": "EMP",
}


def _increment(db: Session, organization_id: str, kind: str) -> int:
    """Bump the counter in place and return how many rows matched (0 or 1).

    A single UPDATE ... SET next_number = next_number + 1 is atomic on both
    SQLite and PostgreSQL: it takes the write lock (SQLite) or the row lock
    (PostgreSQL) before reading the old value, so two concurrent callers can
    never observe the same number.
    """
    result = db.execute(
        update(DocumentSequence)
        .where(DocumentSequence.organization_id == organization_id, DocumentSequence.kind == kind)
        .values(next_number=DocumentSequence.next_number + 1)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount


def next_number(db: Session, organization_id: str, kind: str) -> str:
    prefix = PREFIXES[kind]
    if _increment(db, organization_id, kind) == 0:
        # First document of this kind for the org: create the counter row. A
        # concurrent request may create it at the same moment, so the insert
        # runs inside a SAVEPOINT and a unique-constraint clash just means the
        # row now exists - roll back to the savepoint and carry on.
        try:
            with db.begin_nested():
                db.execute(insert(DocumentSequence).values(organization_id=organization_id, kind=kind, prefix=prefix, next_number=1))
        except IntegrityError:
            pass
        _increment(db, organization_id, kind)
    # Read back within the same transaction, which still holds the lock the
    # UPDATE took, so this is the value this caller alone incremented to.
    seq_prefix, after = db.execute(
        select(DocumentSequence.prefix, DocumentSequence.next_number).where(
            DocumentSequence.organization_id == organization_id, DocumentSequence.kind == kind
        )
    ).one()
    return f"{seq_prefix}-{after - 1:05d}"
