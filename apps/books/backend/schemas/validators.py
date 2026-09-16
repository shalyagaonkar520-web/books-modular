"""One rulebook for the identity fields that appear on more than one form.

A phone number means the same thing on a customer, a vendor, an employee and
the organisation profile, so it is validated the same way on all of them. These
validators were previously spelled out on the organisation profile only, which
left the same field strict in one form and unchecked in another.

Every validator here treats None and "" as "not supplied" and returns them
untouched - these are optional fields, and clearing one is not an error. Values
that are supplied are normalised (trimmed, upper-cased, separators removed) so
what gets stored is consistent no matter how it was typed.
"""

from __future__ import annotations

import re
from typing import Optional

# 2-digit state code, the 10-character PAN of the holder, an entity number, a
# literal Z, then a check character.
GSTIN_RE = re.compile(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]")
PAN_RE = re.compile(r"[A-Z]{5}[0-9]{4}[A-Z]")
# Bank branch code: four letters, a reserved 0, then six alphanumerics.
IFSC_RE = re.compile(r"[A-Z]{4}0[A-Z0-9]{6}")


def _blank(value: Optional[str]) -> bool:
    return value is None or value.strip() == ""


def person_name(value: Optional[str], label: str = "Name") -> Optional[str]:
    """People's names are names, not codes - "Shivani 123" is a typo, not a person."""
    if _blank(value):
        return value
    if any(ch.isdigit() for ch in value):
        raise ValueError(f"{label} cannot contain numbers")
    return value


def business_name(value: Optional[str], label: str = "Company name") -> Optional[str]:
    """Company names may mix letters and digits - 3M India and 7-Eleven are real
    trading names - so unlike a person's name this only requires that there be a
    letter somewhere. A value of pure digits is a reference number that has been
    typed into the wrong box, not a company.
    """
    if _blank(value):
        return value
    if not any(ch.isalpha() for ch in value):
        raise ValueError(f"{label} must contain letters, not only numbers")
    return value


def phone(value: Optional[str], label: str = "Phone number") -> Optional[str]:
    """Ten digits, however they were typed.

    People write Indian numbers as "+91 98765 43210", "098765 43210" or
    "9876543210" and all three mean the same subscriber, so the separators and
    a leading +91/0 are stripped and the ten digits kept. Storing the normalised
    form keeps a number searchable regardless of how it was entered.
    """
    if _blank(value):
        return value
    digits = re.sub(r"[\s()\-.]", "", value.strip())
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not (digits.isdigit() and len(digits) == 10):
        raise ValueError(f"{label} must be 10 digits (a +91 or 0 prefix is fine)")
    return digits


def gstin(value: Optional[str], label: str = "GSTIN") -> Optional[str]:
    if _blank(value):
        return value
    cleaned = value.strip().upper()
    if not GSTIN_RE.fullmatch(cleaned):
        raise ValueError(f"{label} must be a valid 15-character GSTIN (e.g. 29AABCR1234F1Z5)")
    return cleaned


def pan(value: Optional[str], label: str = "PAN") -> Optional[str]:
    if _blank(value):
        return value
    cleaned = value.strip().upper()
    if not PAN_RE.fullmatch(cleaned):
        raise ValueError(f"{label} must be a valid 10-character PAN (e.g. AABCR1234F)")
    return cleaned


def ifsc(value: Optional[str], label: str = "IFSC") -> Optional[str]:
    if _blank(value):
        return value
    cleaned = value.strip().upper()
    if not IFSC_RE.fullmatch(cleaned):
        raise ValueError(f"{label} must be a valid 11-character IFSC code (e.g. HDFC0001234)")
    return cleaned


def pincode(value: Optional[str], label: str = "Postal code") -> Optional[str]:
    if _blank(value):
        return value
    cleaned = re.sub(r"\s", "", value.strip())
    if not (cleaned.isdigit() and len(cleaned) == 6):
        raise ValueError(f"{label} must be exactly 6 digits")
    return cleaned


def bank_account_number(value: Optional[str], label: str = "Bank account number") -> Optional[str]:
    """Indian account numbers run roughly 9-18 digits and vary by bank, so this
    checks it is digits of a plausible length rather than an exact format."""
    if _blank(value):
        return value
    cleaned = re.sub(r"[\s\-]", "", value.strip())
    if not cleaned.isdigit():
        raise ValueError(f"{label} must contain only digits")
    if not 9 <= len(cleaned) <= 18:
        raise ValueError(f"{label} must be between 9 and 18 digits")
    return cleaned
