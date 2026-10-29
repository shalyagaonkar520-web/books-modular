"""Reviews: a reviewer's list of changes to check, and the flags on one's own work.

Reviewers see the changes of the users and roles they are connected to;
admins see and can review every change. Anyone signed in sees the changes of
their own that a reviewer flagged.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import require_subscription
from backend.models import ChangeLog, User
from backend.routers.admin_console import ChangeLogOut, change_out, change_page, filter_changes
from backend.schemas.common import APIModel, Page
from backend.services import audit, reviews
from backend.services.tenancy import Pagination

router = APIRouter(prefix="/api/reviews", tags=["Reviews"])

STATUSES = ("waiting", "reviewed", "flagged", "all")


class ReviewIn(APIModel):
    # reviewed | flagged | waiting (undo)
    status: str = Field(pattern="^(reviewed|flagged|waiting)$")
    note: Optional[str] = Field(default=None, max_length=1000)


class BulkReviewIn(ReviewIn):
    ids: List[str] = Field(min_length=1, max_length=200)


class ReviewSummary(APIModel):
    waiting: int
    flagged: int
    reviewed: int
    # Whose work: readable names of the scope ("Everyone" for an admin).
    scope: List[str]


def _reviewer(user: User) -> User:
    if user.role not in ("reviewer", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only reviewers and admins review changes.")
    return user


def _scoped(db: Session, user: User):
    stmt = select(ChangeLog).where(ChangeLog.organization_id == user.organization_id)
    if user.role == "admin":
        # Admins review everyone's work except their own.
        return stmt.where((ChangeLog.user_id.is_(None)) | (ChangeLog.user_id != user.id))
    ids = reviews.users_in_scope(db, user.organization_id, user.review_targets, exclude=user.id)
    return stmt.where(ChangeLog.user_id.in_(ids or {"-"}))


def _with_status(stmt, wanted: str):
    if wanted == "waiting":
        return stmt.where(ChangeLog.review_status.is_(None))
    if wanted in ("reviewed", "flagged"):
        return stmt.where(ChangeLog.review_status == wanted)
    return stmt


@router.get("/summary", response_model=ReviewSummary)
def summary(user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    _reviewer(user)
    base = _scoped(db, user).subquery()

    def count(cond) -> int:
        return db.scalar(select(func.count()).select_from(base).where(cond)) or 0

    return ReviewSummary(
        waiting=count(base.c.review_status.is_(None)),
        flagged=count(base.c.review_status == "flagged"),
        reviewed=count(base.c.review_status == "reviewed"),
        scope=["Everyone"] if user.role == "admin" else reviews.describe(db, user.review_targets),
    )


@router.get("", response_model=Page[ChangeLogOut])
def list_reviews(
    review_status: str = Query("waiting", alias="status"),
    user_id: Optional[str] = Query(None, max_length=32),
    entity_type: Optional[str] = Query(None, max_length=60),
    search: Optional[str] = Query(None, max_length=100),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(require_subscription),
    db: Session = Depends(get_db),
):
    _reviewer(user)
    stmt = _with_status(_scoped(db, user), review_status if review_status in STATUSES else "waiting")
    return change_page(db, filter_changes(stmt, user_id, entity_type, None, search, date_from, date_to), pagination)


def _mark(db: Session, user: User, rows: List[ChangeLog], payload: ReviewIn) -> None:
    if payload.status == "flagged" and not (payload.note or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Say what is wrong: a flag needs a note for the person who made the change.")
    now = datetime.now(UTC)
    for row in rows:
        if payload.status == "waiting":
            row.review_status = row.reviewed_by_id = row.reviewed_by_name = row.reviewed_at = row.review_note = None
        else:
            row.review_status = payload.status
            row.reviewed_by_id = user.id
            row.reviewed_by_name = user.name
            row.reviewed_at = now
            row.review_note = (payload.note or "").strip() or None


@router.post("/bulk", response_model=List[ChangeLogOut])
def review_many(payload: BulkReviewIn, user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    _reviewer(user)
    rows = db.execute(_scoped(db, user).where(ChangeLog.id.in_(payload.ids))).scalars().all()
    if len(rows) != len(set(payload.ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Some of these changes are not yours to review.")
    _mark(db, user, rows, payload)
    audit.record(db, user, "review", "change", None, f"Marked {len(rows)} change(s) {payload.status}")
    db.commit()
    return [change_out(r) for r in rows]


@router.post("/{change_id}", response_model=ChangeLogOut)
def review_one(change_id: str, payload: ReviewIn, user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    _reviewer(user)
    row = db.execute(_scoped(db, user).where(ChangeLog.id == change_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change not found")
    _mark(db, user, [row], payload)
    label = row.entity_label or row.entity_type
    audit.record(db, user, "review", row.entity_type, row.entity_id, f"Marked a change to {label} {payload.status}")
    db.commit()
    return change_out(row)


@router.get("/mine", response_model=Page[ChangeLogOut])
def my_flags(pagination: Pagination = Depends(), user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    """My own changes a reviewer flagged, newest first."""
    stmt = select(ChangeLog).where(
        ChangeLog.organization_id == user.organization_id, ChangeLog.user_id == user.id, ChangeLog.review_status == "flagged"
    )
    return change_page(db, stmt, pagination)
