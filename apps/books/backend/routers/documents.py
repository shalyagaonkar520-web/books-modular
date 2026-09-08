import csv
import hashlib
import io
import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

import openpyxl
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_write
from backend.models import (
    Account,
    BankAccount,
    Bill,
    BillLine,
    Contact,
    Document,
    Expense,
    Invoice,
    InvoiceLine,
    User,
)
from backend.schemas.common import Message, Page
from backend.schemas.documents import DocumentOut, DocumentUpdate
from backend.services import audit, numbering
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


# ---------------------------------------------------------------------------
# Excel / CSV Auto-Categorization & Data Input Engine
# ---------------------------------------------------------------------------
class ExcelCategorizeSection(BaseModel):
    category: str
    sheet_name: str
    headers: List[str]
    count: int
    rows: List[Dict[str, Any]]


class ExcelCategorizeResponse(BaseModel):
    filename: str
    total_sheets: int
    total_rows: int
    sections: List[ExcelCategorizeSection]


class ExcelCommitItem(BaseModel):
    category: str
    data: Dict[str, Any]


class ExcelCommitPayload(BaseModel):
    items: List[ExcelCommitItem]


class ExcelCommitResponse(BaseModel):
    success: bool
    imported_counts: Dict[str, int]
    message: str


def _cell_to_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, (datetime, date)):
        return val.strftime("%Y-%m-%d")
    return str(val).strip()


def _categorize_table(headers: List[str], sheet_name: str) -> str:
    s_lower = sheet_name.lower()
    h_lower = " ".join(headers).lower()

    if "invoice" in s_lower or "sale" in s_lower:
        return "invoices"
    if "bill" in s_lower or "purchase" in s_lower:
        return "bills"
    if "expense" in s_lower or "cost" in s_lower or "spending" in s_lower:
        return "expenses"
    if "customer" in s_lower or "client" in s_lower:
        return "customers"
    if "vendor" in s_lower or "supplier" in s_lower:
        return "vendors"

    if "invoice" in h_lower or "inv_no" in h_lower or ("customer" in h_lower and ("rate" in h_lower or "total" in h_lower or "due_date" in h_lower or "invoice_number" in h_lower)):
        return "invoices"
    if "bill" in h_lower or "bill_number" in h_lower or ("vendor" in h_lower and ("amount" in h_lower or "due_date" in h_lower or "rate" in h_lower)):
        return "bills"
    if "expense" in h_lower or "payee" in h_lower or ("category" in h_lower and "amount" in h_lower):
        return "expenses"
    if "customer" in h_lower or ("email" in h_lower and ("gstin" in h_lower or "pan" in h_lower or "company" in h_lower or "display_name" in h_lower)):
        return "customers"
    if "vendor" in h_lower or "supplier" in h_lower:
        return "vendors"

    return "customers"


def _normalize_row(row_dict: Dict[str, str], category: str) -> Dict[str, Any]:
    res: Dict[str, Any] = {}
    for k, v in row_dict.items():
        k_clean = re.sub(r"[^a-zA-Z0-9]+", "_", k).strip("_").lower()
        res[k_clean] = v

    for k, v in list(res.items()):
        if any(x in k for x in ["name", "customer", "vendor", "party", "client"]) and "display_name" not in res:
            res["display_name"] = str(v)
        if "mail" in k and "email" not in res:
            res["email"] = str(v)
        if any(x in k for x in ["phone", "mobile", "contact"]) and "phone" not in res:
            res["phone"] = str(v)
        if "gst" in k and "gstin" not in res:
            res["gstin"] = str(v)
        if "pan" in k and "pan" not in res:
            res["pan"] = str(v)
        if any(x in k for x in ["amount", "total", "rate", "subtotal", "cost", "price"]) and "amount" not in res:
            try:
                val_str = re.sub(r"[^\d.]", "", str(v))
                if val_str:
                    res["amount"] = float(val_str)
            except Exception:
                pass
        if any(x in k for x in ["date", "due_date"]) and "date" not in res:
            res["date"] = str(v)
        if any(x in k for x in ["desc", "note", "item", "service", "particular", "category"]) and "description" not in res:
            res["description"] = str(v)

    return res


