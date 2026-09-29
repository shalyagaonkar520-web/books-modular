"""Load and save the editable public-website content.

The document lives in platform_settings under ``site_content``. When nothing
has been saved yet, or a stored copy no longer validates, the bundled default
(``backend/content/site_content_default.json``, which mirrors the original
landing page) is served, so the public site always renders.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy.orm import Session

from backend.schemas.site_content import SiteContent
from backend.services import platform_settings

logger = logging.getLogger("roomanbooks.site_content")

SITE_CONTENT_KEY = "site_content"
DEFAULT_PATH = Path(__file__).resolve().parent.parent / "content" / "site_content_default.json"


@lru_cache
def _default_json() -> str:
    return DEFAULT_PATH.read_text(encoding="utf-8")


def default_content() -> SiteContent:
    return SiteContent.model_validate(json.loads(_default_json()))


def get_site_content(db: Session) -> SiteContent:
    stored = platform_settings.get_value(db, SITE_CONTENT_KEY)
    if stored:
        try:
            return SiteContent.model_validate_json(stored)
        except ValidationError:
            logger.warning("Stored site content no longer validates; serving the default")
    return default_content()


def save_site_content(db: Session, content: SiteContent) -> SiteContent:
    platform_settings.set_value(db, SITE_CONTENT_KEY, content.model_dump_json(by_alias=True))
    return content


def reset_site_content(db: Session) -> SiteContent:
    content = default_content()
    save_site_content(db, content)
    return content
