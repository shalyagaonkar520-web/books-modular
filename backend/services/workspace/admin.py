"""The owner's side: workspaces, employees, invitations, activity, AI usage and budgets.

Every function takes the owner's organization id and works only inside it. Employees get a
login through a secure invitation: a random token (only its SHA-256 is stored), valid for a few
days, usable once. The owner's own credentials are never involved.
"""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models import AuditLog, Organization, OrgRole, RefreshToken, User
from backend.security import hash_password, hash_token
from backend.services import audit, plans
from backend.services import email_service as mail
from backend.services import permissions as base_permissions
from backend.services.workspace import perms, usage
from backend.workspace_models import AiEmployee, AiMessage, AiUsage, AiWorkspace

INVITE_STATUSES = ("pending", "accepted", "active", "revoked")


def now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=UTC)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    dt = _aware(dt)
    return dt.isoformat() if dt else None


# --------------------------------------------------------------------------- #
# Workspaces
# --------------------------------------------------------------------------- #
def _config(raw: Optional[Dict[str, Any]], current: Optional[str] = None) -> str:
    try:
        cfg = json.loads(current or "{}")
    except ValueError:
        cfg = {}
    raw = raw or {}
    for key in ("allow_auto", "allow_manual", "confirm_writes"):
        if key in raw:
            cfg[key] = bool(raw[key])
    if raw.get("default_mode") in ("auto", "manual"):
        cfg["default_mode"] = raw["default_mode"]
    if "context" in raw:
        cfg["context"] = str(raw["context"] or "")[:300]
    if not cfg.get("allow_auto", True) and not cfg.get("allow_manual", True):
        raise HTTPException(400, "Turn on at least one of Automatic or Manual mode.")
    return json.dumps(cfg)


def _role_name(ws_name: str) -> str:
    return f"Workspace: {ws_name}"[:60]


def _sync_role(db: Session, ws: AiWorkspace) -> None:
    """The hidden OrgRole that carries the workspace's permissions into the normal API guards."""
    perm = perms.normalize(ws.permissions)
    role = db.get(OrgRole, ws.role_id) if ws.role_id else None
    if role is None:
        role = OrgRole(organization_id=ws.organization_id, name=_role_name(ws.name), description=f"AI workspace {ws.name}")
        db.add(role)
    role.name = _role_name(ws.name)
    role.permissions = json.dumps(perms.role_levels(perm))
    role.actions = json.dumps(perm)
    role.workspace_id = ws.id
    db.flush()
    ws.role_id = role.id


def workspace_out(db: Session, ws: AiWorkspace) -> Dict[str, Any]:
    counts = dict(db.execute(select(AiEmployee.status, func.count()).where(AiEmployee.workspace_id == ws.id).group_by(AiEmployee.status)).all())
    try:
        cfg = json.loads(ws.config or "{}")
    except ValueError:
        cfg = {}
    return {
        "id": ws.id,
        "name": ws.name,
        "department": ws.department,
        "description": ws.description,
        "permissions": perms.normalize(ws.permissions),
        "config": {"allowAuto": cfg.get("allow_auto", True), "allowManual": cfg.get("allow_manual", True), "defaultMode": cfg.get("default_mode", "auto"), "confirmWrites": cfg.get("confirm_writes", True), "context": cfg.get("context", "")},
        "isActive": ws.is_active,
        "employeeCount": sum(n for s, n in counts.items() if s != "revoked"),
        "statusCounts": {s: counts.get(s, 0) for s in INVITE_STATUSES},
        "createdAt": _iso(ws.created_at),
    }


def _clean_name(value: Optional[str], label: str, lo: int = 2, hi: int = 80) -> str:
    v = (value or "").strip()
    if not lo <= len(v) <= hi:
        raise HTTPException(422, f"{label} must be {lo} to {hi} characters.")
    return v


