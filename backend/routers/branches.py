"""Branches (locations / reporting tags): invoices, bills, expenses and journals
carry one, and the profit and loss can be run for a single branch."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user, require_admin
from backend.models import Bill, Branch, Expense, Invoice, JournalEntry, User
from backend.schemas.common import APIModel, Message
from backend.services import audit
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/branches", tags=["Branches"])


class BranchIn(APIModel):
    name: str = Field(min_length=1, max_length=120)
    code: Optional[str] = Field(default=None, max_length=20)
    gstin: Optional[str] = Field(default=None, max_length=20)
    address: Optional[str] = Field(default=None, max_length=2000)
    is_active: bool = True


class BranchOut(BranchIn):
    id: str
    created_at: datetime


def _out(b: Branch) -> BranchOut:
    return BranchOut(id=b.id, name=b.name, code=b.code, gstin=b.gstin, address=b.address, is_active=b.is_active, created_at=b.created_at)


def _name_taken(db: Session, org_id: str, name: str, exclude: Optional[str] = None) -> bool:
    stmt = select(Branch.id).where(Branch.organization_id == org_id, func.lower(Branch.name) == name.strip().lower())
    if exclude:
        stmt = stmt.where(Branch.id != exclude)
    return db.execute(stmt).first() is not None


@router.get("", response_model=List[BranchOut])
def list_branches(include_inactive: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Branch).where(Branch.organization_id == user.organization_id)
    if not include_inactive:
        stmt = stmt.where(Branch.is_active.is_(True))
    return [_out(b) for b in db.execute(stmt.order_by(Branch.name)).scalars()]


@router.post("", response_model=BranchOut, status_code=status.HTTP_201_CREATED)
def create_branch(payload: BranchIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if _name_taken(db, user.organization_id, payload.name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A branch named '{payload.name.strip()}' already exists")
    branch = Branch(organization_id=user.organization_id, **payload.model_dump())
    branch.name = branch.name.strip()
    db.add(branch)
    db.flush()
    audit.record(db, user, "create", "branch", branch.id, f"Created branch {branch.name}")
    db.commit()
    db.refresh(branch)
    return _out(branch)


@router.put("/{branch_id}", response_model=BranchOut)
def update_branch(branch_id: str, payload: BranchIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    branch = get_or_404(db, Branch, branch_id, user.organization_id, "Branch")
    if _name_taken(db, user.organization_id, payload.name, exclude=branch.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A branch named '{payload.name.strip()}' already exists")
    for key, value in payload.model_dump().items():
        setattr(branch, key, value)
    branch.name = branch.name.strip()
    audit.record(db, user, "update", "branch", branch.id, f"Updated branch {branch.name}")
    db.commit()
    db.refresh(branch)
    return _out(branch)


@router.delete("/{branch_id}", response_model=Message)
def delete_branch(branch_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Delete an unused branch; one already on documents is deactivated instead."""
    branch = get_or_404(db, Branch, branch_id, user.organization_id, "Branch")
    used = any(
        db.execute(select(model.id).where(model.branch_id == branch.id).limit(1)).first()
        for model in (Invoice, Bill, Expense, JournalEntry)
    )
    if used:
        branch.is_active = False
        audit.record(db, user, "update", "branch", branch.id, f"Deactivated branch {branch.name} (used on documents)")
        db.commit()
        return Message(message="Branch is used on documents, so it was deactivated")
    audit.record(db, user, "delete", "branch", branch.id, f"Deleted branch {branch.name}")
    db.delete(branch)
    db.commit()
    return Message(message="Branch deleted")
