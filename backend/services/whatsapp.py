"""WhatsApp messages through the Meta WhatsApp Cloud API.

Off until WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set. A free-form text
message only reaches customers who have messaged the business in the last 24
hours; set WHATSAPP_TEMPLATE to an approved template (with one body parameter,
the message text) to reach anyone.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any, Callable, Dict

from fastapi import HTTPException, status

from backend.config import get_settings

logger = logging.getLogger("roomanbooks.whatsapp")


def configured() -> bool:
    s = get_settings()
    return bool(s.whatsapp_token and s.whatsapp_phone_number_id)


def normalize_phone(phone: str, default_country: str = "91") -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10:
        digits = default_country + digits
    if not 11 <= len(digits) <= 15:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the WhatsApp number with country code, e.g. +91 98765 43210")
    return digits


def _post(url: str, token: str, body: Dict[str, Any]) -> Dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310 - fixed https Graph API URL
        return json.loads(response.read() or b"{}")


# Tests replace this to avoid the network.
poster: Callable[[str, str, Dict[str, Any]], Dict[str, Any]] = _post


def send_text(to_phone: str, text: str) -> str:
    """Send a message; returns the WhatsApp message id."""
    s = get_settings()
    if not configured():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "WhatsApp is not set up: ask the administrator to add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
        )
    to = normalize_phone(to_phone)
    if s.whatsapp_template:
        body: Dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": to,
            "type": "template",
            "template": {
                "name": s.whatsapp_template,
                "language": {"code": s.whatsapp_template_language},
                "components": [{"type": "body", "parameters": [{"type": "text", "text": text[:1000]}]}],
            },
        }
    else:
        body = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"preview_url": True, "body": text[:4096]}}
    url = f"https://graph.facebook.com/{s.whatsapp_api_version}/{s.whatsapp_phone_number_id}/messages"
    try:
        result = poster(url, s.whatsapp_token, body)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.loads(exc.read() or b"{}").get("error", {}).get("message", "")
        except (ValueError, AttributeError):
            pass
        logger.warning("WhatsApp send failed (%s): %s", exc.code, detail)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"WhatsApp did not accept the message{': ' + detail if detail else ''}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not reach WhatsApp; try again shortly") from exc
    messages = result.get("messages") or [{}]
    return str(messages[0].get("id", ""))
