"""Amounts in words, as printed on an invoice: Indian numbering (lakh, crore) for
rupees, international (million, billion) for every other currency."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

_ONES = (
    "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen"
).split()
_TENS = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()


def _below_thousand(n: int) -> str:
    words = []
    if n >= 100:
        words += [_ONES[n // 100], "Hundred"]
        n %= 100
    if n >= 20:
        words.append(_TENS[n // 10])
        n %= 10
    if n:
        words.append(_ONES[n])
    return " ".join(words)


def _indian(n: int) -> str:
    if n == 0:
        return "Zero"
    words = []
    for size, name in ((10**7, "Crore"), (10**5, "Lakh"), (10**3, "Thousand")):
        if n >= size:
            # Above 99 crore the crore count is itself read in the Indian way.
            words += [_indian(n // size) if size == 10**7 else _below_thousand(n // size), name]
            n %= size
    if n:
        words.append(_below_thousand(n))
    return " ".join(words)


def _international(n: int) -> str:
    if n == 0:
        return "Zero"
    words = []
    for size, name in ((10**12, "Trillion"), (10**9, "Billion"), (10**6, "Million"), (10**3, "Thousand")):
        if n >= size:
            words += [_international(n // size), name]
            n %= size
    if n:
        words.append(_below_thousand(n))
    return " ".join(words)


def amount_in_words(amount, currency: str = "INR") -> str:
    value = Decimal(str(amount or 0)).copy_abs().quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    whole, fraction = int(value), int((value - int(value)) * 100)
    if currency == "INR":
        text = f"Indian Rupees {_indian(whole)}"
        if fraction:
            text += f" and {_indian(fraction)} Paise"
    else:
        text = f"{currency} {_international(whole)}"
        if fraction:
            text += f" and {fraction:02d}/100"
    return f"{text} Only"
