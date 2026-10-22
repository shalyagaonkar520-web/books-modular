"""Public, unauthenticated content for the marketing/landing page."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user
from backend.models import User
from backend.schemas.app_content import ProductAppContent
from backend.schemas.site_content import SiteContent
from backend.services import module_pricing, platform_settings, products
from backend.services.app_content import product_app_content
from backend.services.site_content import get_site_content

router = APIRouter(prefix="/api/public", tags=["Public site"])
# Signed-in tenant users get their own organization's content.
tenant_router = APIRouter(prefix="/api", tags=["App content"])


@router.get("/site-content", response_model=SiteContent)
def public_site_content(response: Response, db: Session = Depends(get_db)):
    # Revalidate every load so an operator's edit shows up immediately.
    response.headers["Cache-Control"] = "no-cache"
    return get_site_content(db)


@router.get("/app-content", response_model=ProductAppContent, response_model_exclude_none=True)
def public_app_content(request: Request, response: Response, db: Session = Depends(get_db)):
    # Branding is needed on the sign-in page, before anyone is logged in; it is
    # the branding of the product this host serves.
    response.headers["Cache-Control"] = "no-cache"
    return product_app_content(db, products.current(request))


@router.get("/module-pricing")
def public_module_pricing(response: Response, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """The module price list (INR per month; a yearly plan costs ``yearlyMultiplier`` months)
    and the length of the free trial a new organization gets."""
    response.headers["Cache-Control"] = "no-cache"
    return {**module_pricing.catalog(), "trialDays": platform_settings.trial_days(db)}


@tenant_router.get("/app-content", response_model=ProductAppContent, response_model_exclude_none=True)
def my_app_content(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """The shared content with the caller's organization overrides on top, as the request's product shows it."""
    response.headers["Cache-Control"] = "no-store"
    return product_app_content(db, products.current(request), user.organization_id)
