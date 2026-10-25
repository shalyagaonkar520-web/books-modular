"""UPI pay-by-QR: the upi:// link any UPI app (GPay, PhonePe, Paytm, BHIM...) opens
with the payee, amount and invoice number filled in, as a QR code."""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
from urllib.parse import quote

from reportlab.graphics import renderSVG
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing


def pay_uri(upi_id: str, payee: str, amount: Optional[Decimal], note: str) -> str:
    params = [("pa", upi_id), ("pn", payee[:50]), ("cu", "INR"), ("tn", note[:80])]
    if amount is not None and amount > 0:
        params.insert(2, ("am", f"{Decimal(amount):.2f}"))
    return "upi://pay?" + "&".join(f"{k}={quote(str(v), safe='@.')}" for k, v in params)


def qr_drawing(text: str, size: float = 110) -> Drawing:
    widget = QrCodeWidget(text, barLevel="M")
    x0, y0, x1, y1 = widget.getBounds()
    width, height = x1 - x0, y1 - y0
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(widget)
    return drawing


def qr_svg(text: str, size: float = 220) -> str:
    return renderSVG.drawToString(qr_drawing(text, size))