def create_workspace(db: Session, org_id: str, actor: User, body: Dict[str, Any]) -> Dict[str, Any]:
    name = _clean_name(body.get("name"), "Workspace name", 2, 48)
    if db.execute(select(AiWorkspace.id).where(AiWorkspace.organization_id == org_id, func.lower(AiWorkspace.name) == name.lower())).first():
        raise HTTPException(409, "A workspace with this name already exists.")
    perm = perms.normalize(body.get("permissions"))
    if not perm["features"]:
        raise HTTPException(400, "Give the workspace at least one feature.")
    ws = AiWorkspace(
        organization_id=org_id,
        name=name,
        department=_clean_name(body.get("department") or "General", "Department"),
        description=(body.get("description") or "").strip()[:300] or None,
        permissions=json.dumps(perm),
        config=_config(body.get("config")),
    )
    db.add(ws)
    db.flush()
    _sync_role(db, ws)
    audit.record(db, actor, "create", "ai_workspace", ws.id, f"Created AI workspace {ws.name}")
    db.commit()
    return workspace_out(db, ws)


def get_workspace(db: Session, org_id: str, ws_id: str) -> AiWorkspace:
    from backend.services.workspace.buddy import is_system_workspace

    ws = db.get(AiWorkspace, ws_id)
    if ws is None or ws.organization_id != org_id or is_system_workspace(ws):
        raise HTTPException(404, "Workspace not found")
    return ws


