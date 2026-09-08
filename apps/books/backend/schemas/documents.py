from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from backend.schemas.common import APIModel


class DocumentOut(APIModel):
    id: str
    title: str
    category: str
    original_filename: str
    content_type: str
    size_bytes: int
    sha256: str
    notes: Optional[str] = None
    linked_entity_type: Optional[str] = None
    linked_entity_id: Optional[str] = None
    uploaded_by: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    created_at: datetime


class DocumentUpdate(APIModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=60)
    notes: Optional[str] = None
