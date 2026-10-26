"""GST rules: state codes, place of supply and the CGST / SGST / IGST split.

The ledger keeps one Output GST and one Input GST account; whether a supply
was intra-state (CGST + SGST, half each) or inter-state (IGST) is decided per
document from the supplier's and the recipient's states, which is what the
returns (GSTR-1, GSTR-3B) and the e-invoice need.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Optional, Tuple

from backend.services.money import money

# GST state / UT codes (first two digits of a GSTIN).
STATE_CODES = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "96": "Other Country",
    "97": "Other Territory",
}
OVERSEAS = "96"

_ALIASES = {
    "orissa": "21",
    "pondicherry": "34",
    "new delhi": "07",
    "nct of delhi": "07",
    "j&k": "01",
    "daman and diu": "26",
    "dadra and nagar haveli": "26",
    "andaman": "35",
}
_GSTIN = re.compile(r"^(\d{2})[A-Z0-9]{13}$")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower().replace("&", "and"))


_BY_NAME = {_norm(name): code for code, name in STATE_CODES.items()}


def state_from_gstin(gstin: Optional[str]) -> Optional[str]:
    match = _GSTIN.match((gstin or "").strip().upper())
    if match and match.group(1) in STATE_CODES:
        return match.group(1)
    return None


def state_from_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    text = name.strip()
    if text.isdigit() and text.zfill(2) in STATE_CODES:
        return text.zfill(2)
    key = _norm(text)
    return _BY_NAME.get(key) or _ALIASES.get(key)


def org_state(org) -> Optional[str]:
    """The supplier's state: from its GSTIN, else its address state."""
    return state_from_gstin(getattr(org, "gstin", None)) or state_from_name(getattr(org, "state", None))


def contact_state(contact, override: Optional[str] = None) -> Optional[str]:
    """Place of supply for a contact: the document's override, the contact's own
    setting, its GSTIN, and for overseas contacts 96."""
    if override:
        return override
    if getattr(contact, "place_of_supply", None):
        return contact.place_of_supply
    if getattr(contact, "gst_treatment", None) == "overseas":
        return OVERSEAS
    return state_from_gstin(getattr(contact, "gstin", None))


def is_inter_state(supplier_state: Optional[str], place_of_supply: Optional[str]) -> bool:
    """Unknown states are treated as intra-state, the common case for a small business."""
    if not supplier_state or not place_of_supply:
        return False
    return supplier_state != place_of_supply


def split(tax: Decimal, inter_state: bool) -> Tuple[Decimal, Decimal, Decimal]:
    """(cgst, sgst, igst) for a tax amount; the two halves always add back up to the tax."""
    tax = money(tax)
    if inter_state:
        return Decimal("0"), Decimal("0"), tax
    sgst = money(tax / 2)
    return tax - sgst, sgst, Decimal("0")


def state_label(code: Optional[str]) -> str:
    return f"{code}-{STATE_CODES[code]}" if code in STATE_CODES else ""