def update_workspace(db: Session, org_id: str, actor: User, ws_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    ws = get_workspace(db, org_id, ws_id)
    if "name" in body and body["name"] is not None:
        name = _clean_name(body["name"], "Workspace name", 2, 48)
        if name.lower() != ws.name.lower() and db.execute(select(AiWorkspace.id).where(AiWorkspace.organization_id == org_id, func.lower(AiWorkspace.name) == name.lower())).first():
            raise HTTPException(409, "A workspace with this name already exists.")
        ws.name = name
    if body.get("department") is not None:
        ws.department = _clean_name(body["department"], "Department")
    if "description" in body:
        ws.description = (body["description"] or "").strip()[:300] or None
    if body.get("permissions") is not None:
        perm = perms.normalize(body["permissions"])
        if not perm["features"]:
            raise HTTPException(400, "Give the workspace at least one feature.")
        ws.permissions = json.dumps(perm)
    if body.get("config") is not None:
        ws.config = _config(body["config"], ws.config)
    if body.get("isActive") is not None:
        ws.is_active = bool(body["isActive"])
    _sync_role(db, ws)
    audit.record(db, actor, "update", "ai_workspace", ws.id, f"Updated AI workspace {ws.name} (permissions take effect immediately)")
    db.commit()
    return workspace_out(db, ws)


def delete_workspace(db: Session, org_id: str, actor: User, ws_id: str) -> None:
    ws = get_workspace(db, org_id, ws_id)
    if db.execute(select(AiEmployee.id).where(AiEmployee.workspace_id == ws.id).limit(1)).first():
        raise HTTPException(409, "This workspace still has employees. Remove them or move them first, or switch the workspace off.")
    role = db.get(OrgRole, ws.role_id) if ws.role_id else None
    audit.record(db, actor, "delete", "ai_workspace", ws.id, f"Deleted AI workspace {ws.name}")
    db.delete(ws)
    if role is not None:
        db.delete(role)
    db.commit()


def list_workspaces(db: Session, org_id: str) -> List[Dict[str, Any]]:
    from backend.services.workspace.buddy import is_system_workspace

    rows = db.execute(select(AiWorkspace).where(AiWorkspace.organization_id == org_id).order_by(AiWorkspace.created_at)).scalars().all()
    return [workspace_out(db, w) for w in rows if not is_system_workspace(w)]


# --------------------------------------------------------------------------- #
# Employees and invitations
# --------------------------------------------------------------------------- #
def _month_usage(db: Session, org_id: str) -> Dict[str, Dict[str, Any]]:
    start = usage._month_start()
    rows = db.execute(
        select(AiUsage.user_id, func.count(), func.coalesce(func.sum(AiUsage.cost_usd), 0)).where(AiUsage.organization_id == org_id, AiUsage.created_at >= start).group_by(AiUsage.user_id)
    ).all()
    return {uid: {"calls": n, "cost": float(c)} for uid, n, c in rows}


def employee_out(emp: AiEmployee, ws_name: Optional[str] = None, month: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    stats = (month or {}).get(emp.user_id or "", {"calls": 0, "cost": 0.0})
    return {
        "id": emp.id,
        "workspaceId": emp.workspace_id,
        "workspaceName": ws_name,
        "name": emp.name,
        "email": emp.email,
        "jobTitle": emp.job_title,
        "status": emp.status,
        "invitedAt": _iso(emp.invited_at),
        "inviteExpiresAt": _iso(emp.invite_expires_at) if emp.status == "pending" else None,
        "inviteExpired": bool(emp.status == "pending" and emp.invite_expires_at and _aware(emp.invite_expires_at) < now()),
        "acceptedAt": _iso(emp.accepted_at),
        "lastActiveAt": _iso(emp.last_active_at),
        "aiEnabled": emp.ai_enabled,
        "allowAuto": emp.allow_auto,
        "allowManual": emp.allow_manual,
        "monthlyBudgetUsd": float(emp.monthly_budget_usd) if emp.monthly_budget_usd is not None else None,
        "dailyCallLimit": emp.daily_call_limit,
        "monthCalls": stats["calls"],
        "monthCostUsd": round(stats["cost"], 6),
    }


def list_employees(db: Session, org_id: str, workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
    stmt = select(AiEmployee, AiWorkspace.name).join(AiWorkspace, AiWorkspace.id == AiEmployee.workspace_id).where(AiEmployee.organization_id == org_id)
    if workspace_id:
        stmt = stmt.where(AiEmployee.workspace_id == workspace_id)
    month = _month_usage(db, org_id)
    return [employee_out(e, n, month) for e, n in db.execute(stmt.order_by(AiEmployee.invited_at.desc())).all()]


def get_employee(db: Session, org_id: str, emp_id: str) -> AiEmployee:
    emp = db.get(AiEmployee, emp_id)
    if emp is None or emp.organization_id != org_id:
        raise HTTPException(404, "Employee not found")
    return emp


def _invite_url(raw_token: str) -> str:
    return f"{get_settings().frontend_url}/workspace-invite?token={raw_token}"


def _send_invite(org: Organization, ws: AiWorkspace, emp: AiEmployee, inviter: str, raw_token: str) -> None:
    if not mail.smtp_configured():
        raise HTTPException(503, "Outbound email is not configured on the server, so invitations cannot be delivered. Set SMTP_USER and SMTP_PASSWORD.")
    result = send_workspace_invite_email(emp.email, emp.name, org.name, ws.name, ws.department, inviter, _invite_url(raw_token))
    if not result.get("success"):
        raise HTTPException(502, f"Could not send the invitation email: {result.get('error', 'unknown error')}")


def send_workspace_invite_email(to_email: str, name: str, org_name: str, workspace: str, department: str, inviter: str, url: str) -> Dict[str, Any]:
    try:
        settings = mail._smtp()
        msg = MIMEMultipart("alternative")
        msg["Subject"] = mail._header(f"{inviter} invited you to the {workspace} on Rooman Box")
        msg["From"] = f"{settings.smtp_sender_name} <{settings.smtp_user}>"
        msg["To"] = mail._header(to_email)
        e = mail._esc
        days = settings.invite_expire_days
        html = f"""<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;margin:0;padding:24px;color:#1e293b">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
<div style="background:#0f172a;color:#fff;padding:26px 30px"><div style="font-size:19px;font-weight:700">{e(org_name)}</div><div style="color:#94a3b8;font-size:13px;margin-top:4px">Your AI workspace on Rooman Box</div></div>
<div style="padding:30px;line-height:1.6;font-size:15px;color:#334155">
<p><strong>Hello {e(name)},</strong></p>
<p>{e(inviter)} has set up the <strong>{e(workspace)}</strong> ({e(department)}) for you. Ask questions, upload photos and get your work done in plain language, on your phone or computer.</p>
<p style="text-align:center;margin:26px 0"><a href="{e(url)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-weight:600;display:inline-block">Create your login</a></p>
<p style="font-size:12.5px;color:#64748b;word-break:break-all">Or paste this link into your browser:<br>{e(url)}</p>
<p style="font-size:13px;color:#64748b">You will choose your own password. This link works once and expires in {days} days. If you were not expecting it, ignore this email.</p>
</div></div></body></html>"""
        msg.attach(MIMEText(html, "html"))
        server = mail.get_smtp_connection()
        server.sendmail(settings.smtp_user, to_email, msg.as_string())
        server.quit()
        return {"success": True}
    except Exception as exc:  # noqa: BLE001
        return mail._failure("workspace_invite", to_email, exc)


def _fresh_token(emp: AiEmployee) -> str:
    raw = secrets.token_urlsafe(32)
    emp.invite_token_hash = hash_token(raw)
    emp.invite_expires_at = now() + timedelta(days=get_settings().invite_expire_days)
    return raw


def invite_employee(db: Session, org_id: str, actor: User, body: Dict[str, Any]) -> Dict[str, Any]:
    from pydantic import TypeAdapter
    from pydantic.networks import EmailStr

    ws = get_workspace(db, org_id, body.get("workspaceId") or body.get("workspace_id") or "")
    if not ws.is_active:
        raise HTTPException(400, "This workspace is switched off.")
    try:
        email = str(TypeAdapter(EmailStr).validate_python((body.get("email") or "").strip())).lower()
    except ValueError:
        raise HTTPException(422, "Enter a valid email address.") from None
    name = _clean_name(body.get("name") or email.split("@")[0].replace(".", " ").title(), "Name", 2, 120)
    org = db.get(Organization, org_id)
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(409, "A user with this email already exists.")
    emp = db.execute(select(AiEmployee).where(AiEmployee.organization_id == org_id, AiEmployee.email == email)).scalar_one_or_none()
    if emp is not None and emp.status != "revoked":
        raise HTTPException(409, "This email has already been invited.")
    plans.check_room_for(db, org)
    if emp is None:
        emp = AiEmployee(organization_id=org_id, workspace_id=ws.id, name=name, email=email)
        db.add(emp)
    emp.workspace_id, emp.name, emp.job_title = ws.id, name, (body.get("jobTitle") or "").strip()[:80] or None
    emp.status, emp.revoked_at, emp.invited_by, emp.invited_at, emp.user_id = "pending", None, actor.id, now(), None
    emp.preferred_mode = json.loads(ws.config or "{}").get("default_mode", "auto")
    raw = _fresh_token(emp)
    db.flush()
    _send_invite(org, ws, emp, actor.name, raw)  # raises (and nothing is saved) if the email cannot be sent
    audit.record(db, actor, "create", "ai_employee", emp.id, f"Invited {email} to AI workspace {ws.name}")
    db.commit()
    return employee_out(emp, ws.name)


def resend_invite(db: Session, org_id: str, actor: User, emp_id: str) -> Dict[str, Any]:
    emp = get_employee(db, org_id, emp_id)
    if emp.status != "pending":
        raise HTTPException(400, "Only a pending invitation can be resent.")
    ws = db.get(AiWorkspace, emp.workspace_id)
    raw = _fresh_token(emp)
    _send_invite(db.get(Organization, org_id), ws, emp, actor.name, raw)
    audit.record(db, actor, "update", "ai_employee", emp.id, f"Resent invitation to {emp.email}")
    db.commit()
    return employee_out(emp, ws.name)


def revoke_employee(db: Session, org_id: str, actor: User, emp_id: str) -> Dict[str, Any]:
    emp = get_employee(db, org_id, emp_id)
    emp.status, emp.revoked_at, emp.invite_token_hash, emp.invite_expires_at = "revoked", now(), None, None
    if emp.user_id:
        user = db.get(User, emp.user_id)
        if user is not None:
            user.is_active = False
            user.sessions_revoked_at = now()  # every signed-in device is cut off immediately
            for token in db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))).scalars():
                token.revoked_at = now()
    audit.record(db, actor, "update", "ai_employee", emp.id, f"Revoked access of {emp.email}")
    db.commit()
    return employee_out(emp, db.get(AiWorkspace, emp.workspace_id).name)


