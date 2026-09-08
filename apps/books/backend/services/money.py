"""Decimal helpers for money arithmetic."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Union

Number = Union[int, float, str, Decimal, None]
TWO_PLACES = Decimal("0.01")
THREE_PLACES = Decimal("0.001")


def D(value: Number) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money(value: Number) -> Decimal:
    return D(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def qty(value: Number) -> Decimal:
    return D(value).quantize(THREE_PLACES, rounding=ROUND_HALF_UP)


def f(value: Number) -> float:
    """Convert to float for JSON output."""
    return float(money(value))
