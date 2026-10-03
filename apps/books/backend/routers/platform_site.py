"""Super-admin editing of the public website content (landing page + pricing)
and of the tenant app's content (branding, module switches, UI texts).

Registered in main.py with require_superuser, like the rest of /api/platform.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_superuser
from backend.models import Organization, PlatformAdmin
from backend.schemas.app_content import AppContent, AppContentOverrides, OrgAppContentOut
from backend.schemas.site_content import SiteContent
from backend.services import audit
from backend.services.app_content import (
    delete_org_app_content,
    get_app_content,
    get_org_app_content,
    get_org_overrides,
    reset_app_content,
    save_app_content,
    save_org_app_content,
)
from backend.services.site_content import get_site_content, reset_site_content, save_site_content

router = APIRouter(prefix="/api/platform", tags=["Platform"])


@router.get("/site-content", response_model=SiteContent)
def read_site_content(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    return get_site_content(db)


@router.put("/site-content", response_model=SiteContent)
def update_site_content(payload: SiteContent, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    save_site_content(db, payload)
    audit.record(db, admin, "update", "site_content", None, f"Website content updated by platform admin {admin.email}")
    db.commit()
    return payload


@router.post("/site-content/reset", response_model=SiteContent)
def reset_to_default(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    content = reset_site_content(db)
    audit.record(db, admin, "update", "site_content", None, f"Website content reset to defaults by platform admin {admin.email}")
    db.commit()
    return content


@router.get("/app-content", response_model=AppContent)
def read_app_content(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    return get_app_content(db)


@router.put("/app-content", response_model=AppContent)
def update_app_content(payload: AppContent, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    saved = save_app_content(db, payload)
    audit.record(db, admin, "update", "app_content", None, f"App content updated by platform admin {admin.email}")
    db.commit()
    return saved


@router.post("/app-content/reset", response_model=AppContent)
def reset_app_to_default(db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    content = reset_app_content(db)
    audit.record(db, admin, "update", "app_content", None, f"App content reset to defaults by platform admin {admin.email}")
    db.commit()
    return content


# --------------------------------------------------------------------------- #
# Per-organization app content
# --------------------------------------------------------------------------- #
def _org_or_404(db: Session, org_id: str) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


def _org_content_out(db: Session, org: Organization) -> OrgAppContentOut:
    overrides = get_org_overrides(db, org.id)
    return OrgAppContentOut(
        organization_id=org.id,
        organization_name=org.name,
        content=get_org_app_content(db, org.id),
        shared=get_app_content(db),
        overridden=AppContentOverrides(
            branding=sorted(overrides["branding"]),
            modules=sorted(overrides["modules"]),
            texts=sorted(overrides["texts"]),
        ),
    )


@router.get("/organizations/{org_id}/app-content", response_model=OrgAppContentOut)
def read_org_app_content(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    return _org_content_out(db, _org_or_404(db, org_id))


@router.put("/organizations/{org_id}/app-content", response_model=OrgAppContentOut)
def update_org_app_content(
    org_id: str, payload: AppContent, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)
):
    org = _org_or_404(db, org_id)
    overrides = save_org_app_content(db, org.id, payload)
    count = sum(len(v) for v in overrides.values())
    audit.record(
        db,
        admin,
        "update",
        "app_content",
        org.id,
        f"App content for '{org.name}' updated by platform admin {admin.email} ({count} customized field(s))",
        organization_id=org.id,
    )
    db.commit()
    return _org_content_out(db, org)


@router.post("/organizations/{org_id}/app-content/reset", response_model=OrgAppContentOut)
def reset_org_app_content(org_id: str, db: Session = Depends(get_db), admin: PlatformAdmin = Depends(get_current_superuser)):
    """Drop every customization so the organization follows the shared content again."""
    org = _org_or_404(db, org_id)
    delete_org_app_content(db, org.id)
    audit.record(
        db,
        admin,
        "update",
        "app_content",
        org.id,
        f"App content for '{org.name}' reset to the shared content by platform admin {admin.email}",
        organization_id=org.id,
    )
    db.commit()
    return _org_content_out(db, org)
