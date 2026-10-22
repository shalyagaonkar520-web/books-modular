"""The platform-wide Razorpay keys: connect (verify and save) and disconnect.

Used by the platform admin console only; kept out of the tenant Razorpay
router so the console does not depend on a module's router.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from pydantic import BaseModel
from razorpay.errors import BadRequestError

from backend.services.razorpay_service import MSG_BAD_KEYS, MSG_UNREACHABLE, build_client, get_razorpay_service

logger = logging.getLogger("roomanbooks.razorpay")


class ConnectRazorpayRequest(BaseModel):
    key_id: str
    key_secret: str
    webhook_secret: Optional[str] = None
    mode: Optional[str] = "test"


# The Razorpay keys are platform-wide (one set in the server's .env shared by
# every organization), so only a platform super-admin may change them - see
# /api/platform/integrations/razorpay. There is deliberately no tenant or org
# admin endpoint for this: any organization could otherwise replace or wipe
# the keys every other organization uses.
def connect_credentials(payload: ConnectRazorpayRequest) -> Dict[str, Any]:
    """Save Razorpay credentials, verify live connectivity, and update configuration."""
    key_id = payload.key_id.strip()
    key_secret = payload.key_secret.strip()
    webhook_secret = (payload.webhook_secret or "").strip()
    mode = "live" if (payload.mode or "").lower().strip() == "live" else "test"

    if not key_id or not key_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Both Key ID and Key Secret are required.")
    # These values are written into .env one per line; a line break would let
    # a value smuggle in extra settings.
    if any(ch in value for value in (key_id, key_secret, webhook_secret) for ch in ("\r", "\n")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Keys cannot contain line breaks.")

    # 1. Test credentials with Razorpay API
    test_client = build_client(key_id, key_secret)
    reachable = False
    warning_error = None
    try:
        test_client.payment.all({"count": 1})
        reachable = True
    except BadRequestError:
        warning_error = MSG_BAD_KEYS
        logger.warning("Razorpay rejected the keys being connected.", exc_info=True)
    except Exception:
        warning_error = MSG_UNREACHABLE
        logger.warning("Could not reach Razorpay while connecting.", exc_info=True)

    # 2. Update .env file on disk
    from pathlib import Path

    from backend.config import get_settings
    from backend.services.razorpay_service import reset_razorpay_service

    env_path = Path(".env")
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    updates = {
        "RAZORPAY_KEY_ID": key_id,
        "RAZORPAY_KEY_SECRET": key_secret,
        "RAZORPAY_MODE": mode,
    }
    if webhook_secret:
        # Leave the existing webhook secret untouched when none is supplied,
        # rather than falling back to a hardcoded value known to anyone who
        # reads the source.
        updates["RAZORPAY_WEBHOOK_SECRET"] = webhook_secret
    updated_keys = set()
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            k, _, _ = line.partition("=")
            k_clean = k.strip()
            if k_clean in updates:
                new_lines.append(f"{k_clean}={updates[k_clean]}")
                updated_keys.add(k_clean)
                continue
        new_lines.append(line)

    for k, v in updates.items():
        if k not in updated_keys:
            new_lines.append(f"{k}={v}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")

    # 3. Reload settings and reset service instance
    get_settings.cache_clear()
    reset_razorpay_service()

    service = get_razorpay_service()
    status_payload = service.get_status()

    mode_note = f"mode={mode}, key_id={service.settings.razorpay_key_id_masked}"
    result = _connect_response(reachable, mode, warning_error, status_payload)
    result["audit_summary"] = f"Configured Razorpay credentials ({mode_note})"
    return result


def _connect_response(reachable: bool, mode: str, warning_error: Optional[str], status_payload: Dict[str, Any]) -> Dict[str, Any]:
    if not reachable and mode == "live":
        return {
            "success": False,
            "connected": False,
            "reachable": False,
            "message": f"Credentials saved, but Razorpay live connection failed: {warning_error} Please check Key ID and Secret in Razorpay Dashboard.",
            "status": status_payload,
        }

    return {
        "success": True,
        "connected": True,
        "reachable": reachable,
        "message": "Razorpay successfully connected (Live API Verified)!"
        if reachable
        else "Razorpay credentials saved and connected (Test sandbox active).",
        "status": status_payload,
    }


def disconnect_credentials() -> Dict[str, Any]:
    """Clear Razorpay credentials from .env and deactivate connection."""
    from pathlib import Path

    from backend.config import get_settings
    from backend.services.razorpay_service import reset_razorpay_service

    env_path = Path(".env")
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    updates = {
        "RAZORPAY_KEY_ID": "",
        "RAZORPAY_KEY_SECRET": "",
    }
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in line:
            k, _, _ = line.partition("=")
            k_clean = k.strip()
            if k_clean in updates:
                new_lines.append(f"{k_clean}=")
                continue
        new_lines.append(line)

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    get_settings.cache_clear()
    reset_razorpay_service()

    service = get_razorpay_service()
    return {"success": True, "connected": False, "message": "Razorpay disconnected successfully.", "status": service.get_status()}
