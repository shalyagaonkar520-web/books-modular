"""Custom roles of an organization: create, edit, delete, and give one to a user."""

from __future__ import annotations

import json
from typing import Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.models import OrgRole, User
from backend.schemas.common import APIModel
from backend.services import audit, permissions
from backend.services.tenancy import get_or_404


class RoleIn(APIModel):
    name: str
    description: Optional[str] = None
    permissions: Dict[str, str] = {}


class RoleOut(APIModel):
    id: str
    name: str
    description: Optional[str] = None
    permissions: Dict[str, str]
    user_count: int = 0


def _clean(payload: RoleIn) -> tuple[str, Optional[str], Dict[str, str]]:
    name = (payload.name or "").strip()
    if not 2 <= len(name) <= 60:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Give the role a name of 2 to 60 characters.")
    if name.lower() in ("admin", "staff", "viewer", "employee", "custom"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"“{name}” is a built-in role; choose another name.")
    unknown = sorted(set(payload.permissions) - set(permissions.FEATURE_KEYS))
    bad = sorted(k for k, v in payload.permissions.items() if v not in permissions.LEVELS)
    if unknown or bad:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown feature or level: {', '.join(unknown + bad)}")
    perms = permissions.normalize(payload.permissions)
    if all(v == permissions.NONE for v in perms.values()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Give the role View or Edit on at least one feature.")
    description = (payload.description or "").strip()[:250] or None
    return name, description, perms


def _name_taken(db: Session, org_id: str, name: str, exclude_id: Optional[str] = None) -> bool:
    stmt = select(OrgRole.id).where(OrgRole.organization_id == org_id, func.lower(OrgRole.name) == name.lower())
    if exclude_id:
        stmt = stmt.where(OrgRole.id != exclude_id)
    return db.execute(stmt).first() is not None


def _out(db: Session, role: OrgRole) -> RoleOut:
    users = db.scalar(select(func.count()).select_from(User).where(User.custom_role_id == role.id, User.role == "custom")) or 0
    return RoleOut(
        id=role.id, name=role.name, description=role.description, permissions=permissions.normalize(role.permissions), user_count=users
    )


def list_roles(db: Session, org_id: str) -> List[RoleOut]:
    rows = db.execute(select(OrgRole).where(OrgRole.organization_id == org_id).order_by(OrgRole.name)).scalars().all()
    return [_out(db, r) for r in rows]


def create_role(db: Session, org_id: str, actor, payload: RoleIn) -> RoleOut:
    name, description, perms = _clean(payload)
    if _name_taken(db, org_id, name):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A role named “{name}” already exists.")
    role = OrgRole(organization_id=org_id, name=name, description=description, permissions=json.dumps(perms))
    db.add(role)
    db.flush()
    audit.record(db, actor, "create", "role", role.id, f"Created role {name}", organization_id=org_id)
    db.commit()
    return _out(db, role)


def update_role(db: Session, org_id: str, actor, role_id: str, payload: RoleIn) -> RoleOut:
    role = get_or_404(db, OrgRole, role_id, org_id, "Role")
    name, description, perms = _clean(payload)
    if _name_taken(db, org_id, name, exclude_id=role.id):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A role named “{name}” already exists.")
    role.name, role.description, role.permissions = name, description, json.dumps(perms)
    audit.record(db, actor, "update", "role", role.id, f"Updated role {name}", organization_id=org_id)
    db.commit()
    return _out(db, role)


def delete_role(db: Session, org_id: str, actor, role_id: str) -> None:
    role = get_or_404(db, OrgRole, role_id, org_id, "Role")
    in_use = _out(db, role).user_count
    if in_use:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{in_use} user(s) have this role. Give them another role first.")
    audit.record(db, actor, "delete", "role", role.id, f"Deleted role {role.name}", organization_id=org_id)
    db.delete(role)
    db.commit()


def resolve(db: Session, org_id: str, role: Optional[str], custom_role_id: Optional[str]) -> Optional[str]:
    """The custom_role_id to store for a user given ``role``; checks it belongs to the organization."""
    if role != "custom":
        if custom_role_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A custom role can only be given with role “custom”.")
        return None
    if not custom_role_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose which custom role this user gets.")
    return get_or_404(db, OrgRole, custom_role_id, org_id, "Role").id
