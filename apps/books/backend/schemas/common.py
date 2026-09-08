"""Shared pydantic configuration and helpers."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, field_serializer
from pydantic.alias_generators import to_camel

T = TypeVar("T")


class APIModel(BaseModel):
    """Base model: camelCase JSON, ORM friendly, decimals rendered as JSON numbers."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
    )

    @field_serializer("*", when_used="json")
    def _serialize_decimals(self, value):
        """Emit money/quantity values as JSON numbers rather than strings."""
        if isinstance(value, Decimal):
            return float(value)
        return value


class Page(APIModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


class Message(APIModel):
    message: str


class IdName(APIModel):
    id: str
    name: str


def as_float(value: Optional[Decimal]) -> float:
    return float(value) if value is not None else 0.0


__all__ = ["APIModel", "Page", "Message", "IdName", "as_float", "date", "datetime", "field_serializer"]