def restore_employee(db: Session, org_id: str, actor: User, emp_id: str) -> Dict[str, Any]:
    emp = get_employee(db, org_id, emp_id)
    if emp.status != "revoked":
        raise HTTPException(400, "Only a revoked employee can be restored.")
    if not emp.user_id:
        raise HTTPException(400, "This person never accepted the invitation. Send a new invitation instead.")
    plans.check_room_for(db, db.get(Organization, org_id))
    user = db.get(User, emp.user_id)
    user.is_active = True
    emp.status, emp.revoked_at = "accepted", None
    audit.record(db, actor, "update", "ai_employee", emp.id, f"Restored access of {emp.email}")
    db.commit()
    return employee_out(emp, db.get(AiWorkspace, emp.workspace_id).name)


def update_employee(db: Session, org_id: str, actor: User, emp_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    emp = get_employee(db, org_id, emp_id)
    if body.get("name"):
        emp.name = _clean_name(body["name"], "Name", 2, 120)
        if emp.user_id and (u := db.get(User, emp.user_id)):
            u.name = emp.name
    if "jobTitle" in body:
        emp.job_title = (body["jobTitle"] or "").strip()[:80] or None
    for key, attr in (("aiEnabled", "ai_enabled"), ("allowAuto", "allow_auto"), ("allowManual", "allow_manual")):
        if body.get(key) is not None:
            setattr(emp, attr, bool(body[key]))
    if not emp.allow_auto and not emp.allow_manual:
        raise HTTPException(400, "Turn on at least one of Automatic or Manual mode.")
    if "monthlyBudgetUsd" in body:
        v = body["monthlyBudgetUsd"]
        emp.monthly_budget_usd = None if v in (None, "") else Decimal(str(v))
        if emp.monthly_budget_usd is not None and emp.monthly_budget_usd < 0:
            raise HTTPException(422, "The budget cannot be negative.")
    if "dailyCallLimit" in body:
        v = body["dailyCallLimit"]
        emp.daily_call_limit = None if v in (None, "") else int(v)
        if emp.daily_call_limit is not None and emp.daily_call_limit < 0:
            raise HTTPException(422, "The limit cannot be negative.")
    if body.get("workspaceId") and body["workspaceId"] != emp.workspace_id:
        ws = get_workspace(db, org_id, body["workspaceId"])
        emp.workspace_id = ws.id
        if emp.user_id and (u := db.get(User, emp.user_id)):
            u.custom_role_id = ws.role_id  # a moved employee gets the new workspace's permissions at once
    audit.record(db, actor, "update", "ai_employee", emp.id, f"Updated AI employee {emp.email}")
    db.commit()
    return employee_out(emp, db.get(AiWorkspace, emp.workspace_id).name)


def delete_employee(db: Session, org_id: str, actor: User, emp_id: str) -> None:
    emp = get_employee(db, org_id, emp_id)
    if emp.user_id:
        raise HTTPException(409, "This person has an account. Revoke access instead of deleting.")
    audit.record(db, actor, "delete", "ai_employee", emp.id, f"Deleted pending invitation of {emp.email}")
    db.delete(emp)
    db.commit()


# --------------------------------------------------------------------------- #
# Accepting an invitation
# --------------------------------------------------------------------------- #
def _invite_row(db: Session, token: str) -> AiEmployee:
    emp = db.execute(select(AiEmployee).where(AiEmployee.invite_token_hash == hash_token(token or ""))).scalar_one_or_none()
    if emp is None or emp.status != "pending":
        raise HTTPException(404, "This invitation link is invalid or has already been used.")
    if emp.invite_expires_at is None or _aware(emp.invite_expires_at) < now():
        raise HTTPException(410, "This invitation has expired. Ask your administrator to send a new one.")
    return emp


def invite_info(db: Session, token: str) -> Dict[str, Any]:
    emp = _invite_row(db, token)
    ws = db.get(AiWorkspace, emp.workspace_id)
    org = db.get(Organization, emp.organization_id)
    return {"name": emp.name, "email": emp.email, "organizationName": org.name, "workspaceName": ws.name, "department": ws.department}


def accept_invite(db: Session, token: str, password: str, name: Optional[str] = None) -> User:
    from backend.schemas.auth import AcceptInviteRequest

    emp = _invite_row(db, token)
    try:
        password = AcceptInviteRequest(token=token, password=password).password  # the platform's own password rules
    except ValueError as exc:
        errors = getattr(exc, "errors", lambda: [])()
        raise HTTPException(422, (errors[0].get("msg", "Password is too weak").replace("Value error, ", "") if errors else "Password is too weak")) from None
    ws = db.get(AiWorkspace, emp.workspace_id)
    org = db.get(Organization, emp.organization_id)
    if not ws.is_active:
        raise HTTPException(400, "This workspace is switched off. Ask your administrator.")
    if db.execute(select(User.id).where(User.email == emp.email)).first():
        raise HTTPException(409, "An account with this email already exists.")
    plans.check_room_for(db, org)
    user = User(
        organization_id=emp.organization_id,
        name=(name or emp.name).strip()[:120] or emp.name,
        email=emp.email,
        password_hash=hash_password(password),
        role="custom",
        custom_role_id=ws.role_id,
        is_active=True,
    )
    db.add(user)
    db.flush()
    emp.user_id, emp.status, emp.accepted_at = user.id, "accepted", now()
    emp.invite_token_hash = emp.invite_expires_at = None  # single use
    audit.record(db, user, "update", "ai_employee", emp.id, f"{emp.email} accepted the invitation and created a login", organization_id=emp.organization_id)
    db.commit()
    return user


# --------------------------------------------------------------------------- #
# Activity, usage, settings
# --------------------------------------------------------------------------- #
def employee_activity(db: Session, org_id: str, emp_id: str, limit: int = 60) -> Dict[str, Any]:
    emp = get_employee(db, org_id, emp_id)
    rows = []
    if emp.user_id:
        rows = db.execute(select(AuditLog).where(AuditLog.organization_id == org_id, AuditLog.user_id == emp.user_id).order_by(AuditLog.created_at.desc()).limit(limit)).scalars().all()
    messages = db.execute(select(func.count()).select_from(AiMessage).where(AiMessage.user_id == (emp.user_id or ""), AiMessage.role == "user")).scalar_one() if emp.user_id else 0
    return {
        "employee": employee_out(emp),
        "messageCount": messages,  # counts only: the owner does not read an employee's private chats
        "events": [{"at": _iso(r.created_at), "action": r.action, "entity": r.entity_type, "summary": r.summary} for r in rows],
    }


def audit_history(db: Session, org_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    ids = [uid for (uid,) in db.execute(select(AiEmployee.user_id).where(AiEmployee.organization_id == org_id, AiEmployee.user_id.is_not(None))).all()]
    if not ids:
        return []
    rows = db.execute(select(AuditLog).where(AuditLog.organization_id == org_id, AuditLog.user_id.in_(ids)).order_by(AuditLog.created_at.desc()).limit(limit)).scalars().all()
    return [{"at": _iso(r.created_at), "user": r.user_name, "action": r.action, "entity": r.entity_type, "summary": r.summary} for r in rows]


def settings_out(db: Session, org_id: str) -> Dict[str, Any]:
    s = usage.org_settings(db, org_id)
    spent = usage.spent(db, org_id)
    return {
        "aiEnabled": s.ai_enabled,
        "monthlyBudgetUsd": float(s.monthly_budget_usd),
        "defaultEmployeeBudgetUsd": float(s.default_employee_budget_usd),
        "defaultDailyCallLimit": s.default_daily_call_limit,
        "spentThisMonthUsd": float(round(spent, 4)),
        "keyConfigured": usage.ai_core.configured(),  # whether a key exists - never the key
        "model": get_settings().workspace_ai_model,
        "visionModel": get_settings().workspace_vision_model,
    }


def update_settings(db: Session, org_id: str, actor: User, body: Dict[str, Any]) -> Dict[str, Any]:
    s = usage.org_settings(db, org_id)
    if body.get("aiEnabled") is not None:
        s.ai_enabled = bool(body["aiEnabled"])
    for key, attr in (("monthlyBudgetUsd", "monthly_budget_usd"), ("defaultEmployeeBudgetUsd", "default_employee_budget_usd")):
        if body.get(key) is not None:
            v = Decimal(str(body[key]))
            if v < 0 or v > 100000:
                raise HTTPException(422, "Enter a budget between 0 and 100000.")
            setattr(s, attr, v)
    if body.get("defaultDailyCallLimit") is not None:
        n = int(body["defaultDailyCallLimit"])
        if not 0 <= n <= 100000:
            raise HTTPException(422, "Enter a daily limit between 0 and 100000.")
        s.default_daily_call_limit = n
    audit.record(db, actor, "update", "ai_settings", org_id, "Updated AI budget and limits")
    db.commit()
    return settings_out(db, org_id)


def usage_report(db: Session, org_id: str, days: int = 30) -> Dict[str, Any]:
    days = max(1, min(days, 365))
    since = now() - timedelta(days=days)
    month = usage._month_start()

    def totals(start: datetime) -> Dict[str, Any]:
        calls, inp, out, cost = db.execute(
            select(func.count(), func.coalesce(func.sum(AiUsage.input_tokens), 0), func.coalesce(func.sum(AiUsage.output_tokens), 0), func.coalesce(func.sum(AiUsage.cost_usd), 0)).where(
                AiUsage.organization_id == org_id, AiUsage.created_at >= start
            )
        ).one()
        return {"calls": calls, "inputTokens": int(inp), "outputTokens": int(out), "costUsd": float(round(Decimal(str(cost)), 6))}

    names = {uid: (n, e) for uid, n, e in db.execute(select(User.id, User.name, User.email).where(User.organization_id == org_id)).all()}
    by_emp = [
        {"userId": uid, "name": names.get(uid, ("Unknown", ""))[0], "email": names.get(uid, ("", ""))[1], "calls": n, "inputTokens": int(i), "outputTokens": int(o), "costUsd": float(round(Decimal(str(c)), 6))}
        for uid, n, i, o, c in db.execute(
            select(AiUsage.user_id, func.count(), func.sum(AiUsage.input_tokens), func.sum(AiUsage.output_tokens), func.sum(AiUsage.cost_usd))
            .where(AiUsage.organization_id == org_id, AiUsage.created_at >= since)
            .group_by(AiUsage.user_id)
            .order_by(func.sum(AiUsage.cost_usd).desc())
        ).all()
    ]
    by_feature = [
        {"feature": f, "calls": n, "inputTokens": int(i), "outputTokens": int(o), "costUsd": float(round(Decimal(str(c)), 6))}
        for f, n, i, o, c in db.execute(
            select(AiUsage.feature, func.count(), func.sum(AiUsage.input_tokens), func.sum(AiUsage.output_tokens), func.sum(AiUsage.cost_usd)).where(AiUsage.organization_id == org_id, AiUsage.created_at >= since).group_by(AiUsage.feature)
        ).all()
    ]
    daily: Dict[str, Dict[str, Any]] = {}
    for created, inp, out, cost in db.execute(select(AiUsage.created_at, AiUsage.input_tokens, AiUsage.output_tokens, AiUsage.cost_usd).where(AiUsage.organization_id == org_id, AiUsage.created_at >= since)).all():
        d = _aware(created).date().isoformat()
        row = daily.setdefault(d, {"date": d, "calls": 0, "tokens": 0, "costUsd": 0.0})
        row["calls"] += 1
        row["tokens"] += int(inp) + int(out)
        row["costUsd"] = round(row["costUsd"] + float(cost), 6)
    answered = db.execute(select(func.count()).select_from(AiMessage).where(AiMessage.organization_id == org_id, AiMessage.role == "assistant", AiMessage.created_at >= since)).scalar_one()
    with_ai = db.execute(select(func.count()).select_from(AiMessage).where(AiMessage.organization_id == org_id, AiMessage.role == "assistant", AiMessage.created_at >= since, AiMessage.meta.like('%"used_ai": true%'))).scalar_one()
    return {
        "days": days,
        "today": totals(now().replace(hour=0, minute=0, second=0, microsecond=0)),
        "month": totals(month),
        "period": totals(since),
        "byEmployee": by_emp,
        "byFeature": by_feature,
        "daily": sorted(daily.values(), key=lambda r: r["date"]),
        "answers": {"total": answered, "usedAi": with_ai, "withoutAi": max(answered - with_ai, 0)},
        "settings": settings_out(db, org_id),
    }


def overview(db: Session, org_id: str) -> Dict[str, Any]:
    counts = dict(db.execute(select(AiEmployee.status, func.count()).where(AiEmployee.organization_id == org_id).group_by(AiEmployee.status)).all())
    return {
        "workspaces": len(list_workspaces(db, org_id)),
        "employees": {s: counts.get(s, 0) for s in INVITE_STATUSES},
        "settings": settings_out(db, org_id),
        "emailConfigured": mail.smtp_configured(),
    }


def feature_labels() -> Dict[str, str]:
    return {f.key: f.label for f in base_permissions.FEATURES}
