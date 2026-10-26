"""What an organization's admin panel may change in its app content.

The platform admin decides, per organization, which parts of the app content
its org admins can edit: module keys (that module's texts and its on/off
switch), plus two extras, ``branding`` (name, logo, colour) and ``general``
(texts shared by every module: sign-in, dashboard, settings, header, ...).

Default (nothing chosen yet): the modules of the organization's subscription
plan (every module while on a trial or without a plan), no extras. Whatever is
chosen, a module outside the plan can never be switched on.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Iterable, Optional, Set, Tuple

from sqlalchemy.orm import Session

from backend.models import Organization
from backend.schemas.app_content import AppContent
from backend.services import module_pricing, subscription
from backend.services.app_content import get_app_content, get_org_app_content, save_org_app_content

BRANDING = "branding"
GENERAL = "general"
EXTRAS = (BRANDING, GENERAL)


def catalog() -> list[str]:
    """Every key the platform admin can grant: the modules, then the extras."""
    return list(module_pricing.module_keys()) + list(EXTRAS)


def default_access(org: Organization) -> Set[str]:
    plan = subscription.paid_modules(org)
    return set(plan) if plan is not None else set(module_pricing.module_keys())


def get_access(org: Organization) -> Tuple[Set[str], bool]:
    """(granted keys, whether that is the default)."""
    if org.panel_content_access is None:
        return default_access(org), True
    try:
        keys = json.loads(org.panel_content_access)
    except (TypeError, ValueError):
        return default_access(org), True
    known = set(catalog())
    return {str(k) for k in keys if str(k) in known}, False


def set_access(org: Organization, keys: Optional[Iterable[str]]) -> None:
    """Store the granted keys (in catalog order), or None to go back to the default."""
    if keys is None:
        org.panel_content_access = None
        return
    wanted = set(keys)
    org.panel_content_access = json.dumps([key for key in catalog() if key in wanted])


def _module_keys() -> Set[str]:
    return set(module_pricing.module_keys())


def text_editable(key: str, access: Set[str]) -> bool:
    """A text belongs to the module named by its first segment; anything else is a general text."""
    group = key.split(".", 1)[0]
    if group in _module_keys():
        return group in access
    return GENERAL in access


def _apply(current: Dict[str, Any], source: Dict[str, Any], org: Organization, access: Set[str]) -> AppContent:
    """``current`` with the parts ``access`` covers taken from ``source`` (modules capped by the plan)."""
    plan = subscription.paid_modules(org)
    doc = json.loads(json.dumps(current))
    if BRANDING in access:
        doc["branding"] = source["branding"]
    for key, on in source["modules"].items():
        if key in access and key in doc["modules"]:
            doc["modules"][key] = bool(on) and (plan is None or key in plan)
    for key, value in source["texts"].items():
        if key in doc["texts"] and text_editable(key, access):
            doc["texts"][key] = value
    return AppContent.model_validate(doc)


def save_for_panel(db: Session, org: Organization, payload: AppContent) -> Dict[str, Any]:
    """Save what the panel may change; everything else keeps the organization's current content."""
    access, _ = get_access(org)
    current = get_org_app_content(db, org.id).model_dump(by_alias=True)
    merged = _apply(current, payload.model_dump(by_alias=True), org, access)
    return save_org_app_content(db, org.id, merged)


def reset_for_panel(db: Session, org: Organization) -> Dict[str, Any]:
    """Put the parts the panel may change back to the shared content."""
    access, _ = get_access(org)
    current = get_org_app_content(db, org.id).model_dump(by_alias=True)
    shared = get_app_content(db).model_dump(by_alias=True)
    merged = _apply(current, shared, org, access)
    return save_org_app_content(db, org.id, merged)


def access_out(org: Organization) -> Dict[str, Any]:
    keys, is_default = get_access(org)
    plan = subscription.paid_modules(org)
    modules = [k for k in module_pricing.module_keys() if k in keys]
    return {
        "modules": modules,
        "branding": BRANDING in keys,
        "general": GENERAL in keys,
        "is_default": is_default,
        "plan_modules": sorted(plan) if plan is not None else None,
    }


def known_keys_check(keys: Iterable[str]) -> list[str]:
    """Keys that are not in the catalog (for a 422)."""
    known = set(catalog())
    return sorted(set(keys) - known)
