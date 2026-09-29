"""Public, unauthenticated content for the marketing/landing page."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.schemas.site_content import SiteContent
from backend.services.site_content import get_site_content

router = APIRouter(prefix="/api/public", tags=["Public site"])


@router.get("/site-content", response_model=SiteContent)
def public_site_content(response: Response, db: Session = Depends(get_db)):
    # Revalidate every load so an operator's edit shows up immediately.
    response.headers["Cache-Control"] = "no-cache"
    return get_site_content(db)
