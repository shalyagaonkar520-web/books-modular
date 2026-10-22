"""Products: one Books codebase, shipped as several apps.

A product (``backend/content/products.json``) is a set of Books modules with
its own name, logo, colour, web address(es) and Rooman One app key - e.g.
Rooman Expenses = expenses + bills + vendors + reports. Every product runs on
the same deployment, the same login, the same organizations and the same
database as Rooman Books; only what a request may reach differs.

The product is chosen by the host the request came in on (X-Forwarded-Host,
else Host). An unknown host - localhost, an IP, the API's own name - gets the
``fallback`` product, Rooman Books with every module, so Books behaves exactly
as before.

The product narrows what the organization may use; it never widens it. The
organization's plan and each user's module access (deps.require_module) still
apply on top. A spoofed Host header can therefore only reach what that
organization could reach in Rooman Books anyway.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import cached_property, lru_cache
from pathlib import Path
from typing import Dict, FrozenSet, Optional, Tuple

from fastapi import HTTPException, Request, status

from backend.config import get_settings
from backend.services import module_registry

PRODUCTS_PATH = Path(__file__).resolve().parent.parent / "content" / "products.json"

READ_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
NOT_IN_PRODUCT = "MODULE_NOT_IN_PRODUCT"
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


@dataclass(frozen=True)
class Product:
    key: str
    name: str
    app_key: str
    domains: Tuple[str, ...]
    # Resolved: the configured modules plus everything they depend on, in registry order.
    modules: Tuple[str, ...]
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    url: Optional[str] = None

    @cached_property
    def module_set(self) -> FrozenSet[str]:
        return frozenset(self.modules)

    @cached_property
    def uses(self) -> FrozenSet[str]:
        """Modules this product only reads from (lookups its modules need), not counting its own."""
        known = module_registry.by_key()
        return frozenset(u for key in self.modules for u in known[key].uses) - self.module_set

    @property
    def is_full(self) -> bool:
        """Every module: Rooman Books itself."""
        return self.module_set >= set(module_registry.keys())

    def has(self, key: str) -> bool:
        return key in self.module_set

    def app_url(self) -> str:
        """Where this product's pages live (sign-in redirects, links)."""
        if self.url:
            return self.url.rstrip("/")
        if self.key == fallback().key or not self.domains:
            return get_settings().app_url.rstrip("/")
        return f"https://{self.domains[0]}"

    def path_error(self, method: str, path: str) -> Optional[str]:
        """Why this product may not call ``method path`` (the 403 detail), else None."""
        if self.is_full:
            return None
        reading = method.upper() in READ_METHODS
        for group in module_registry.owners(path):
            if group & self.module_set or (reading and group & self.uses):
                continue
            label = next(m.label for m in module_registry.modules() if m.key in group)
            return f"{NOT_IN_PRODUCT}: {label} isn't part of {self.name}."
        return None

    def module_error(self, *keys: str) -> Optional[str]:
        """The 403 detail when none of ``keys`` is in this product, else None."""
        if any(self.has(key) for key in keys):
            return None
        label = module_registry.by_key()[keys[0]].label
        return f"{NOT_IN_PRODUCT}: {label} isn't part of {self.name}."


def _build(raw: dict) -> Product:
    selection = module_registry.keys() if raw["modules"] == "all" else raw["modules"]
    color = raw.get("primaryColor")
    if color is not None and not _HEX_COLOR.match(color):
        raise ValueError(f"Product {raw['key']}: primaryColor must look like #0f766e")
    return Product(
        key=raw["key"],
        name=raw["name"],
        app_key=raw["appKey"],
        domains=tuple(d.strip().lower() for d in raw.get("domains") or ()),
        modules=tuple(module_registry.resolve(selection)),
        logo_url=raw.get("logoUrl"),
        primary_color=color,
        url=raw.get("url"),
    )


@lru_cache
def _catalog() -> Tuple[str, Dict[str, Product]]:
    raw = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    products: Dict[str, Product] = {}
    for entry in raw["products"]:
        product = _build(entry)
        if product.key in products:
            raise ValueError(f"Product {product.key} is declared twice")
        products[product.key] = product
    if raw["fallback"] not in products:
        raise ValueError(f"The fallback product {raw['fallback']} is not declared")
    domains = [d for p in products.values() for d in p.domains]
    if len(domains) != len(set(domains)):
        raise ValueError("A domain is listed under more than one product")
    return raw["fallback"], products


def all_products() -> Tuple[Product, ...]:
    return tuple(_catalog()[1].values())


def get(key: str) -> Optional[Product]:
    return _catalog()[1].get(key)


def fallback() -> Product:
    key, products = _catalog()
    return products[key]


def _hostname(value: str) -> str:
    host = value.split(",")[0].strip().lower()
    if host.startswith("["):  # [IPv6]:port
        return host.split("]")[0] + "]"
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def for_host(host: Optional[str]) -> Product:
    """The product served on ``host`` (a port is ignored); unknown hosts get the fallback."""
    name = _hostname(host or "")
    if name:
        for product in all_products():
            if name in product.domains:
                return product
    return fallback()


def request_host(request: Request) -> str:
    """The host the browser asked for: X-Forwarded-Host (set by an outer proxy), else Host."""
    return request.headers.get("x-forwarded-host") or request.headers.get("host") or ""


def current(request: Request) -> Product:
    """The product this request belongs to (worked out once per request)."""
    product = getattr(request.state, "product", None)
    if product is None:
        product = for_host(request_host(request))
        request.state.product = product
    return product


def require_product_access(request: Request) -> None:
    """Router dependency: a module's API answers 403 outside the products that include it.

    Reads are also allowed for the modules the product's own modules look
    data up in (``uses``); core paths are always open.
    """
    error = current(request).path_error(request.method, request.url.path)
    if error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error)


def ensure_module(request: Request, *keys: str) -> None:
    """403 unless one of ``keys`` is in the request's product (for endpoints that write into another module)."""
    error = current(request).module_error(*keys)
    if error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error)
