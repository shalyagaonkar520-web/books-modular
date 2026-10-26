"""Point of Sale: the counter where a cashier scans products and takes payment.

Every sale becomes an ordinary Books invoice, already paid, so stock, cost of
goods, GST and reports all go through the existing invoice and payment code.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import Item, User
from backend.schemas.common import APIModel

router = APIRouter(prefix="/api/pos", tags=["Point of Sale"])


class PosItem(APIModel):
    id: str
    name: str
    sku: str
    barcode: Optional[str] = None
    unit: str
    selling_price: Decimal
    tax_rate: Decimal
    hsn_sac: Optional[str] = None
    track_inventory: bool
    stock_on_hand: Decimal
    reorder_level: Decimal
    image_url: Optional[str] = None


def find_by_code(db: Session, org_id: str, code: str) -> Optional[Item]:
    """The active item a scanned code refers to: its barcode first, then its SKU (any case)."""
    code = code.strip()
    if not code:
        return None
    active = (Item.organization_id == org_id, Item.is_active.is_(True))
    item = db.execute(select(Item).where(*active, Item.barcode == code)).scalars().first()
    if item is None:
        item = db.execute(select(Item).where(*active, func.upper(Item.sku) == code.upper())).scalars().first()
    return item


@router.get("/lookup", response_model=PosItem)
def lookup(code: str = Query(min_length=1, max_length=64), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The item for a scanned barcode (or typed SKU)."""
    item = find_by_code(db, user.organization_id, code)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No item with this barcode")
    return PosItem.model_validate(item)
