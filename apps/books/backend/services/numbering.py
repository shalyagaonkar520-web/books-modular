"""Sequential document numbering per organization (INV-00001, BILL-00001 ...)."""
from __future__ import annotations

from sqlalchemy import select
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


def next_number(db: Session, organization_id: str, kind: str) -> str:
    prefix = PREFIXES[kind]
    stmt = select(DocumentSequence).where(
        DocumentSequence.organization_id == organization_id, DocumentSequence.kind == kind
    )
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        stmt = stmt.with_for_update()
    seq = db.execute(stmt).scalar_one_or_none()
    if seq is None:
        seq = DocumentSequence(organization_id=organization_id, kind=kind, prefix=prefix, next_number=1)
        db.add(seq)
        db.flush()
    number = seq.next_number
    seq.next_number = number + 1
    db.flush()
    return f"{seq.prefix}-{number:05d}"
