"""Approval of large invoices and bills before they go into the books.

An admin sets a threshold per document type. Issuing an invoice (or opening a
bill) at or above it then needs an approval: an admin issuing it approves it
in the same step; anyone else submits it, and an admin approves or rejects
it. An approval covers the amount approved, so raising the total afterwards
needs a fresh one.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models import Organization, User
from backend.services import audit
from backend.services.money import money


def threshold(db: Session, org_id: str, kind: str) -> Optional[Decimal]:
    org = db.get(Organization, org_id)
    return org.invoice_approval_threshold if kind == "invoice" else org.bill_approval_threshold


def _number(doc, kind: str) -> str:
    return doc.invoice_number if kind == "invoice" else doc.bill_number


def needs_approval(db: Session, doc, kind: str) -> bool:
    limit = threshold(db, doc.organization_id, kind)
    if limit is None or money(doc.total) < money(limit):
        return False
    return not (doc.approval_status == "approved" and doc.approved_total is not None and money(doc.total) <= money(doc.approved_total))


def ensure_approved(db: Session, doc, kind: str, user: User) -> None:
    """Called whenever the document is about to be posted to the books."""
    if not needs_approval(db, doc, kind):
        return
    if user.role == "admin":
        _approve(doc, user)
        return
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        f"{kind.capitalize()} {_number(doc, kind)} is over the approval limit of {threshold(db, doc.organization_id, kind)}; submit it for approval first",
    )


def _approve(doc, user: User) -> None:
    doc.approval_status = "approved"
    doc.approved_by = user.id
    doc.approved_at = datetime.now(UTC)
    doc.approved_total = money(doc.total)


def submit(db: Session, doc, kind: str, user: User) -> None:
    if doc.status != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only drafts are sent for approval")
    if not needs_approval(db, doc, kind):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This document does not need approval")
    doc.approval_status = "pending"
    doc.approval_requested_at = datetime.now(UTC)
    doc.approval_note = None
    audit.record(db, user, "update", kind, doc.id, f"{kind.capitalize()} {_number(doc, kind)} sent for approval ({doc.total})")


def approve(db: Session, doc, kind: str, user: User, note: Optional[str]) -> None:
    if doc.status != "draft":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only drafts are approved")
    _approve(doc, user)
    doc.approval_note = note
    audit.record(
        db,
        user,
        "update",
        kind,
        doc.id,
        f"{kind.capitalize()} {_number(doc, kind)} approved for {doc.total}" + (f": {note}" if note else ""),
    )


def reject(db: Session, doc, kind: str, user: User, note: Optional[str]) -> None:
    if doc.approval_status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only documents waiting for approval can be rejected")
    doc.approval_status = "rejected"
    doc.approval_note = note
    audit.record(db, user, "update", kind, doc.id, f"{kind.capitalize()} {_number(doc, kind)} rejected" + (f": {note}" if note else ""))
