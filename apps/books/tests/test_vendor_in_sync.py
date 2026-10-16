"""vendor/ must be an exact copy of the monorepo's SDK and event contracts.

If this fails, run scripts/sync_vendor.sh and commit the result. Skipped where
the monorepo is not around (e.g. inside the production image).
"""

from __future__ import annotations

from pathlib import Path

import pytest

BOOKS = Path(__file__).resolve().parents[1]
ROOT = BOOKS.parents[1]
PAIRS = [
    (ROOT / "packages" / "sdk-python" / "rooman_sdk", BOOKS / "vendor" / "sdk-python" / "rooman_sdk"),
    (ROOT / "contracts" / "events", BOOKS / "vendor" / "contracts" / "events"),
]


def _files(folder: Path) -> set[str]:
    return {str(p.relative_to(folder)).replace("\\", "/") for p in folder.rglob("*") if p.is_file() and "__pycache__" not in p.parts}


@pytest.mark.parametrize("source,copy", PAIRS, ids=["sdk", "contracts"])
def test_vendor_matches_the_monorepo(source: Path, copy: Path):
    if not source.is_dir():
        pytest.skip("not inside the Rooman One monorepo")
    assert _files(source) == _files(copy), "vendor/ is out of date: run scripts/sync_vendor.sh"
    different = [
        name for name in _files(source) if (source / name).read_bytes().replace(b"\r\n", b"\n") != (copy / name).read_bytes().replace(b"\r\n", b"\n")
    ]
    assert not different, f"vendor/ is out of date ({different}): run scripts/sync_vendor.sh"
