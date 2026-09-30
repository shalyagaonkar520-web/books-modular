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
