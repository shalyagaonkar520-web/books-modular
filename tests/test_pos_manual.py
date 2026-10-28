"""The Point of Sale manual: the app shows a copy of docs/POINT_OF_SALE_MANUAL.md, kept identical."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _text(path: Path) -> str:
    return path.read_bytes().decode("utf-8").replace("\r\n", "\n")


def test_the_apps_copy_of_the_manual_matches_docs():
    docs = _text(ROOT / "docs" / "POINT_OF_SALE_MANUAL.md")
    app = _text(ROOT / "frontend" / "src" / "content" / "pointOfSaleManual.md")
    assert app == docs, "Edit docs/POINT_OF_SALE_MANUAL.md and copy it to frontend/src/content/pointOfSaleManual.md"
