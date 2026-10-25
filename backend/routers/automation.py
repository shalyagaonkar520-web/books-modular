"""Custom fields, workflow rules, approvals, document branding and scheduled reports."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.db import get_db
from backend.deps import get_current_user, require_admin, require_write
from backend.models import Bill, CustomField, CustomFieldValue, Invoice, Organization, ReportSchedule, User, WorkflowRule, WorkflowRun
from backend.schemas.common import MAX_MONEY, APIModel, Message
from backend.services import approvals, audit, report_schedules, workflows
from backend.services.money import money
from backend.services.tenancy import get_or_404

custom_fields_router = APIRouter(prefix="/api/custom-fields", tags=["Automation"])
workflow_router = APIRouter(prefix="/api/workflow-rules", tags=["Automation"])
approvals_router = APIRouter(prefix="/api/approvals", tags=["Automation"])
branding_router = APIRouter(prefix="/api/document-branding", tags=["Automation"])
schedules_router = APIRouter(prefix="/api/report-schedules", tags=["Automation"])

ENTITY_TYPES = (
    "invoice",
    "bill",
    "estimate",
    "sales_order",
    "purchase_order",
    "credit_note",
    "vendor_credit",
    "contact",
    "item",
    "expense",
)
FIELD_TYPES = ("text", "number", "date", "select", "checkbox")


# --------------------------------------------------------------------------- #
# Custom fields
# --------------------------------------------------------------------------- #
class CustomFieldIn(APIModel):
    entity: Literal[
        "invoice", "bill", "estimate", "sales_order", "purchase_order", "credit_note", "vendor_credit", "contact", "item", "expense"
    ]
    label: str = Field(min_length=1, max_length=80)
    field_type: Literal["text", "number", "date", "select", "checkbox"] = "text"
    options: List[str] = []
    required: bool = False
    show_on_pdf: bool = False
    position: int = 0
    is_active: bool = True


class CustomFieldOut(CustomFieldIn):
    id: str
    key: str


class FieldValues(APIModel):
    values: Dict[str, Any]


def _field_out(f: CustomField) -> CustomFieldOut:
    return CustomFieldOut(
        id=f.id,
        key=f.key,
        entity=f.entity,
        label=f.label,
        field_type=f.field_type,
        options=json.loads(f.options or "[]"),
        required=f.required,
        show_on_pdf=f.show_on_pdf,
        position=f.position,
        is_active=f.is_active,
    )


def _key(label: str) -> str:
    key = "".join(ch if ch.isalnum() else "_" for ch in label.lower()).strip("_")
    while "__" in key:
        key = key.replace("__", "_")
    return key[:40] or "field"


def _coerce(field: CustomField, raw: Any) -> Optional[str]:
    if raw in (None, ""):
        if field.required:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field.label} is required")
        return None
    if field.field_type == "number":
        try:
            return str(Decimal(str(raw)))
        except Exception as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field.label} must be a number") from exc
    if field.field_type == "date":
        try:
            return date.fromisoformat(str(raw)).isoformat()
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field.label} must be a date") from exc
    if field.field_type == "checkbox":
        return "true" if str(raw).lower() in ("true", "1", "yes") else "false"
    if field.field_type == "select" and str(raw) not in json.loads(field.options or "[]"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field.label}: choose one of the listed options")
    text = str(raw).strip()
    if len(text) > 500:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{field.label} is too long")
    return text


@custom_fields_router.get("", response_model=List[CustomFieldOut])
def list_fields(entity: Optional[str] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(CustomField).where(CustomField.organization_id == user.organization_id)
    if entity:
        stmt = stmt.where(CustomField.entity == entity)
    return [_field_out(f) for f in db.execute(stmt.order_by(CustomField.entity, CustomField.position, CustomField.label)).scalars()]


@custom_fields_router.post("", response_model=CustomFieldOut, status_code=status.HTTP_201_CREATED)
def create_field(payload: CustomFieldIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.field_type == "select" and not payload.options:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A dropdown field needs at least one option")
    key = _key(payload.label)
    taken = set(
        db.execute(
            select(CustomField.key).where(CustomField.organization_id == user.organization_id, CustomField.entity == payload.entity)
        ).scalars()
    )
    base, n = key, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1
    f = CustomField(
        organization_id=user.organization_id,
        entity=payload.entity,
        key=key,
        label=payload.label,
        field_type=payload.field_type,
        options=json.dumps(payload.options),
        required=payload.required,
        show_on_pdf=payload.show_on_pdf,
        position=payload.position,
        is_active=payload.is_active,
    )
    db.add(f)
    db.flush()
    audit.record(db, user, "create", "custom_field", f.id, f"Added custom field '{f.label}' on {f.entity}")
    db.commit()
    return _field_out(f)


@custom_fields_router.put("/{field_id}", response_model=CustomFieldOut)
def update_field(field_id: str, payload: CustomFieldIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    f = get_or_404(db, CustomField, field_id, user.organization_id, "Custom field")
    if payload.entity != f.entity or payload.field_type != f.field_type:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A field's record type and kind cannot change; add a new field instead")
    f.label, f.options, f.required = payload.label, json.dumps(payload.options), payload.required
    f.show_on_pdf, f.position, f.is_active = payload.show_on_pdf, payload.position, payload.is_active
    audit.record(db, user, "update", "custom_field", f.id, f"Updated custom field '{f.label}'")
    db.commit()
    return _field_out(f)


@custom_fields_router.delete("/{field_id}", response_model=Message)
def delete_field(field_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    f = get_or_404(db, CustomField, field_id, user.organization_id, "Custom field")
    label = f.label
    db.delete(f)
    audit.record(db, user, "delete", "custom_field", field_id, f"Deleted custom field '{label}' and its values")
    db.commit()
    return Message(message=f"Field '{label}' deleted")


@custom_fields_router.get("/values/{entity}/{entity_id}", response_model=FieldValues)
def get_values(entity: str, entity_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(CustomFieldValue, CustomField)
        .join(CustomField, CustomField.id == CustomFieldValue.field_id)
        .where(
            CustomFieldValue.organization_id == user.organization_id, CustomFieldValue.entity_id == entity_id, CustomField.entity == entity
        )
    ).all()
    return FieldValues(values={f.key: v.value for v, f in rows})


@custom_fields_router.put("/values/{entity}/{entity_id}", response_model=FieldValues)
def set_values(entity: str, entity_id: str, payload: FieldValues, user: User = Depends(require_write), db: Session = Depends(get_db)):
    if entity not in ENTITY_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown record type")
    fields = {
        f.key: f
        for f in db.execute(
            select(CustomField).where(
                CustomField.organization_id == user.organization_id, CustomField.entity == entity, CustomField.is_active.is_(True)
            )
        ).scalars()
    }
    unknown = set(payload.values) - set(fields)
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown field(s): {', '.join(sorted(unknown))}")
    for key, field in fields.items():
        if key not in payload.values and not field.required:
            continue
        value = _coerce(field, payload.values.get(key))
        row = db.execute(
            select(CustomFieldValue).where(CustomFieldValue.field_id == field.id, CustomFieldValue.entity_id == entity_id)
        ).scalar_one_or_none()
        if value is None:
            if row:
                db.delete(row)
            continue
        if row is None:
            db.add(CustomFieldValue(organization_id=user.organization_id, field_id=field.id, entity_id=entity_id, value=value))
        else:
            row.value = value
    db.commit()
    return get_values(entity, entity_id, user, db)


# --------------------------------------------------------------------------- #
# Workflow rules
# --------------------------------------------------------------------------- #
class Condition(APIModel):
    field: str = Field(min_length=1, max_length=60)
    operator: Literal["equals", "not_equals", "greater_than", "less_than", "contains", "is_empty", "is_not_empty"] = "equals"
    value: Optional[str] = Field(default=None, max_length=200)


class Action(APIModel):
    type: Literal["email", "webhook"]
    to: Optional[str] = Field(default=None, max_length=300)
    subject: Optional[str] = Field(default=None, max_length=200)
    message: Optional[str] = Field(default=None, max_length=2000)
    url: Optional[str] = Field(default=None, max_length=500)


class RuleIn(APIModel):
    name: str = Field(min_length=1, max_length=120)
    event: str
    conditions: List[Condition] = []
    actions: List[Action] = Field(min_length=1)
    is_active: bool = True

    @field_validator("event")
    @classmethod
    def _event(cls, value: str) -> str:
        if value not in workflows.event_names():
            raise ValueError("Unknown event")
        return value


class RuleOut(RuleIn):
    id: str
    run_count: int
    last_run_at: Optional[datetime] = None


class RunOut(APIModel):
    id: str
    event: str
    entity_type: str
    entity_id: Optional[str] = None
    status: str
    attempts: int
    error: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None


def _rule_out(r: WorkflowRule) -> RuleOut:
    return RuleOut(
        id=r.id,
        name=r.name,
        event=r.event,
        conditions=json.loads(r.conditions or "[]"),
        actions=json.loads(r.actions or "[]"),
        is_active=r.is_active,
        run_count=r.run_count or 0,
        last_run_at=r.last_run_at,
    )


def _check_rule(payload: RuleIn) -> None:
    entity = payload.event.split(".")[0]
    fields = set(workflows.ENTITIES[entity][1]) | {"id"}
    for c in payload.conditions:
        if c.field not in fields:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{c.field}' is not a field of {entity}")
    for a in payload.actions:
        if a.type == "email" and not (a.to and a.message):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An email action needs a recipient and a message")
        if a.type == "webhook":
            from backend.services.integrations import webhook_url_error

            error = "A webhook action needs a URL" if not a.url else webhook_url_error(a.url)
            if error:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, error)


@workflow_router.get("/meta")
def workflow_meta(user: User = Depends(get_current_user)):
    """What rules can react to and test: events, fields per record type, operators."""
    return {
        "events": workflows.event_names(),
        "fields": {name: list(fields) for name, (_, fields) in workflows.ENTITIES.items()},
        "operators": list(workflows.OPERATORS),
    }


@workflow_router.get("", response_model=List[RuleOut])
def list_rules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        _rule_out(r)
        for r in db.execute(
            select(WorkflowRule).where(WorkflowRule.organization_id == user.organization_id).order_by(WorkflowRule.created_at)
        ).scalars()
    ]


@workflow_router.post("", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(payload: RuleIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    _check_rule(payload)
    r = WorkflowRule(
        organization_id=user.organization_id,
        name=payload.name,
        event=payload.event,
        is_active=payload.is_active,
        run_count=0,
        created_by=user.id,
        conditions=json.dumps([c.model_dump() for c in payload.conditions]),
        actions=json.dumps([a.model_dump(exclude_none=True) for a in payload.actions]),
    )
    db.add(r)
    db.flush()
    audit.record(db, user, "create", "workflow_rule", r.id, f"Created workflow rule '{r.name}' on {r.event}")
    db.commit()
    return _rule_out(r)


@workflow_router.put("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: str, payload: RuleIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = get_or_404(db, WorkflowRule, rule_id, user.organization_id, "Workflow rule")
    _check_rule(payload)
    r.name, r.event, r.is_active = payload.name, payload.event, payload.is_active
    r.conditions = json.dumps([c.model_dump() for c in payload.conditions])
    r.actions = json.dumps([a.model_dump(exclude_none=True) for a in payload.actions])
    audit.record(db, user, "update", "workflow_rule", r.id, f"Updated workflow rule '{r.name}'")
    db.commit()
    return _rule_out(r)


@workflow_router.delete("/{rule_id}", response_model=Message)
def delete_rule(rule_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = get_or_404(db, WorkflowRule, rule_id, user.organization_id, "Workflow rule")
    name = r.name
    db.delete(r)
    audit.record(db, user, "delete", "workflow_rule", rule_id, f"Deleted workflow rule '{name}'")
    db.commit()
    return Message(message=f"Rule '{name}' deleted")


@workflow_router.get("/{rule_id}/runs", response_model=List[RunOut])
def rule_runs(rule_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_or_404(db, WorkflowRule, rule_id, user.organization_id, "Workflow rule")
    rows = db.execute(
        select(WorkflowRun).where(WorkflowRun.rule_id == rule_id).order_by(WorkflowRun.created_at.desc()).limit(100)
    ).scalars()
    return [RunOut.model_validate(r) for r in rows]


@workflow_router.post("/process", response_model=Message)
def process_now(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Run this organization's queued actions now instead of waiting for the background worker."""
    runs = (
        db.execute(select(WorkflowRun).where(WorkflowRun.organization_id == user.organization_id, WorkflowRun.status == "pending"))
        .scalars()
        .all()
    )
    for run in runs:
        workflows.execute(db, run)
    db.commit()
    return Message(message=f"{len(runs)} queued action(s) processed")


