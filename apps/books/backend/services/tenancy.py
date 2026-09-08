"""Helpers for organization-scoped lookups and pagination."""
from __future__ import annotations

from typing import Optional, Sequence, Tuple, Type, TypeVar

from fastapi import HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

T = TypeVar("T")


def get_or_404(db: Session, model: Type[T], entity_id: str, organization_id: str, label: str = "Record") -> T:
    obj = db.get(model, entity_id)
    if obj is None or getattr(obj, "organization_id", None) != organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} not found")
    return obj


def get_optional(db: Session, model: Type[T], entity_id: Optional[str], organization_id: str, label: str) -> Optional[T]:
    if not entity_id:
        return None
    return get_or_404(db, model, entity_id, organization_id, label)


class Pagination:
    def __init__(
        self,
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=200),
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def paginate(db: Session, stmt, pagination: Pagination) -> Tuple[Sequence, int]:
    total = db.execute(select(func.count()).select_from(stmt.order_by(None).subquery())).scalar_one()
    rows = db.execute(stmt.offset(pagination.offset).limit(pagination.page_size)).scalars().all()
    return rows, total


def mask_number(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    digits = value.strip()
    if len(digits) <= 4:
        return "*" * len(digits)
    return "*" * (len(digits) - 4) + digits[-4:]
