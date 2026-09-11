"""Persist runtime configuration back into the .env file on disk.

Integration credentials (Razorpay, SMTP) are process-wide settings rather than
per-organisation rows, so the app keeps them in .env and reloads the cached
Settings object after writing.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict

from backend.config import get_settings

ENV_PATH = Path(".env")


def update_env_values(updates: Dict[str, str]) -> None:
    """Write key=value pairs into .env, replacing existing keys in place.

    Comments and unrelated keys are preserved. Clears the settings cache so the
    next get_settings() call picks the new values up.
    """
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    written = set()
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            key = line.partition("=")[0].strip()
            if key in updates:
                out.append(f"{key}={updates[key]}")
                written.add(key)
                continue
        out.append(line)

    for key, value in updates.items():
        if key not in written:
            out.append(f"{key}={value}")

    ENV_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")
    get_settings.cache_clear()
