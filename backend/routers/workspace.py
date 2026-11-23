"""AI Employee Workspace API.

- ``/api/workspace/admin/*``  the owner (organization admin): workspaces, employees, invitations,
  activity, AI usage and budgets.
- ``/api/workspace/*``         the employee: profile, chats, messages (with photos), confirmations.
- ``/api/workspace/invite/*``  public, token-guarded: open and accept an invitation.

Permissions are enforced in the services (tools.execute for the AI, deps.require_roles for the
ordinary API); nothing here trusts the browser about what an employee may do.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.db import get_db
from backend.deps import get_current_user, require_admin, require_subscription
from backend.models import User
from backend.services import permissions as base_permissions
from backend.services import audit
from backend.services.ratelimit import RateLimiter, client_ip
from backend.services.workspace import admin as svc
from backend.services.workspace import chat as chat_svc
from backend.services.workspace import perms, usage, vision
from backend.workspace_models import AiAttachment, AiChat, AiMessage

router = APIRouter(prefix="/api/workspace", tags=["AI workspace"])
admin_router = APIRouter(prefix="/api/workspace/admin", tags=["AI workspace (owner)"])
public_router = APIRouter(prefix="/api/workspace/invite", tags=["AI workspace invitations"])

_invite_limiter = RateLimiter(limit=max(get_settings().login_rate_limit_per_minute, 10), window_seconds=60)
_chat_limiter = RateLimiter(limit=40, window_seconds=60)


def owner(user: User = Depends(require_admin)) -> User:
    if getattr(user, "connected_app", None) is not None:
        raise HTTPException(403, "Only the organization's admins can manage AI workspaces.")
    return user


class Loose(BaseModel):
    """Bodies are validated in the services; unknown keys are ignored."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class WorkspaceBody(Loose):
    name: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None
    isActive: Optional[bool] = None


class InviteBody(Loose):
    workspaceId: str
    email: str
    name: Optional[str] = None
    jobTitle: Optional[str] = None


class EmployeeBody(Loose):
    name: Optional[str] = None
    jobTitle: Optional[str] = None
    workspaceId: Optional[str] = None
    aiEnabled: Optional[bool] = None
    allowAuto: Optional[bool] = None
    allowManual: Optional[bool] = None
    monthlyBudgetUsd: Optional[float] = None
    dailyCallLimit: Optional[int] = None


class SettingsBody(Loose):
    aiEnabled: Optional[bool] = None
    monthlyBudgetUsd: Optional[float] = Field(default=None, ge=0)
    defaultEmployeeBudgetUsd: Optional[float] = Field(default=None, ge=0)
    defaultDailyCallLimit: Optional[int] = Field(default=None, ge=0)


def _set(body: BaseModel) -> Dict[str, Any]:
    return body.model_dump(exclude_unset=True)