@router.post("/import-excel-categorize", response_model=ExcelCategorizeResponse)
async def import_excel_categorize(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Upload Excel/CSV file, automatically inspect sheets/headers, extract rows and categorize into Rooman Books modules."""
    filename = file.filename or "import.xlsx"
    contents = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    sections: List[ExcelCategorizeSection] = []
    total_rows = 0

    if filename.lower().endswith(".csv") or filename.lower().endswith(".txt"):
        try:
            text = contents.decode("utf-8")
        except UnicodeDecodeError:
            text = contents.decode("latin-1", errors="ignore")
        reader = csv.reader(io.StringIO(text))
        raw_rows = [[col.strip() for col in row] for row in reader if any(c.strip() for c in row)]
        if len(raw_rows) >= 2:
            headers = raw_rows[0]
            category = _categorize_table(headers, "Sheet1")
            items = []
            for r in raw_rows[1:]:
                row_dict = {headers[i] if i < len(headers) else f"col_{i}": (r[i] if i < len(r) else "") for i in range(len(r))}
                items.append(_normalize_row(row_dict, category))
            total_rows += len(items)
            sections.append(
                ExcelCategorizeSection(
                    category=category,
                    sheet_name="CSV Data",
                    headers=headers,
                    count=len(items),
                    rows=items,
                )
            )
    else:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                raw_rows = []
                for row_vals in ws.iter_rows(values_only=True):
                    if any(row_vals):
                        raw_rows.append([_cell_to_str(c) for c in row_vals])
                if len(raw_rows) >= 2:
                    headers = [h for h in raw_rows[0] if h]
                    if not headers:
                        continue
                    category = _categorize_table(headers, sheet_name)
                    items = []
                    for r in raw_rows[1:]:
                        row_dict = {headers[i] if i < len(headers) else f"col_{i}": (r[i] if i < len(r) else "") for i in range(len(r))}
                        items.append(_normalize_row(row_dict, category))
                    total_rows += len(items)
                    sections.append(
                        ExcelCategorizeSection(
                            category=category,
                            sheet_name=sheet_name,
                            headers=headers,
                            count=len(items),
                            rows=items,
                        )
                    )
        except Exception as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Failed to parse Excel workbook: {str(e)}")

    if not sections:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No readable tabular rows found in uploaded file")

    return ExcelCategorizeResponse(
        filename=filename,
        total_sheets=len(sections),
        total_rows=total_rows,
        sections=sections,
    )


@router.post("/import-excel-commit", response_model=ExcelCommitResponse)
def import_excel_commit(
    payload: ExcelCommitPayload,
    user: User = Depends(require_write),
    db: Session = Depends(get_db),
):
    """Commit categorized Excel extracted records into Rooman Books accounts, customers, bills, invoices, and expenses."""
    org_id = user.organization_id
    counts: Dict[str, int] = {"customers": 0, "vendors": 0, "invoices": 0, "bills": 0, "expenses": 0}

    # Cache default accounts
    expense_acct = db.execute(select(Account).where(Account.organization_id == org_id, Account.type == "expense")).scalars().first()
    bank_acct = db.execute(select(BankAccount).where(BankAccount.organization_id == org_id)).scalars().first()

    for item in payload.items:
        cat = item.category.lower()
        d = item.data

        if cat == "customers":
            name = d.get("display_name") or d.get("company_name") or d.get("name") or "New Customer"
            email = d.get("email") or f"client_{uuid.uuid4().hex[:6]}@example.com"
            contact = Contact(
                organization_id=org_id,
                type="customer",
                display_name=str(name)[:100],
                company_name=str(d.get("company_name") or "")[:100] or None,
                email=str(email)[:100],
                phone=str(d.get("phone") or "")[:20] or None,
                gstin=str(d.get("gstin") or "")[:15] or None,
                pan=str(d.get("pan") or "")[:10] or None,
                billing_address=str(d.get("billing_address") or d.get("address") or "")[:255] or None,
            )
            db.add(contact)
            counts["customers"] += 1

        elif cat == "vendors":
            name = d.get("display_name") or d.get("vendor_name") or d.get("name") or "New Vendor"
            contact = Contact(
                organization_id=org_id,
                type="vendor",
                display_name=str(name)[:100],
                company_name=str(d.get("company_name") or "")[:100] or None,
                email=str(d.get("email") or "")[:100] or None,
                phone=str(d.get("phone") or "")[:20] or None,
                gstin=str(d.get("gstin") or "")[:15] or None,
                pan=str(d.get("pan") or "")[:10] or None,
                billing_address=str(d.get("billing_address") or d.get("address") or "")[:255] or None,
            )
            db.add(contact)
            counts["vendors"] += 1

        elif cat == "expenses":
            if not expense_acct or not bank_acct:
                continue
            amt = Decimal(str(d.get("amount") or 100.0))
            exp = Expense(
                organization_id=org_id,
                expense_number=numbering.next_number(db, org_id, "expense"),
                date=date.today(),
                account_id=expense_acct.id,
                paid_through_account_id=bank_acct.id,
                amount=amt,
                total=amt,
                tax_rate=Decimal("0"),
                category=str(d.get("category") or d.get("description") or "Operating Expense")[:50],
                notes=str(d.get("notes") or f"Payee: {d.get('payee') or d.get('display_name') or 'Vendor'} (Imported via Excel Data Input)"),
                created_by=user.id,
            )
            db.add(exp)
            counts["expenses"] += 1

        elif cat == "invoices":
            # Find or create customer
            cust_name = str(d.get("display_name") or d.get("customer_name") or "Customer")[:100]
            cust = db.execute(select(Contact).where(Contact.organization_id == org_id, Contact.type == "customer", Contact.display_name == cust_name)).scalar_one_or_none()
            if not cust:
                cust = Contact(
                    organization_id=org_id,
                    type="customer",
                    display_name=cust_name,
                    email=str(d.get("email") or f"client_{uuid.uuid4().hex[:6]}@example.com"),
                )
                db.add(cust)
                db.flush()
            amt = Decimal(str(d.get("amount") or 500.0))
            inv = Invoice(
                organization_id=org_id,
                invoice_number=numbering.next_number(db, org_id, "invoice"),
                customer_id=cust.id,
                date=date.today(),
                due_date=date.today(),
                subtotal=amt,
                tax_total=Decimal("0"),
                total=amt,
                amount_paid=Decimal("0"),
                status="sent",
                created_by=user.id,
            )
            inv.lines.append(
                InvoiceLine(
                    position=0,
                    description=str(d.get("description") or "Professional Services"),
                    quantity=Decimal("1"),
                    rate=amt,
                    tax_rate=Decimal("0"),
                    amount=amt,
                    tax_amount=Decimal("0"),
                )
            )
            db.add(inv)
            counts["invoices"] += 1

        elif cat == "bills":
            # Find or create vendor
            vnd_name = str(d.get("display_name") or d.get("vendor_name") or "Vendor")[:100]
            vnd = db.execute(select(Contact).where(Contact.organization_id == org_id, Contact.type == "vendor", Contact.display_name == vnd_name)).scalar_one_or_none()
            if not vnd:
                vnd = Contact(organization_id=org_id, type="vendor", display_name=vnd_name, email=str(d.get("email") or ""))
                db.add(vnd)
                db.flush()
            amt = Decimal(str(d.get("amount") or 500.0))
            bill = Bill(
                organization_id=org_id,
                bill_number=numbering.next_number(db, org_id, "bill"),
                vendor_id=vnd.id,
                date=date.today(),
                due_date=date.today(),
                subtotal=amt,
                tax_total=Decimal("0"),
                total=amt,
                amount_paid=Decimal("0"),
                status="open",
                created_by=user.id,
            )
            bill.lines.append(
                BillLine(
                    position=0,
                    description=str(d.get("description") or "Purchased Goods/Services"),
                    quantity=Decimal("1"),
                    rate=amt,
                    tax_rate=Decimal("0"),
                    amount=amt,
                    tax_amount=Decimal("0"),
                )
            )
            db.add(bill)
            counts["bills"] += 1

    db.commit()
    total_saved = sum(counts.values())
    audit.record(db, user, "import", "excel_input", user.id, f"Imported {total_saved} records: {counts}")
    return ExcelCommitResponse(
        success=True,
        imported_counts=counts,
        message=f"Successfully categorized and imported {total_saved} records into Rooman Books.",
    )


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
