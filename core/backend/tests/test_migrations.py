"""Every migration must upgrade and downgrade cleanly."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parents[1]


def _config() -> Config:
    cfg = Config(str(BACKEND / "database" / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "database" / "alembic"))
    return cfg


def test_upgrade_then_downgrade_to_base():
    cfg = _config()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