# --------------------------------------------------------------------------- #
# Approvals
# --------------------------------------------------------------------------- #
class ApprovalSettings(APIModel):
    invoice_threshold: Optional[Decimal] = Field(default=None, ge=0, le=MAX_MONEY)
    bill_threshold: Optional[Decimal] = Field(default=None, ge=0, le=MAX_MONEY)


class PendingApproval(APIModel):
    kind: str
    id: str
    number: str
    contact_name: str
    date: date
    total: Decimal
    requested_at: Optional[datetime] = None


class ApprovalDecision(APIModel):
    note: Optional[str] = Field(default=None, max_length=500)


@approvals_router.get("/settings", response_model=ApprovalSettings)
def approval_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    return ApprovalSettings(invoice_threshold=org.invoice_approval_threshold, bill_threshold=org.bill_approval_threshold)


@approvals_router.put("/settings", response_model=ApprovalSettings)
def save_approval_settings(payload: ApprovalSettings, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    org.invoice_approval_threshold = money(payload.invoice_threshold) if payload.invoice_threshold is not None else None
    org.bill_approval_threshold = money(payload.bill_threshold) if payload.bill_threshold is not None else None
    audit.record(
        db,
        user,
        "update",
        "organization",
        org.id,
        f"Approval thresholds: invoices {org.invoice_approval_threshold}, bills {org.bill_approval_threshold}",
    )
    db.commit()
    return approval_settings(user, db)


@approvals_router.get("/pending", response_model=List[PendingApproval])
def pending(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out: List[PendingApproval] = []
    for inv in db.execute(
        select(Invoice)
        .where(Invoice.organization_id == user.organization_id, Invoice.approval_status == "pending")
        .options(selectinload(Invoice.customer))
    ).scalars():
        out.append(
            PendingApproval(
                kind="invoice",
                id=inv.id,
                number=inv.invoice_number,
                contact_name=inv.customer.display_name,
                date=inv.date,
                total=inv.total,
                requested_at=inv.approval_requested_at,
            )
        )
    for bill in db.execute(
        select(Bill)
        .where(Bill.organization_id == user.organization_id, Bill.approval_status == "pending")
        .options(selectinload(Bill.vendor))
    ).scalars():
        out.append(
            PendingApproval(
                kind="bill",
                id=bill.id,
                number=bill.bill_number,
                contact_name=bill.vendor.display_name,
                date=bill.date,
                total=bill.total,
                requested_at=bill.approval_requested_at,
            )
        )
    return sorted(out, key=lambda p: p.requested_at or datetime.min.replace(tzinfo=UTC))


def _doc(db: Session, kind: str, doc_id: str, org_id: str):
    if kind not in ("invoice", "bill"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown document type")
    return get_or_404(db, Invoice if kind == "invoice" else Bill, doc_id, org_id, kind.capitalize())


@approvals_router.post("/{kind}/{doc_id}/submit", response_model=Message)
def submit(kind: str, doc_id: str, user: User = Depends(require_write), db: Session = Depends(get_db)):
    doc = _doc(db, kind, doc_id, user.organization_id)
    approvals.submit(db, doc, kind, user)
    db.commit()
    return Message(message="Sent for approval")


@approvals_router.post("/{kind}/{doc_id}/approve", response_model=Message)
def approve(kind: str, doc_id: str, payload: ApprovalDecision, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    doc = _doc(db, kind, doc_id, user.organization_id)
    approvals.approve(db, doc, kind, user, payload.note)
    db.commit()
    return Message(message="Approved")


@approvals_router.post("/{kind}/{doc_id}/reject", response_model=Message)
def reject(kind: str, doc_id: str, payload: ApprovalDecision, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    doc = _doc(db, kind, doc_id, user.organization_id)
    approvals.reject(db, doc, kind, user, payload.note)
    db.commit()
    return Message(message="Rejected")


# --------------------------------------------------------------------------- #
# Document branding
# --------------------------------------------------------------------------- #
class Branding(APIModel):
    brand_color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    logo_url: Optional[str] = Field(default=None, max_length=500)
    document_footer: Optional[str] = Field(default=None, max_length=1000)
    signature_label: Optional[str] = Field(default=None, max_length=120)

    @field_validator("logo_url")
    @classmethod
    def _logo(cls, value: Optional[str]) -> Optional[str]:
        if value and not value.startswith("https://"):
            raise ValueError("The logo must be an https:// link to an image")
        return value or None


@branding_router.get("", response_model=Branding)
def get_branding(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    return Branding(
        brand_color=org.brand_color, logo_url=org.logo_url, document_footer=org.document_footer, signature_label=org.signature_label
    )


@branding_router.put("", response_model=Branding)
def save_branding(payload: Branding, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    org.brand_color, org.logo_url = payload.brand_color, payload.logo_url
    org.document_footer, org.signature_label = payload.document_footer, payload.signature_label
    audit.record(db, user, "update", "organization", org.id, "Updated document branding")
    db.commit()
    return get_branding(user, db)


# --------------------------------------------------------------------------- #
# Scheduled reports
# --------------------------------------------------------------------------- #
class ScheduleIn(APIModel):
    name: str = Field(min_length=1, max_length=120)
    report: Literal["profit_and_loss", "balance_sheet", "receivables", "payables", "cash_flow", "gstr3b", "digest"]
    frequency: Literal["daily", "weekly", "monthly"] = "monthly"
    recipients: List[str] = Field(min_length=1, max_length=20)
    is_active: bool = True

    @field_validator("recipients")
    @classmethod
    def _emails(cls, value: List[str]) -> List[str]:
        cleaned = [v.strip() for v in value if v.strip()]
        bad = [v for v in cleaned if "@" not in v or " " in v]
        if bad or not cleaned:
            raise ValueError(f"Not an email address: {', '.join(bad) or 'none given'}")
        return cleaned


class ScheduleOut(ScheduleIn):
    id: str
    next_run_date: Optional[date] = None
    last_sent_at: Optional[date] = None


def _schedule_out(s: ReportSchedule) -> ScheduleOut:
    return ScheduleOut(
        id=s.id,
        name=s.name,
        report=s.report,
        frequency=s.frequency,
        recipients=[r for r in (s.recipients or "").split(",") if r],
        is_active=s.is_active,
        next_run_date=s.next_run_date,
        last_sent_at=s.last_sent_at,
    )


@schedules_router.get("", response_model=List[ScheduleOut])
def list_schedules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        _schedule_out(s)
        for s in db.execute(
            select(ReportSchedule).where(ReportSchedule.organization_id == user.organization_id).order_by(ReportSchedule.created_at)
        ).scalars()
    ]


@schedules_router.post("", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
def create_schedule(payload: ScheduleIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = ReportSchedule(
        organization_id=user.organization_id,
        name=payload.name,
        report=payload.report,
        frequency=payload.frequency,
        recipients=",".join(payload.recipients),
        is_active=payload.is_active,
        next_run_date=report_schedules.next_after(payload.frequency, date.today()),
        created_by=user.id,
    )
    db.add(s)
    db.flush()
    audit.record(
        db,
        user,
        "create",
        "report_schedule",
        s.id,
        f"Scheduled {payload.frequency} '{payload.name}' to {len(payload.recipients)} recipient(s)",
    )
    db.commit()
    return _schedule_out(s)


@schedules_router.put("/{schedule_id}", response_model=ScheduleOut)
def update_schedule(schedule_id: str, payload: ScheduleIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = get_or_404(db, ReportSchedule, schedule_id, user.organization_id, "Scheduled report")
    if payload.frequency != s.frequency:
        s.next_run_date = report_schedules.next_after(payload.frequency, date.today())
    s.name, s.report, s.frequency, s.recipients, s.is_active = (
        payload.name,
        payload.report,
        payload.frequency,
        ",".join(payload.recipients),
        payload.is_active,
    )
    db.commit()
    return _schedule_out(s)


@schedules_router.delete("/{schedule_id}", response_model=Message)
def delete_schedule(schedule_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = get_or_404(db, ReportSchedule, schedule_id, user.organization_id, "Scheduled report")
    db.delete(s)
    db.commit()
    return Message(message="Schedule deleted")


@schedules_router.post("/{schedule_id}/send-now", response_model=Message)
def send_now(schedule_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    s = get_or_404(db, ReportSchedule, schedule_id, user.organization_id, "Scheduled report")
    try:
        failed = report_schedules.send(db, s)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    db.commit()
    if failed:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not email: {', '.join(failed)}")
    return Message(message="Report sent")


@schedules_router.get("/preview")
def preview(
    report: str = Query(...),
    frequency: Literal["daily", "weekly", "monthly"] = "monthly",
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if report not in report_schedules.REPORTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown report")
    start, end = report_schedules.period_for(frequency, date.today())
    return {
        "title": report_schedules.REPORTS[report],
        "start": start.isoformat(),
        "end": end.isoformat(),
        "lines": report_schedules.summary(db, user, report, start, end),
    }
