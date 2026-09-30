"""Editable tenant-app content: branding, module on/off switches and UI texts.

The catalog of editable texts and modules is the bundled default document
(``backend/content/app_content_default.json``, mirrored byte-for-byte by the
frontend). Only keys from it are accepted, so a typo can't store a label the
app never shows. Texts render as plain text (React escapes them).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Dict

from pydantic import Field, field_validator

from backend.schemas.common import APIModel
from backend.schemas.site_content import DEFAULT_LOGO_URL, _check_logo_url

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "content" / "app_content_default.json"
MAX_TEXT = 300

Text = Annotated[str, Field(max_length=MAX_TEXT)]


@lru_cache
def default_document() -> Dict[str, Any]:
    return json.loads(DEFAULT_PATH.read_text(encoding="utf-8"))


class AppBranding(APIModel):
    app_name: str = Field(min_length=1, max_length=60)
    logo_url: str = Field(default=DEFAULT_LOGO_URL, min_length=1, max_length=500)
    primary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("logo_url")
    @classmethod
    def _logo_url(cls, value: str) -> str:
        return _check_logo_url(value)


class AppContent(APIModel):
    branding: AppBranding
    modules: Dict[str, bool] = Field(default_factory=dict)
    texts: Dict[str, Text] = Field(default_factory=dict)

    @field_validator("modules")
    @classmethod
    def _known_modules(cls, value: Dict[str, bool]) -> Dict[str, bool]:
        unknown = sorted(set(value) - set(default_document()["modules"]))
        if unknown:
            raise ValueError(f"Unknown module(s): {', '.join(unknown[:10])}")
        return value

    @field_validator("texts")
    @classmethod
    def _known_texts(cls, value: Dict[str, str]) -> Dict[str, str]:
        unknown = sorted(set(value) - set(default_document()["texts"]))
        if unknown:
            raise ValueError(f"Unknown text key(s): {', '.join(unknown[:10])}")
        return value
