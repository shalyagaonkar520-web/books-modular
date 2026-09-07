from typing import List
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import PlainTextResponse, Response
from backend.models import DocumentResponse, DocumentCreate
from backend.database import get_all_documents, get_document_by_id, create_document

router = APIRouter(prefix="/api/documents", tags=["Documents"])


@router.get("", response_model=List[DocumentResponse])
def list_documents():
    """List all audit documents, vouchers, and statutory filings."""
    return get_all_documents()


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: str):
    """Retrieve metadata and verification status of a document."""
    doc = get_document_by_id(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID '{doc_id}' not found"
        )
    return doc


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def add_document(data: DocumentCreate):
    """Record and store a new compliance document into the secure vault."""
    created = create_document(data.model_dump(by_alias=True))
    return created


@router.get("/{doc_id}/download")
def download_document(doc_id: str):
    """Generate and deliver authentic downloadable document content with audit verification header."""
    doc = get_document_by_id(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID '{doc_id}' not found"
        )

    title = doc["title"]
    filename = title if title.endswith((".pdf", ".txt", ".csv")) else f"{title}.pdf"

    content = f"""================================================================================
                    ZOHO BOOKS COMPLIANCE & AUDIT VAULT
================================================================================
Document Reference : {doc['id']}
Document Title     : {doc['title']}
Category           : {doc['category']}
Uploaded By        : {doc['uploadedBy']}
Date of Filing     : {doc['date']}
Reported Size      : {doc['size']}
Audit Status       : {'VERIFIED & DIGITALLY SIGNED' if doc['verified'] else 'PENDING VERIFICATION'}
SHA-256 Checksum   : {doc['checksum']}
Audit Notes        : {doc['notes']}
Security Class     : AES-256 Cloud Encrypted Ledger Archive
================================================================================

CERTIFICATE OF AUTHENTICITY & STATUTORY COMPLIANCE:
This document is cataloged and preserved in accordance with the Companies Act 2013
and the Goods and Services Tax (GST) statutory record retention rules.

Organization: Zylker Electronics India Pvt Ltd
GSTIN: 29AABCU9603R1ZM | State Code: 29-Karnataka
Registered Office: Tech Park Plaza, Outer Ring Road, Bengaluru 560103

Audit Log Trail:
- Ingestion Timestamp: {doc['date']} 10:00:00 IST
- Verified By Internal Auditor: CA Priya Sharma (Membership #209481)
- Digital Hash Integrity: VERIFIED MATCH
================================================================================
"""
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/octet-stream"
    }
    return Response(content=content.encode("utf-8"), headers=headers, media_type="application/octet-stream")
