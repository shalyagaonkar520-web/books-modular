"""Document vault: authenticated file uploads stored on disk with integrity hashes."""
from __future__ import annotations

import hashlib
import os
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import Document, User
from backend.schemas.common import Message, Page
from backend.schemas.documents import DocumentOut, DocumentUpdate
from backend.services import audit
from backend.services.tenancy import Pagination, get_or_404, paginate

settings = get_settings()
router = APIRouter(prefix="/api/documents", tags=["Documents"])

ALLOWED_TYPES = {
    "application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv", "text/plain",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
CATEGORIES = {"general", "invoice", "bill", "receipt", "contract", "tax", "bank_statement", "payroll", "other"}


def to_out(doc: Document) -> DocumentOut:
    data = DocumentOut.model_validate(doc)
    data.uploaded_by_name = doc.uploader.name if doc.uploader else None
    return data


def _safe_name(name: str) -> str:
    base = os.path.basename(name or "file")
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120] or "file"


@router.get("", response_model=Page[DocumentOut])
def list_documents(
    category: Optional[str] = None,
    search: Optional[str] = None,
    linked_entity_type: Optional[str] = None,
    linked_entity_id: Optional[str] = None,
    pagination: Pagination = Depends(),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Document).where(Document.organization_id == user.organization_id).options(selectinload(Document.uploader))
    if category:
        stmt = stmt.where(Document.category == category)
    if linked_entity_type:
        stmt = stmt.where(Document.linked_entity_type == linked_entity_type)
    if linked_entity_id:
        stmt = stmt.where(Document.linked_entity_id == linked_entity_id)
    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        stmt = stmt.where(func.lower(Document.title).like(q) | func.lower(Document.original_filename).like(q) | func.lower(Document.notes).like(q))
    stmt = stmt.order_by(Document.created_at.desc())
    rows, total = paginate(db, stmt, pagination)
    return Page(items=[to_out(d) for d in rows], total=total, page=pagination.page, page_size=pagination.page_size)


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: str = Form("general"),
    notes: Optional[str] = Form(None),
    linked_entity_type: Optional[str] = Form(None),
    linked_entity_id: Optional[str] = Form(None),
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    if category not in CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Category must be one of: {', '.join(sorted(CATEGORIES))}")
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File type '{content_type}' is not allowed")

    limit = settings.max_upload_size_mb * 1024 * 1024
    org_dir = os.path.join(settings.upload_dir, user.organization_id)
    os.makedirs(org_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{_safe_name(file.filename or 'file')}"
    stored_path = os.path.join(org_dir, stored_name)

    digest = hashlib.sha256()
    size = 0
    with open(stored_path, "wb") as fh:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                fh.close()
                os.remove(stored_path)
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"File exceeds the {settings.max_upload_size_mb} MB limit")
            digest.update(chunk)
            fh.write(chunk)
    if size == 0:
        os.remove(stored_path)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty")

    doc = Document(
        organization_id=user.organization_id, title=(title or file.filename or "Document")[:255], category=category,
        original_filename=(file.filename or "file")[:255], stored_path=stored_path, content_type=content_type, size_bytes=size,
        sha256=digest.hexdigest(), notes=notes, linked_entity_type=linked_entity_type, linked_entity_id=linked_entity_id, uploaded_by=user.id,
    )
    db.add(doc)
    db.flush()
    audit.record(db, user, "create", "document", doc.id, f"Uploaded {doc.original_filename} ({size} bytes)")
    db.commit()
    db.refresh(doc)
    return to_out(doc)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return to_out(get_or_404(db, Document, document_id, user.organization_id, "Document"))


@router.get("/{document_id}/download")
def download_document(document_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = get_or_404(db, Document, document_id, user.organization_id, "Document")
    if not os.path.exists(doc.stored_path):
        raise HTTPException(status.HTTP_410_GONE, "Stored file is missing")
    return FileResponse(doc.stored_path, media_type=doc.content_type, filename=doc.original_filename)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(document_id: str, payload: DocumentUpdate, user: User = Depends(require_write), db: Session = Depends(get_db)):
    doc = get_or_404(db, Document, document_id, user.organization_id, "Document")
    data = payload.model_dump(exclude_unset=True)
    if "category" in data and data["category"] not in CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid category")
    for field, value in data.items():
        setattr(doc, field, value)
    db.commit()
    db.refresh(doc)
    return to_out(doc)


@router.delete("/{document_id}", response_model=Message)
def delete_document(document_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    doc = get_or_404(db, Document, document_id, user.organization_id, "Document")
    path = doc.stored_path
    name = doc.original_filename
    db.delete(doc)
    audit.record(db, user, "delete", "document", document_id, f"Deleted {name}")
    db.commit()
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:  # pragma: no cover
        pass
    return Message(message="Document deleted")
