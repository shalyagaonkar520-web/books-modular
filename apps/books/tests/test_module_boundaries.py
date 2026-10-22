"""Module boundaries: a module's router depends on core services, never on another module's router.

Shared logic (posting an invoice or a bill, the payroll and time-entry API
shapes, the platform's Razorpay keys) lives in backend/services, so a product
that leaves a module out still has everything the modules it ships rely on.
"""

from __future__ import annotations

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"

# Core-to-core only: "Sign in with Rooman One" ends in the same session as a password sign-in.
ALLOWED = {("rooman_one_login", "auth")}


def _router_imports(path: Path) -> set[str]:
    found: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.ImportFrom) and node.module:
            if node.module == "backend.routers":
                found.update(alias.name for alias in node.names)
            elif node.module.startswith("backend.routers."):
                found.add(node.module.split(".")[2])
        elif isinstance(node, ast.Import):
            found.update(alias.name.split(".")[2] for alias in node.names if alias.name.startswith("backend.routers."))
    return found


def test_no_router_imports_another_router():
    offenders = []
    for path in sorted((BACKEND / "routers").glob("*.py")):
        for target in _router_imports(path):
            if target != path.stem and (path.stem, target) not in ALLOWED:
                offenders.append(f"routers/{path.name} imports routers/{target}.py")
    assert offenders == []


def test_services_and_integrations_never_import_routers():
    offenders = []
    for folder in ("services", "integrations"):
        for path in sorted((BACKEND / folder).glob("*.py")):
            if _router_imports(path):
                offenders.append(f"{folder}/{path.name}")
    assert offenders == []