# --------------------------------------------------------------------------- #
# Owner
# --------------------------------------------------------------------------- #
@admin_router.get("/overview")
def admin_overview(user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.overview(db, user.organization_id)


@admin_router.get("/catalog")
def admin_catalog(user: User = Depends(owner)):
    return {**perms.catalog(), "presets": [{"key": k, **{kk: vv for kk, vv in v.items()}} for k, v in perms.PRESETS.items()]}


@admin_router.get("/workspaces")
def admin_workspaces(user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.list_workspaces(db, user.organization_id)


@admin_router.post("/workspaces", status_code=201)
def admin_create_workspace(body: WorkspaceBody, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.create_workspace(db, user.organization_id, user, _set(body))


@admin_router.put("/workspaces/{ws_id}")
def admin_update_workspace(ws_id: str, body: WorkspaceBody, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.update_workspace(db, user.organization_id, user, ws_id, _set(body))


@admin_router.delete("/workspaces/{ws_id}", status_code=204)
def admin_delete_workspace(ws_id: str, user: User = Depends(owner), db: Session = Depends(get_db)):
    svc.delete_workspace(db, user.organization_id, user, ws_id)
    return Response(status_code=204)


@admin_router.get("/employees")
def admin_employees(workspaceId: Optional[str] = None, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.list_employees(db, user.organization_id, workspaceId)


@admin_router.post("/employees", status_code=201)
def admin_invite(body: InviteBody, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.invite_employee(db, user.organization_id, user, _set(body))


@admin_router.patch("/employees/{emp_id}")
def admin_update_employee(emp_id: str, body: EmployeeBody, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.update_employee(db, user.organization_id, user, emp_id, _set(body))


@admin_router.post("/employees/{emp_id}/resend")
def admin_resend(emp_id: str, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.resend_invite(db, user.organization_id, user, emp_id)


@admin_router.post("/employees/{emp_id}/revoke")
def admin_revoke(emp_id: str, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.revoke_employee(db, user.organization_id, user, emp_id)


@admin_router.post("/employees/{emp_id}/restore")
def admin_restore(emp_id: str, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.restore_employee(db, user.organization_id, user, emp_id)


@admin_router.delete("/employees/{emp_id}", status_code=204)
def admin_delete_employee(emp_id: str, user: User = Depends(owner), db: Session = Depends(get_db)):
    svc.delete_employee(db, user.organization_id, user, emp_id)
    return Response(status_code=204)


@admin_router.get("/employees/{emp_id}/activity")
def admin_activity(emp_id: str, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.employee_activity(db, user.organization_id, emp_id)


@admin_router.get("/audit")
def admin_audit(user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.audit_history(db, user.organization_id)


@admin_router.get("/usage")
def admin_usage(days: int = 30, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.usage_report(db, user.organization_id, days)


@admin_router.get("/settings")
def admin_settings(user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.settings_out(db, user.organization_id)


@admin_router.put("/settings")
def admin_update_settings(body: SettingsBody, user: User = Depends(owner), db: Session = Depends(get_db)):
    return svc.update_settings(db, user.organization_id, user, _set(body))


# --------------------------------------------------------------------------- #
# Invitation (public)
# --------------------------------------------------------------------------- #
class AcceptBody(Loose):
    token: str
    password: str
    name: Optional[str] = None


@public_router.get("/{token}")
def invite_lookup(token: str, request: Request, db: Session = Depends(get_db)):
    _invite_limiter.check(f"wsinv:{client_ip(request)}")
    return svc.invite_info(db, token)


@public_router.post("/accept")
def invite_accept(body: AcceptBody, request: Request, response: Response, db: Session = Depends(get_db)):
    """Create the employee's own login, then sign them in so they land in their workspace."""
    _invite_limiter.check(f"wsinv:{client_ip(request)}")
    from backend.routers.auth import _auth_response, _issue_tokens

    user = svc.accept_invite(db, body.token, body.password, body.name)
    access = _issue_tokens(db, user, response, request)
    db.commit()
    return _auth_response(access, user)


# --------------------------------------------------------------------------- #
# Employee
# --------------------------------------------------------------------------- #
def ws_ctx(user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    return chat_svc.context_for(db, user)


def _feature_list(ctx) -> List[Dict[str, Any]]:
    labels = {f.key: (f.label, f.group) for f in base_permissions.FEATURES}
    return [{"key": k, "label": labels[k][0], "group": labels[k][1], "actions": acts} for k, acts in perms.effective(ctx.perm).items() if k in labels]


@router.get("/me")
def me(ctx=Depends(ws_ctx)):
    cfg = chat_svc.workspace_config(ctx.workspace)
    emp = ctx.employee
    allow_auto, allow_manual = bool(emp.allow_auto and cfg["allow_auto"]), bool(emp.allow_manual and cfg["allow_manual"])
    mode = emp.preferred_mode if (emp.preferred_mode == "auto" and allow_auto) or (emp.preferred_mode == "manual" and allow_manual) else ("auto" if allow_auto else "manual")
    return {
        "name": ctx.user.name,
        "email": ctx.user.email,
        "jobTitle": emp.job_title,
        "organizationName": ctx.user.organization.name if ctx.user.organization else "",
        "workspace": {"id": ctx.workspace.id, "name": ctx.workspace.name, "department": ctx.workspace.department, "description": ctx.workspace.description},
        "features": _feature_list(ctx),
        "financial": perms.can_see_financial(ctx.perm),
        "modes": {"allowAuto": allow_auto, "allowManual": allow_manual, "current": mode},
        "ai": {"enabled": bool(emp.ai_enabled), "configured": usage.ai_core.configured(), "blockedReason": usage.gate(ctx.db, ctx.org_id, emp)},
        "photoUpload": perms.can(ctx.perm, "items", perms.CREATE) or perms.can(ctx.perm, "items", perms.VIEW),
    }


@router.get("/quick")
def quick_facts(ctx=Depends(ws_ctx)):
    """Manual-mode home: a few facts from the same permission-checked tools, no AI involved."""
    from backend.services.workspace import tools

    facts = []
    for name, args in (("sales_summary", {"period": "today"}), ("list_invoices", {"status": "pending"}), ("low_stock_products", {}), ("receivables_summary", {})):
        out = tools.execute(ctx, name, args)
        if out["status"] == "ok":
            facts.append({"tool": name, "text": out["text"], "cards": out.get("cards", [])})
    return facts


class ModeBody(Loose):
    mode: str


@router.patch("/me")
def set_mode(body: ModeBody, ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    if body.mode not in ("auto", "manual"):
        raise HTTPException(422, "Mode must be auto or manual.")
    cfg = chat_svc.workspace_config(ctx.workspace)
    if body.mode == "auto" and not (ctx.employee.allow_auto and cfg["allow_auto"]):
        raise HTTPException(403, "Automatic mode is turned off for you.")
    if body.mode == "manual" and not (ctx.employee.allow_manual and cfg["allow_manual"]):
        raise HTTPException(403, "Manual mode is turned off for you.")
    ctx.employee.preferred_mode = body.mode  # the mode never changes what the employee may do
    db.commit()
    return {"mode": body.mode}


@router.get("/chats")
def list_chats(ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    rows = db.execute(select(AiChat).where(AiChat.user_id == ctx.user.id, AiChat.organization_id == ctx.org_id, AiChat.is_archived.is_(False)).order_by(AiChat.updated_at.desc()).limit(100)).scalars().all()
    return [{"id": c.id, "title": c.title, "updatedAt": chat_svc._aware(c.updated_at).isoformat()} for c in rows]


@router.post("/chats", status_code=201)
def create_chat(ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    chat = chat_svc.new_chat(db, ctx)
    db.commit()
    return {"id": chat.id, "title": chat.title, "updatedAt": chat_svc._aware(chat.updated_at).isoformat()}


class RenameBody(Loose):
    title: str = Field(min_length=1, max_length=120)


@router.patch("/chats/{chat_id}")
def rename_chat(chat_id: str, body: RenameBody, ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    chat = chat_svc.get_chat(db, ctx, chat_id)
    chat.title = body.title.strip()[:120]
    db.commit()
    return {"id": chat.id, "title": chat.title}


@router.delete("/chats/{chat_id}", status_code=204)
def delete_chat(chat_id: str, ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    chat = chat_svc.get_chat(db, ctx, chat_id)
    chat.is_archived = True
    db.commit()
    return Response(status_code=204)


@router.get("/chats/{chat_id}/messages")
def chat_messages(chat_id: str, ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    chat = chat_svc.get_chat(db, ctx, chat_id)
    rows = db.execute(select(AiMessage).where(AiMessage.chat_id == chat.id).order_by(AiMessage.created_at).limit(300)).scalars().all()
    return [chat_svc.message_out(m) for m in rows]


@router.post("/chats/{chat_id}/messages")
async def send_message(
    chat_id: str,
    request: Request,
    text: str = Form(""),
    mode: str = Form("auto"),
    files: List[UploadFile] = File(default_factory=list),
    ctx=Depends(ws_ctx),
    db: Session = Depends(get_db),
):
    _chat_limiter.check(f"wschat:{ctx.user.id}", "You are sending messages very quickly. Wait a moment.")
    chat = chat_svc.get_chat(db, ctx, chat_id)
    if len(files) > chat_svc.MAX_PHOTOS:
        raise HTTPException(400, f"Send at most {chat_svc.MAX_PHOTOS} photos at a time.")
    prepared = []
    for f in files:
        raw = await f.read(vision.MAX_IMAGE_BYTES + 1)
        data, ctype, ext = vision.prepare(raw, f.content_type or "")
        att = vision.store(db, ctx.employee, chat.id, f.filename or "photo", data, ctype, ext)
        prepared.append({"bytes": data, "content_type": ctype, "attachment": att})
    return chat_svc.handle_message(db, ctx, chat, text, prepared, "manual" if mode == "manual" else "auto")


@router.post("/actions/{action_id}/confirm")
def confirm_action(action_id: str, ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    return chat_svc.act_on_pending(db, ctx, action_id, True)


@router.post("/actions/{action_id}/cancel")
def cancel_action(action_id: str, ctx=Depends(ws_ctx), db: Session = Depends(get_db)):
    return chat_svc.act_on_pending(db, ctx, action_id, False)


def attachment_ctx(user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    """An employee reads their own photos through their workspace; everyone else through Buddy."""
    from backend.services.workspace import buddy

    return chat_svc.context_for(db, user) if user.workspace_employee else buddy.context_for(db, user)


@router.get("/attachments/{att_id}")
def attachment(att_id: str, ctx=Depends(attachment_ctx), db: Session = Depends(get_db)):
    att = db.get(AiAttachment, att_id)
    if att is None or att.user_id != ctx.user.id or att.organization_id != ctx.org_id:
        raise HTTPException(404, "File not found")
    return RawResponse(content=vision.load(att), media_type=att.content_type, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


# --------------------------------------------------------------------------- #
# Buddy: the sidebar helper for the people who run the business
# --------------------------------------------------------------------------- #
buddy_router = APIRouter(prefix="/api/buddy", tags=["Buddy"])


def buddy_ctx(user: User = Depends(require_subscription), db: Session = Depends(get_db)):
    from backend.services.workspace import buddy

    if getattr(user, "connected_app", None) is not None:
        raise HTTPException(403, "Buddy is not available for connected apps.")
    return buddy.context_for(db, user)


class BuddyMessage(Loose):
    text: str = Field(min_length=1, max_length=2000)
    agent: Optional[str] = None


@buddy_router.get("/state")
def buddy_state(ctx=Depends(buddy_ctx), db: Session = Depends(get_db)):
    from backend.services.workspace import buddy

    chat = buddy.current_chat(db, ctx)
    rows = db.execute(select(AiMessage).where(AiMessage.chat_id == chat.id).order_by(AiMessage.created_at).limit(200)).scalars().all() if chat else []
    return {
        "greeting": chat_svc.help_text(ctx)["text"],
        "firstName": ctx.user.name.split()[0],
        "messages": [chat_svc.message_out(m) for m in rows],
        "ai": {"configured": usage.ai_core.configured(), "blockedReason": usage.gate(db, ctx.org_id, ctx.employee)},
    }


@buddy_router.get("/agents")
def buddy_agents(ctx=Depends(buddy_ctx)):
    """The specialist team and which of them this person may use."""
    from backend.services.workspace import agents

    return agents.listing(ctx)


@buddy_router.post("/message")
def buddy_message(body: BuddyMessage, ctx=Depends(buddy_ctx), db: Session = Depends(get_db)):
    from backend.services.workspace import buddy

    _chat_limiter.check(f"buddy:{ctx.user.id}", "Easy, boss: too many messages at once. Wait a moment.")
    chat = buddy.current_chat(db, ctx) or chat_svc.new_chat(db, ctx)
    return chat_svc.handle_message(db, ctx, chat, body.text, [], "auto", agent_hint=body.agent)


@buddy_router.post("/photo-message")
async def buddy_photo_message(
    text: str = Form(""),
    files: List[UploadFile] = File(default_factory=list),
    ctx=Depends(buddy_ctx),
    db: Session = Depends(get_db),
):
    """Buddy with photos (a product to add or look up): same checks as the employee chat."""
    from backend.services.workspace import buddy

    _chat_limiter.check(f"buddy:{ctx.user.id}", "Easy, boss: too many messages at once. Wait a moment.")
    if not files:
        raise HTTPException(400, "Attach a photo.")
    if len(files) > chat_svc.MAX_PHOTOS:
        raise HTTPException(400, f"Send at most {chat_svc.MAX_PHOTOS} photos at a time.")
    chat = buddy.current_chat(db, ctx) or chat_svc.new_chat(db, ctx)
    prepared = []
    for f in files:
        raw = await f.read(vision.MAX_IMAGE_BYTES + 1)
        data, ctype, ext = vision.prepare(raw, f.content_type or "")
        att = vision.store(db, ctx.employee, chat.id, f.filename or "photo", data, ctype, ext)
        prepared.append({"bytes": data, "content_type": ctype, "attachment": att})
    return chat_svc.handle_message(db, ctx, chat, text, prepared, "auto")


@buddy_router.post("/reset")
def buddy_reset(ctx=Depends(buddy_ctx), db: Session = Depends(get_db)):
    from backend.services.workspace import buddy

    buddy.current_chat(db, ctx, fresh=True)
    db.commit()
    return {"ok": True}


@buddy_router.post("/actions/{action_id}/confirm")
def buddy_confirm(action_id: str, ctx=Depends(buddy_ctx), db: Session = Depends(get_db)):
    return chat_svc.act_on_pending(db, ctx, action_id, True)


@buddy_router.post("/actions/{action_id}/cancel")
def buddy_cancel(action_id: str, ctx=Depends(buddy_ctx), db: Session = Depends(get_db)):
    return chat_svc.act_on_pending(db, ctx, action_id, False)
