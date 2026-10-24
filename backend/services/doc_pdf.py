"""PDF for quotes, sales orders, credit notes, purchase orders and vendor credits."""

from __future__ import annotations

import io
from typing import List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle

from backend.models import Organization
from backend.schemas.documents_flow import DocumentOut
from backend.services.export_service import Paragraph, _fmt_curr, _fmt_date, _text

_SECOND_DATE_LABELS = {"expiry_date": "Valid until", "shipment_date": "Expected shipment", "delivery_date": "Expected delivery"}


def generate_document_pdf(doc: DocumentOut, title: str, org: Optional[Organization] = None) -> bytes:
    buffer = io.BytesIO()
    pdf = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("DocTitle", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=20, textColor=colors.HexColor("#0f172a"))
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#334155"))
    label = ParagraphStyle("Label", parent=small, fontName="Helvetica-Bold", textColor=colors.HexColor("#475569"))

    story: List = []
    org_lines = [f"<b>{_text(org.legal_name or org.name)}</b>"] if org else []
    if org:
        org_lines += [_text(x) for x in (org.address, ", ".join(p for p in (org.city, org.state, org.postal_code) if p)) if x]
        if org.gstin:
            org_lines.append(f"GSTIN: {_text(org.gstin)}")
    header = Table(
        [[Paragraph("<br/>".join(org_lines), small), Paragraph(_text(title.upper()), h1)]],
        colWidths=[300, 223],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story += [header, Spacer(1, 12)]

    meta = [
        [Paragraph("Number", label), Paragraph(_text(doc.number), small)],
        [Paragraph("Date", label), Paragraph(_fmt_date(doc.date), small)],
    ]
    for attr, text in _SECOND_DATE_LABELS.items():
        if getattr(doc, attr):
            meta.append([Paragraph(text, label), Paragraph(_fmt_date(getattr(doc, attr)), small)])
    for text, value in (
        ("Reference", doc.reference),
        ("Against invoice", doc.invoice_number),
        ("Against bill", doc.bill_number),
        ("Reason", doc.reason),
    ):
        if value:
            meta.append([Paragraph(text, label), Paragraph(_text(value), small)])
    party = [f"<b>{_text(doc.contact_name)}</b>"]
    if doc.contact_billing_address:
        party.append(_text(doc.contact_billing_address).replace("\n", "<br/>"))
    if doc.contact_gstin:
        party.append(f"GSTIN: {_text(doc.contact_gstin)}")
    top = Table([[Paragraph("<br/>".join(party), small), Table(meta, colWidths=[90, 120])]], colWidths=[313, 210])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [top, Spacer(1, 10)]
    if doc.subject:
        story += [Paragraph(f"<b>Subject:</b> {_text(doc.subject)}", small), Spacer(1, 8)]

    rows = [["#", "Item & description", "Qty", "Rate", "GST %", "Amount"]]
    for i, line in enumerate(doc.lines, start=1):
        name = _text(line.item_name or "")
        desc = _text(line.description or "")
        cell = f"<b>{name}</b><br/>{desc}" if name and name != desc else desc
        rows.append(
            [
                str(i),
                Paragraph(cell, small),
                f"{float(line.quantity):g}",
                _fmt_curr(line.rate),
                f"{float(line.tax_rate):g}",
                _fmt_curr(line.amount),
            ]
        )
    lines = Table(rows, colWidths=[22, 221, 50, 80, 45, 105], repeatRows=1)
    lines.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#cbd5e1")),
            ]
        )
    )
    story += [lines, Spacer(1, 8)]

    sums = [["Sub total", _fmt_curr(doc.subtotal)]]
    if doc.discount_amount:
        sums.append(["Discount", f"- {_fmt_curr(doc.discount_amount)}"])
    sums += [["GST", _fmt_curr(doc.tax_total)], ["Total", _fmt_curr(doc.total)]]
    if doc.balance is not None:
        sums += [
            ["Credits used", _fmt_curr(doc.amount_applied)],
            ["Refunded", _fmt_curr(doc.amount_refunded)],
            ["Credits remaining", _fmt_curr(doc.balance)],
        ]
    totals = Table(sums, colWidths=[120, 105], hAlign="RIGHT")
    totals.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, 3 if doc.discount_amount else 2), (-1, 3 if doc.discount_amount else 2), "Helvetica-Bold"),
                ("LINEABOVE", (0, 3 if doc.discount_amount else 2), (-1, 3 if doc.discount_amount else 2), 0.5, colors.HexColor("#0f172a")),
            ]
        )
    )
    story += [totals, Spacer(1, 14)]
    for heading, text in (("Notes", doc.notes), ("Terms & conditions", doc.terms)):
        if text:
            story += [Paragraph(f"<b>{heading}</b>", small), Paragraph(_text(text).replace("\n", "<br/>"), small), Spacer(1, 8)]
    pdf.build(story)
    return buffer.getvalue()
