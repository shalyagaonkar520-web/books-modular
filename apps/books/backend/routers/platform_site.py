"""Super-admin editing of the public website content (landing page + pricing).

Registered in main.py with require_superuser, like the rest of /api/platform.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_superuser
from backend.models import PlatformAdmin
from backend.schemas.site_content import SiteContent
from backend.services import audit
from backend.services.site_content import get_site_content, reset_site_content, save_site_content

router = APIRouter(prefix="/api/platform", tags=["Platform"])


@router.get("/site-content", response_model=SiteContent)
def read_site_content(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    return get_site_content(db)


@router.put("/site-content", response_model=SiteContent)
def update_site_content(payload: SiteContent, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    save_site_content(db, payload)
    audit.record(db, None, "update", "site_content", None, f"Website content updated by platform admin {admin.email}")
    db.commit()
    return payload


@router.post("/site-content/reset", response_model=SiteContent)
def reset_to_default(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    content = reset_site_content(db)
    audit.record(db, None, "update", "site_content", None, f"Website content reset to defaults by platform admin {admin.email}")
    db.commit()
    return content
