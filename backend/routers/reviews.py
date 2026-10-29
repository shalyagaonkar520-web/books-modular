"""Reviews: a reviewer checks each change by the people they review.

For every change ("Sam added invoice INV-12 - is it correct?") the reviewer
can Approve it, put it On hold, or Send a message to the person who made it.
That person sees the message (and holds) on their Support page and replies;
a reply sends the change back to the reviewer's "To check" list. Reviewers
see the users and roles they are connected to; admins see everyone's.
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

# reviewed = approved, flagged = message sent to the maker
STATUSES = ("waiting", "hold", "flagged", "reviewed", "all")


class ReviewIn(APIModel):
    # reviewed (approve) | hold | flagged (send a message) | waiting (undo)
    status: str = Field(pattern="^(reviewed|hold|flagged|waiting)$")
    note: Optional[str] = Field(default=None, max_length=1000)


class BulkReviewIn(ReviewIn):
    ids: List[str] = Field(min_length=1, max_length=200)


class ReplyIn(APIModel):
    message: str = Field(min_length=1, max_length=2000)


class ReviewSummary(APIModel):
    waiting: int
    hold: int
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
    if wanted in ("reviewed", "hold", "flagged"):
        return stmt.where(ChangeLog.review_status == wanted)
    return stmt


@router.get("/holds")
def record_holds(entity_type: str = Query(..., max_length=60), user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    """Which records of this kind a reviewer put on hold or sent a message about: {id: {status, note, by}}."""
    return reviews.holds(db, user.organization_id, entity_type)


@router.get("/summary", response_model=ReviewSummary)
def summary(user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    _reviewer(user)
    base = _scoped(db, user).subquery()

    def count(cond) -> int:
        return db.scalar(select(func.count()).select_from(base).where(cond)) or 0

    return ReviewSummary(
        waiting=count(base.c.review_status.is_(None)),
        hold=count(base.c.review_status == "hold"),
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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Write the message for the person who made the change.")
    now = datetime.now(UTC)
    for row in rows:
        if payload.status == "waiting":
            row.review_status = row.reviewed_by_id = row.reviewed_by_name = row.reviewed_at = row.review_note = None
        else:
            row.review_status = payload.status
            row.reviewed_by_id = user.id
            row.reviewed_by_name = user.name
            row.reviewed_at = now
            note = (payload.note or "").strip()
            if note or payload.status == "flagged":
                row.review_note = note or None
            if payload.status == "flagged":
                # A new question: the earlier answer no longer applies.
                row.review_reply = row.review_reply_at = None


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


def _mine(user: User):
    return select(ChangeLog).where(
        ChangeLog.organization_id == user.organization_id, ChangeLog.user_id == user.id, ChangeLog.review_status.in_(("flagged", "hold"))
    )


@router.get("/mine", response_model=Page[ChangeLogOut])
def my_flags(pagination: Pagination = Depends(), user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    """My own changes a reviewer sent me a message about, or put on hold, newest first."""
    return change_page(db, _mine(user), pagination)


@router.post("/mine/{change_id}/reply", response_model=ChangeLogOut)
def reply_to_reviewer(change_id: str, payload: ReplyIn, user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    """Answer the reviewer; the change goes back to their "To check" list."""
    row = db.execute(_mine(user).where(ChangeLog.id == change_id)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change not found")
    row.review_reply = payload.message.strip()
    row.review_reply_at = datetime.now(UTC)
    row.review_status = None
    audit.record(db, user, "review", row.entity_type, row.entity_id, f"Answered the reviewer about {row.entity_label or row.entity_type}")
    db.commit()
    return change_out(row)
