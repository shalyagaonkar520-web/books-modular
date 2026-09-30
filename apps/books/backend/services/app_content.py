"""Load and save the editable tenant-app content.

Stored in platform_settings under ``app_content``. Reads always merge the
stored copy over the bundled defaults, so every key is present - including
texts added in a later release - and an empty text falls back to its default.
A stored copy that no longer validates is ignored in favour of the defaults.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.schemas.app_content import AppContent, default_document
from backend.services import platform_settings

logger = logging.getLogger("roomanbooks.app_content")

APP_CONTENT_KEY = "app_content"


def merge(overrides: Dict[str, Any]) -> AppContent:
    base = default_document()
    branding = {**base["branding"], **(overrides.get("branding") or {})}
    modules = {**base["modules"], **{k: bool(v) for k, v in (overrides.get("modules") or {}).items() if k in base["modules"]}}
    texts = dict(base["texts"])
    for key, value in (overrides.get("texts") or {}).items():
        if key in texts and isinstance(value, str) and value.strip():
            texts[key] = value
    return AppContent.model_validate({"branding": branding, "modules": modules, "texts": texts})


def default_content() -> AppContent:
    return merge({})


def get_app_content(db: Session) -> AppContent:
    stored = platform_settings.get_value(db, APP_CONTENT_KEY)
    if stored:
        try:
            return merge(json.loads(stored))
        except (ValueError, ValidationError):
            logger.warning("Stored app content no longer validates; serving the defaults")
    return default_content()


def save_app_content(db: Session, content: AppContent) -> AppContent:
    merged = merge(content.model_dump(by_alias=True))
    platform_settings.set_value(db, APP_CONTENT_KEY, merged.model_dump_json(by_alias=True))
    return merged


def reset_app_content(db: Session) -> AppContent:
    return save_app_content(db, default_content())


# --------------------------------------------------------------------------- #
# Per-organization overrides
# --------------------------------------------------------------------------- #
# An organization stores only what differs from the shared (all-organizations)
# content, so later edits to the shared copy still reach every field the
# organization has not customized. Resolution: bundled defaults -> shared
# content -> organization overrides.

_BRANDING_FIELDS = ("appName", "logoUrl", "primaryColor")


def org_key(org_id: str) -> str:
    return f"{APP_CONTENT_KEY}:org:{org_id}"


def _empty_overrides() -> Dict[str, Any]:
    return {"branding": {}, "modules": {}, "texts": {}}


def get_org_overrides(db: Session, org_id: str) -> Dict[str, Any]:
    stored = platform_settings.get_value(db, org_key(org_id))
    if not stored:
        return _empty_overrides()
    try:
        raw = json.loads(stored)
    except ValueError:
        logger.warning("Stored app content for org %s is not JSON; ignoring it", org_id)
        return _empty_overrides()
    base = default_document()
    return {
        "branding": {k: v for k, v in (raw.get("branding") or {}).items() if k in _BRANDING_FIELDS and isinstance(v, str)},
        "modules": {k: bool(v) for k, v in (raw.get("modules") or {}).items() if k in base["modules"]},
        "texts": {k: v for k, v in (raw.get("texts") or {}).items() if k in base["texts"] and isinstance(v, str) and v.strip()},
    }


def _apply(shared: AppContent, overrides: Dict[str, Any]) -> AppContent:
    doc = shared.model_dump(by_alias=True)
    doc["branding"].update(overrides["branding"])
    doc["modules"].update(overrides["modules"])
    doc["texts"].update(overrides["texts"])
    return AppContent.model_validate(doc)


def get_org_app_content(db: Session, org_id: str) -> AppContent:
    """What an organization's users see: the shared content with its overrides on top."""
    shared = get_app_content(db)
    overrides = get_org_overrides(db, org_id)
    try:
        return _apply(shared, overrides)
    except ValidationError:
        logger.warning("Stored app content for org %s no longer validates; serving the shared content", org_id)
        return shared


def save_org_app_content(db: Session, org_id: str, content: AppContent) -> Dict[str, Any]:
    """Keep only the fields that differ from the shared content. An empty text means "use the shared text"."""
    shared = get_app_content(db).model_dump(by_alias=True)
    doc = content.model_dump(by_alias=True)
    overrides = {
        "branding": {k: doc["branding"][k] for k in _BRANDING_FIELDS if doc["branding"][k] != shared["branding"][k]},
        "modules": {k: v for k, v in doc["modules"].items() if k in shared["modules"] and v != shared["modules"][k]},
        "texts": {k: v for k, v in doc["texts"].items() if k in shared["texts"] and v.strip() and v != shared["texts"][k]},
    }
    if any(overrides.values()):
        platform_settings.set_value(db, org_key(org_id), json.dumps(overrides, ensure_ascii=False))
    else:
        delete_org_app_content(db, org_id)
    return overrides


def delete_org_app_content(db: Session, org_id: str) -> None:
    platform_settings.delete_value(db, org_key(org_id))
