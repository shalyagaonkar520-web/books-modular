"""GST compliance: GSTR-1, GSTR-3B, TDS / TCS register, e-invoice and e-way bill."""

from __future__ import annotations

import io
import json
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.deps import get_current_user, module_write_error, require_financial_read, require_write
from backend.models import Invoice, User
from backend.schemas.common import APIModel
from backend.services import audit, export_service, gst_returns
from backend.services.periods import month_bounds
from backend.services.tenancy import get_or_404

router = APIRouter(prefix="/api/gst", tags=["GST"])


def _period(start: Optional[date], end: Optional[date]):
    """Default: the previous calendar month, the usual return period."""
    if start and end:
        if start > end:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The start date cannot be after the end date")
        return start, end
    today = date.today()
    year, month = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    return month_bounds(year, month)


def _json_file(payload: dict, filename: str) -> Response:
    return Response(
        content=json.dumps(payload, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _xlsx(sheets: dict, filename: str) -> Response:
    """sheets: {title: (header, rows)}"""
    wb = Workbook()
    wb.remove(wb.active)
    for title, (header, rows) in sheets.items():
        ws = wb.create_sheet(title[:31])
        ws.append(header)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    # export_service._save stores text starting with = + - @ as text, never as a formula.
    export_service._save(wb, buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _gstr1_sheets(data: dict) -> dict:
    j = data["json"]
    b2b = [
        [
            c["ctin"],
            i["inum"],
            i["idt"],
            i["val"],
            i["pos"],
            i["inv_typ"],
            it["itm_det"]["rt"],
            it["itm_det"]["txval"],
            it["itm_det"].get("iamt", 0),
            it["itm_det"].get("camt", 0),
            it["itm_det"].get("samt", 0),
        ]
        for c in j["b2b"]
        for i in c["inv"]
        for it in i["itms"]
    ]
    b2cl = [
        [g["pos"], i["inum"], i["idt"], i["val"], it["itm_det"]["rt"], it["itm_det"]["txval"], it["itm_det"]["iamt"]]
        for g in j["b2cl"]
        for i in g["inv"]
        for it in i["itms"]
    ]
    b2cs = [[r["sply_ty"], r["pos"], r["rt"], r["txval"], r["iamt"], r["camt"], r["samt"]] for r in j["b2cs"]]
    cdnr = [
        [
            c["ctin"],
            n["nt_num"],
            n["nt_dt"],
            n["val"],
            n["pos"],
            it["itm_det"]["rt"],
            it["itm_det"]["txval"],
            it["itm_det"].get("iamt", 0),
            it["itm_det"].get("camt", 0),
            it["itm_det"].get("samt", 0),
        ]
        for c in j["cdnr"]
        for n in c["nt"]
        for it in n["itms"]
    ]
    hsn = [
        [t, r["hsn_sc"], r["uqc"], r["qty"], r["rt"], r["txval"], r["iamt"], r["camt"], r["samt"]]
        for t in ("hsn_b2b", "hsn_b2c")
        for r in j["hsn"][t]
    ]
    tax_head = ["Rate", "Taxable value", "IGST", "CGST", "SGST"]
    return {
        "b2b": (
            ["GSTIN of recipient", "Invoice number", "Invoice date", "Invoice value", "Place of supply", "Invoice type", *tax_head],
            b2b,
        ),
        "b2cl": (["Place of supply", "Invoice number", "Invoice date", "Invoice value", "Rate", "Taxable value", "IGST"], b2cl),
        "b2cs": (["Supply type", "Place of supply", *tax_head], b2cs),
        "cdnr": (["GSTIN of recipient", "Note number", "Note date", "Note value", "Place of supply", *tax_head], cdnr),
        "hsn": (["Table", "HSN/SAC", "UQC", "Quantity", *tax_head], hsn),
    }


@router.get("/gstr1")
def gstr1(
    start_date: Optional[date] = Query(None, alias="startDate"),
    end_date: Optional[date] = Query(None, alias="endDate"),
    format: str = Query("summary", pattern="^(summary|json|xlsx)$"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    """GSTR-1. format=summary for the screen, json for the GST offline tool, xlsx for review."""
    start, end = _period(start_date, end_date)
    data = gst_returns.gstr1(db, user.organization_id, start, end)
    if format == "json":
        return _json_file(data["json"], f"GSTR1_{data['json']['fp']}.json")
    if format == "xlsx":
        return _xlsx(_gstr1_sheets(data), f"GSTR1_{end.strftime('%m%Y')}.xlsx")
    return data


@router.get("/gstr3b")
def gstr3b(
    start_date: Optional[date] = Query(None, alias="startDate"),
    end_date: Optional[date] = Query(None, alias="endDate"),
    format: str = Query("summary", pattern="^(summary|json)$"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    start, end = _period(start_date, end_date)
    data = gst_returns.gstr3b(db, user.organization_id, start, end)
    if format == "json":
        return _json_file(data, f"GSTR3B_{end.strftime('%m%Y')}.json")
    return data


@router.get("/tds-register")
def tds_register(
    start_date: Optional[date] = Query(None, alias="startDate"),
    end_date: Optional[date] = Query(None, alias="endDate"),
    format: str = Query("summary", pattern="^(summary|xlsx)$"),
    user: User = Depends(require_financial_read),
    db: Session = Depends(get_db),
):
    start, end = _period(start_date, end_date)
    data = gst_returns.tds_register(db, user.organization_id, start, end)
    if format == "xlsx":
        return _xlsx(
            {
                "TDS": (
                    ["Date", "Bill", "Vendor", "PAN", "Section", "Rate %", "Taxable", "TDS"],
                    [
                        [r["date"], r["billNumber"], r["vendorName"], r["vendorPan"], r["section"], r["rate"], r["taxable"], r["tds"]]
                        for r in data["tds"]
                    ],
                ),
                "TCS": (
                    ["Date", "Invoice", "Customer", "PAN", "Rate %", "TCS"],
                    [[r["date"], r["invoiceNumber"], r["customerName"], r["customerPan"], r["rate"], r["tcs"]] for r in data["tcs"]],
                ),
            },
            f"TDS_TCS_{start.isoformat()}_{end.isoformat()}.xlsx",
        )
    return data


@router.get("/invoices/{invoice_id}/einvoice")
def einvoice(invoice_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The invoice as IRP e-invoice JSON (schema 1.1), to upload or send through a GSP."""
    payload = gst_returns.einvoice_json(db, user.organization_id, invoice_id)
    return _json_file(payload, f"EINV_{payload['DocDtls']['No']}.json")


@router.get("/invoices/{invoice_id}/eway-bill")
def eway_bill(
    invoice_id: str,
    trans_mode: str = Query("1", alias="transMode", pattern="^[1-4]$"),
    distance: int = Query(0, ge=0, le=4000),
    vehicle_no: Optional[str] = Query(None, alias="vehicleNo", max_length=15),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The invoice as e-way bill bulk-upload JSON."""
    payload = gst_returns.eway_json(db, user.organization_id, invoice_id, trans_mode, distance, vehicle_no)
    return _json_file(payload, f"EWB_{payload['billLists'][0]['docNo']}.json")


class GstRegistration(APIModel):
    irn: Optional[str] = None
    irn_ack_no: Optional[str] = None
    irn_ack_date: Optional[datetime] = None
    eway_bill_no: Optional[str] = None


@router.put("/invoices/{invoice_id}/registration", response_model=GstRegistration)
def record_registration(invoice_id: str, payload: GstRegistration, user: User = Depends(require_write), db: Session = Depends(get_db)):
    """Record the IRN / acknowledgement and e-way bill number the portals returned."""
    error = module_write_error(user, ("invoices",))
    if error:
        raise HTTPException(status.HTTP_403_FORBIDDEN, error)
    inv = get_or_404(db, Invoice, invoice_id, user.organization_id, "Invoice")
    if inv.status in ("draft", "void"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {inv.status} invoice cannot carry an IRN")
    irn = (payload.irn or "").strip() or None
    if irn and len(irn) != 64:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An IRN is 64 characters long")
    inv.irn = irn
    inv.irn_ack_no = (payload.irn_ack_no or "").strip() or None
    inv.irn_ack_date = payload.irn_ack_date
    inv.eway_bill_no = (payload.eway_bill_no or "").strip() or None
    audit.record(
        db,
        user,
        "update",
        "invoice",
        inv.id,
        f"GST registration for {inv.invoice_number}: IRN {'set' if irn else 'cleared'}, e-way bill {inv.eway_bill_no or '-'}",
    )
    db.commit()
    return GstRegistration(irn=inv.irn, irn_ack_no=inv.irn_ack_no, irn_ack_date=inv.irn_ack_date, eway_bill_no=inv.eway_bill_no)
