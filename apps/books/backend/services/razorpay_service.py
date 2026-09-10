"""Razorpay gateway integration service.

Handles server-side order generation, payment verification, webhook signatures,
refund management and paginated retrieval of payments and refunds. The secret
key is read from the environment and never leaves this process: nothing here
returns it, logs it, or includes it in an API response.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from decimal import Decimal
from typing import Any, Dict, Iterator, List, Optional, Tuple

import razorpay
from razorpay.errors import BadRequestError, GatewayError, ServerError, SignatureVerificationError

from backend.config import get_settings

logger = logging.getLogger("roomanbooks.razorpay")

# Razorpay caps a single listing page at 100 items.
MAX_PAGE_SIZE = 100


class RazorpayNotConfigured(RuntimeError):
    """Raised when an operation needs credentials that were never supplied."""


class RazorpayUnavailable(RuntimeError):
    """Raised when Razorpay could not be reached or refused the request."""


class RazorpayService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.key_id = self.settings.razorpay_key_id
        self.key_secret = self.settings.razorpay_key_secret
        self.webhook_secret = self.settings.razorpay_webhook_secret
        self.mode = self.settings.razorpay_mode
        # The SDK is constructed even without credentials so that the module
        # imports cleanly; every call checks `is_configured` first.
        self.client = razorpay.Client(auth=(self.key_id, self.key_secret))

    # ------------------------------------------------------------------ #
    # Configuration
    # ------------------------------------------------------------------ #
    @property
    def is_configured(self) -> bool:
        return self.settings.razorpay_configured

    @property
    def allows_simulation(self) -> bool:
        """Offline order/refund simulation is a local development aid only.

        It is never enabled in production, and never on the sync path -- imported
        transactions always come from the real Razorpay API.
        """
        return self.settings.razorpay_allows_simulation

    def _require_configured(self) -> None:
        if not self.is_configured:
            raise RazorpayNotConfigured(
                "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server environment."
            )

    def get_public_config(self) -> Dict[str, Any]:
        """Returns safe frontend config. NEVER includes key_secret."""
        return {
            "key_id": self.key_id,
            "mode": self.mode,
            "currency": "INR",
            "name": self.settings.app_name,
        }

    def get_status(self) -> Dict[str, Any]:
        """Connection status for the integrations screen. Secret-free by construction."""
        configured = self.is_configured
        reachable: Optional[bool] = None
        error: Optional[str] = None
        if configured:
            try:
                # A one-item listing is the cheapest authenticated call available.
                self.client.payment.all({"count": 1})
                reachable = True
            except BadRequestError as exc:
                reachable = False
                error = f"Razorpay rejected the credentials: {exc}"
            except (GatewayError, ServerError) as exc:
                reachable = False
                error = f"Razorpay is unavailable right now: {exc}"
            except Exception as exc:  # network failures, timeouts
                reachable = False
                error = f"Could not reach Razorpay: {exc}"
        is_connected = bool(configured and (reachable or self.allows_simulation))
        return {
            "configured": configured,
            "connected": is_connected,
            "reachable": reachable,
            "allows_simulation": self.allows_simulation,
            "mode": self.mode,
            "key_id_masked": self.settings.razorpay_key_id_masked,
            "webhook_configured": bool(self.webhook_secret),
            "error": error,
        }

    # ------------------------------------------------------------------ #
    # Checkout
    # ------------------------------------------------------------------ #
    def create_order(
        self,
        amount_inr: Decimal,
        receipt: str,
        notes: Optional[Dict[str, Any]] = None,
        currency: str = "INR",
    ) -> Dict[str, Any]:
        """Create a Razorpay order. Amount is provided in INR and converted to paise."""
        amount_paise = int(round(Decimal(str(amount_inr)) * 100))
        payload = {
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt[:40],
            "notes": notes or {},
            "payment_capture": 1,
        }
        try:
            self._require_configured()
            return self.client.order.create(payload)
        except Exception as exc:
            logger.warning("Razorpay order API call failed (%s).", exc)
            if self.allows_simulation:
                # Local development without live credentials: simulate the order
                # so the checkout screen can still be exercised offline.
                logger.info("Development mode: returning a simulated order.")
                return {
                    "id": f"order_{uuid.uuid4().hex[:14]}",
                    "entity": "order",
                    "amount": amount_paise,
                    "currency": currency,
                    "receipt": receipt,
                    "status": "created",
                    "notes": notes or {},
                    "simulated": True,
                }
            raise

    def verify_payment_signature(self, order_id: str, payment_id: str, signature: str) -> bool:
        """Verify a Razorpay checkout callback signature using HMAC SHA256."""
        if not signature or not order_id or not payment_id:
            return False

        if self.allows_simulation and (signature.startswith("test_sig_") or order_id.startswith("order_test_")):
            return True

        if self.is_configured:
            try:
                self.client.utility.verify_payment_signature(
                    {
                        "razorpay_order_id": order_id,
                        "razorpay_payment_id": payment_id,
                        "razorpay_signature": signature,
                    }
                )
                return True
            except SignatureVerificationError:
                pass
            except Exception as exc:
                logger.debug("SDK signature verification exception: %s", exc)

            expected = hmac.new(
                self.key_secret.encode("utf-8"), f"{order_id}|{payment_id}".encode(), hashlib.sha256
            ).hexdigest()
            if hmac.compare_digest(expected, signature):
                return True

        # Development fallback only: never reachable in production, and never
        # reachable in live mode.
        if self.allows_simulation and len(signature) >= 10:
            logger.info("Development mode: accepted unverified checkout signature for %s.", payment_id)
            return True

        return False

    def verify_webhook_signature(self, body_bytes: bytes, signature: str) -> bool:
        """Verify a webhook body against the X-Razorpay-Signature header.

        There is no development bypass that works without a webhook secret: an
        unsigned or wrongly signed request is always rejected.
        """
        if not signature or not self.webhook_secret:
            return False

        try:
            self.client.utility.verify_webhook_signature(
                body_bytes.decode("utf-8"), signature, self.webhook_secret
            )
            return True
        except Exception:
            pass

        expected = hmac.new(self.webhook_secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ------------------------------------------------------------------ #
    # Retrieval
    # ------------------------------------------------------------------ #
    def fetch_payment(self, payment_id: str) -> Optional[Dict[str, Any]]:
        """Fetch one payment. Returns None when it cannot be retrieved."""
        if not self.is_configured:
            return None
        try:
            return self.client.payment.fetch(payment_id)
        except Exception as exc:
            logger.info("Could not fetch payment %s from Razorpay (%s)", payment_id, exc)
            return None

    def fetch_payments_page(self, options: Dict[str, Any]) -> List[Dict[str, Any]]:
        """One page of payments. Raises :class:`RazorpayUnavailable` on failure."""
        self._require_configured()
        try:
            response = self.client.payment.all(options)
        except BadRequestError as exc:
            raise RazorpayUnavailable(f"Razorpay rejected the request: {exc}") from exc
        except (GatewayError, ServerError) as exc:
            raise RazorpayUnavailable(f"Razorpay is temporarily unavailable: {exc}") from exc
        except Exception as exc:
            raise RazorpayUnavailable(f"Could not reach Razorpay: {exc}") from exc
        return list(response.get("items") or [])

    def iter_payments(
        self,
        from_ts: Optional[int] = None,
        to_ts: Optional[int] = None,
        page_size: int = MAX_PAGE_SIZE,
        max_pages: int = 500,
    ) -> Iterator[Tuple[int, List[Dict[str, Any]]]]:
        """Yield ``(page_number, payments)`` walking Razorpay's skip/count pages.

        Stops at the first short page, which is Razorpay's end-of-collection
        signal. ``max_pages`` is a guard against an unbounded loop if the API
        ever keeps returning full pages.
        """
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))
        skip = 0
        for page in range(1, max_pages + 1):
            options: Dict[str, Any] = {"count": page_size, "skip": skip}
            if from_ts is not None:
                options["from"] = int(from_ts)
            if to_ts is not None:
                options["to"] = int(to_ts)
            items = self.fetch_payments_page(options)
            yield page, items
            if len(items) < page_size:
                return
            skip += page_size

    def iter_refunds(
        self,
        from_ts: Optional[int] = None,
        to_ts: Optional[int] = None,
        page_size: int = MAX_PAGE_SIZE,
        max_pages: int = 200,
    ) -> Iterator[List[Dict[str, Any]]]:
        """Yield pages of refunds across the whole account."""
        self._require_configured()
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))
        skip = 0
        for _ in range(max_pages):
            options: Dict[str, Any] = {"count": page_size, "skip": skip}
            if from_ts is not None:
                options["from"] = int(from_ts)
            if to_ts is not None:
                options["to"] = int(to_ts)
            try:
                response = self.client.refund.all(options)
            except (GatewayError, ServerError) as exc:
                raise RazorpayUnavailable(f"Razorpay is temporarily unavailable: {exc}") from exc
            except Exception as exc:
                raise RazorpayUnavailable(f"Could not list refunds: {exc}") from exc
            items = list(response.get("items") or [])
            yield items
            if len(items) < page_size:
                return
            skip += page_size

    # ------------------------------------------------------------------ #
    # Money helpers
    # ------------------------------------------------------------------ #
    def calculate_fees_and_settlement(
        self,
        gross_amount_inr: Decimal,
        payment_info: Optional[Dict[str, Any]] = None,
    ) -> Tuple[Decimal, Decimal, Decimal]:
        """Compute ``(fee, tax_on_fee, net_settlement)`` in INR.

        Uses Razorpay's reported fee when the payment carries one, and otherwise
        estimates the standard 2% gateway fee plus 18% GST.
        """
        gross = Decimal(str(gross_amount_inr))
        if payment_info and payment_info.get("fee") is not None:
            fee_inr = (Decimal(str(payment_info.get("fee", 0))) / Decimal("100")).quantize(Decimal("0.01"))
            tax_inr = (Decimal(str(payment_info.get("tax") or 0)) / Decimal("100")).quantize(Decimal("0.01"))
            return fee_inr, tax_inr, gross - fee_inr - tax_inr

        fee_inr = (gross * Decimal("0.02")).quantize(Decimal("0.01"))
        tax_inr = (fee_inr * Decimal("0.18")).quantize(Decimal("0.01"))
        return fee_inr, tax_inr, (gross - fee_inr - tax_inr).quantize(Decimal("0.01"))

    def initiate_refund(
        self,
        payment_id: str,
        amount_inr: Decimal,
        notes: Optional[Dict[str, Any]] = None,
        speed: str = "normal",
    ) -> Dict[str, Any]:
        """Initiate a refund through Razorpay."""
        amount_paise = int(round(Decimal(str(amount_inr)) * 100))
        payload = {"amount": amount_paise, "speed": speed, "notes": notes or {}}
        try:
            self._require_configured()
            return self.client.payment.refund(payment_id, payload)
        except Exception as exc:
            logger.warning("Razorpay refund API call failed (%s).", exc)
            if self.allows_simulation:
                return {
                    "id": f"rfnd_{uuid.uuid4().hex[:14]}",
                    "entity": "refund",
                    "amount": amount_paise,
                    "currency": "INR",
                    "payment_id": payment_id,
                    "status": "processed",
                    "speed": speed,
                    "notes": notes or {},
                    "simulated": True,
                }
            raise


_service_instance: Optional[RazorpayService] = None


def get_razorpay_service() -> RazorpayService:
    global _service_instance
    if _service_instance is None:
        _service_instance = RazorpayService()
    return _service_instance


def reset_razorpay_service() -> None:
    """Drop the cached client so new environment settings take effect (tests)."""
    global _service_instance
    _service_instance = None
