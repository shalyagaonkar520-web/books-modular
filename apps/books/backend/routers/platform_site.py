"""Super-admin editing of the public website content (landing page + pricing)
and of the tenant app's content (branding, module switches, UI texts).

Registered in main.py with require_superuser, like the rest of /api/platform.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_superuser
from backend.models import PlatformAdmin
from backend.schemas.app_content import AppContent
from backend.schemas.site_content import SiteContent
from backend.services import audit
from backend.services.app_content import get_app_content, reset_app_content, save_app_content
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


@router.get("/app-content", response_model=AppContent)
def read_app_content(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    return get_app_content(db)


@router.put("/app-content", response_model=AppContent)
def update_app_content(payload: AppContent, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    saved = save_app_content(db, payload)
    audit.record(db, None, "update", "app_content", None, f"App content updated by platform admin {admin.email}")
    db.commit()
    return saved


@router.post("/app-content/reset", response_model=AppContent)
def reset_app_to_default(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    content = reset_app_content(db)
    audit.record(db, None, "update", "app_content", None, f"App content reset to defaults by platform admin {admin.email}")
    db.commit()
    return content
