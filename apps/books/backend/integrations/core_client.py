"""Books -> Core service API (private network only).

Books authenticates as itself with the OAuth client-credentials grant
(CORE_CLIENT_ID / CORE_CLIENT_SECRET) and caches the token until shortly
before it expires. Calls use a short timeout and are retried only when Core
answers 5xx. A Books user is never blocked because Core is down: callers catch
``CoreUnavailable`` and try again later.

Ids crossing this boundary are canonical UUIDs; Books' 32-hex ids are
converted by the callers (integrations/events.uuid_of / books_id_of).
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from backend.config import get_settings

logger = logging.getLogger("roomanbooks.integrations.core")

RETRIES_ON_5XX = 2
RETRY_PAUSE_SECONDS = 0.3


class CoreUnavailable(RuntimeError):
    """Core could not be reached, timed out or answered 5xx. Safe to retry later."""


class CoreError(RuntimeError):
    """Core refused the request (4xx). Retrying the same request will not help."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"Core answered {status}: {detail}")
        self.status = status
        self.detail = detail


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: ARG002 - never follow a redirect with our token
        return None


_opener = urllib.request.build_opener(_NoRedirect)


class CoreClient:
    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._token_expires = 0.0
        self._lock = threading.Lock()

    # ------------------------------------------------------------------ #
    # Transport
    # ------------------------------------------------------------------ #
    def _settings(self):
        settings = get_settings()
        if not settings.core_api_url:
            raise CoreUnavailable("CORE_API_URL is not set.")
        return settings

    def _send(self, method: str, url: str, body: Optional[bytes], headers: dict) -> tuple[int, Any]:
        timeout = get_settings().core_timeout_seconds
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with _opener.open(request, timeout=timeout) as response:
                raw = response.read()
                return response.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = None
            return exc.code, payload
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise CoreUnavailable(f"Could not reach Core: {type(exc).__name__}") from exc

    def _token_header(self) -> dict:
        with self._lock:
            if self._token and time.monotonic() < self._token_expires:
                return {"Authorization": f"Bearer {self._token}"}
            settings = self._settings()
            url = settings.core_token_url or settings.core_api_url.rstrip("/") + "/token"
            form = urllib.parse.urlencode(
                {
                    "grant_type": "client_credentials",
                    "client_id": settings.core_client_id,
                    "client_secret": settings.core_client_secret,
                }
            ).encode()
            status, payload = self._send(
                "POST", url, form, {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
            )
            if status >= 500:
                raise CoreUnavailable(f"Core token endpoint answered {status}")
            if status != 200 or not isinstance(payload, dict) or not payload.get("access_token"):
                raise CoreError(status, "Core did not issue a token for Books' client credentials.")
            self._token = payload["access_token"]
            # Renew a minute early so a call never starts with a token about to expire.
            self._token_expires = time.monotonic() + max(30, int(payload.get("expires_in") or 300) - 60)
            return {"Authorization": f"Bearer {self._token}"}

    def _call(self, method: str, path: str, payload: Optional[dict] = None) -> Any:
        settings = self._settings()
        url = settings.core_api_url.rstrip("/") + path
        body = json.dumps(payload).encode() if payload is not None else None
        for attempt in range(RETRIES_ON_5XX + 1):
            headers = {"Accept": "application/json", **self._token_header()}
            if body is not None:
                headers["Content-Type"] = "application/json"
            status, data = self._send(method, url, body, headers)
            if status == 401 and attempt == 0:
                with self._lock:  # token revoked or expired early: fetch a new one once
                    self._token = None
                continue
            if status >= 500:
                if attempt < RETRIES_ON_5XX:
                    time.sleep(RETRY_PAUSE_SECONDS * (attempt + 1))
                    continue
                raise CoreUnavailable(f"Core answered {status} for {method} {path}")
            if status >= 400:
                detail = data.get("detail") if isinstance(data, dict) else None
                raise CoreError(status, str(detail or "request refused"))
            return data
        raise CoreUnavailable(f"Core kept refusing Books' token for {method} {path}")

    # ------------------------------------------------------------------ #
    # Endpoints
    # ------------------------------------------------------------------ #
    def find_or_create_party(
        self, org_id: str, name: str, email: Optional[str], phone: Optional[str], type: str, local_id: Optional[str] = None
    ) -> str:
        """The shared customer record for this contact; returns its party_id.

        Core matches by ``local_id`` (Books' contact id) first, then email, then
        phone, within the organization. The calling app comes from Books' token.
        """
        data = self._call(
            "POST",
            "/internal/parties",
            {"org_id": org_id, "display_name": name, "email": email, "phone": phone, "type": type, "local_id": local_id},
        )
        party_id = (data or {}).get("party_id") or (data or {}).get("id")
        if not party_id:
            raise CoreError(200, "Core did not return a party id.")
        return str(party_id)

    def update_party(self, party_id: str, *, org_id: str, name: str, email: Optional[str], phone: Optional[str], type: str) -> None:
        self._call(
            "PATCH",
            f"/internal/parties/{party_id}",
            {"org_id": org_id, "display_name": name, "email": email, "phone": phone, "type": type},
        )

    def get_entitlements(self, org_id: str) -> dict:
        return self._call("GET", f"/internal/orgs/{org_id}/entitlements") or {}


_client: Optional[CoreClient] = None


def core() -> CoreClient:
    global _client
    if _client is None:
        _client = CoreClient()
    return _client
