"""Service API for the apps (private network only): the shared customer record
and what an organization is entitled to.

Every call needs a service token from ``POST /token`` with the right scope.
The calling app comes from the token, never from the request body.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from core_api import keys
from core_api.db import get_db
from core_api.models import AuditLog, ExternalId, Organization, OrgApp, OrgSubscription, Party
from core_api.routers.oauth import SERVICE_AUDIENCE

router = APIRouter(prefix="/internal", tags=["Internal (apps)"])


# --------------------------------------------------------------------------- #
# Service authentication
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Service:
    client_id: str
    app: str
    scopes: frozenset[str]


def require_scope(scope: str):
    def _guard(request: Request, db: Session = Depends(get_db)) -> Service:
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "A service token is required.", headers={"WWW-Authenticate": "Bearer"})
        try:
            claims = keys.verify(db, auth[7:].strip(), SERVICE_AUDIENCE)
        except (jwt.PyJWTError, ValueError):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "The service token is not valid or has expired.", headers={"WWW-Authenticate": "Bearer"}
            )
        if claims.get("typ") != "service":
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This is not a service token.")
        service = Service(
            client_id=claims.get("client_id", ""), app=claims.get("app", ""), scopes=frozenset(str(claims.get("scope", "")).split())
        )
        if scope not in service.scopes:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"This client lacks the {scope} scope.")
        request.state.service = service
        return service

    return _guard


def _org(db: Session, org_id: uuid.UUID) -> Organization:
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found.")
    return org


# --------------------------------------------------------------------------- #
# Parties: the shared customer record
# --------------------------------------------------------------------------- #
PartyType = Literal["customer", "vendor", "both"]


class PartyIn(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    org_id: uuid.UUID
    display_name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    type: PartyType = "customer"
    # The record's id inside the calling app (e.g. the Books contact id): the
    # surest way to find the same party again.
    local_id: str | None = Field(default=None, max_length=64)

    @field_validator("email", "phone", "local_id", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        return value or None


class PartyUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    org_id: uuid.UUID
    display_name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    type: PartyType = "customer"

    @field_validator("email", "phone", mode="before")
    @classmethod
    def _blank_is_none(cls, value):
        return value or None


class PartyOut(BaseModel):
    party_id: uuid.UUID
    org_id: uuid.UUID
    display_name: str
    email: str | None
    phone: str | None
    type: str
    created: bool = False


def _merge_type(current: str, incoming: str) -> str:
    return current if current == incoming else "both"


def _out(party: Party, created: bool = False) -> PartyOut:
    return PartyOut(
        party_id=party.id,
        org_id=party.org_id,
        display_name=party.display_name,
        email=party.email,
        phone=party.phone,
        type=party.type,
        created=created,
    )


def _find(db: Session, body: PartyIn, app: str) -> Party | None:
    """Same party: by the app's own id first, then by email, then by phone - always within the organization."""
    if body.local_id:
        link = db.scalar(
            select(ExternalId).where(ExternalId.org_id == body.org_id, ExternalId.app_key == app, ExternalId.local_id == body.local_id)
        )
        if link is not None:
            return db.get(Party, link.party_id)
    if body.email:
        party = db.scalar(
            select(Party).where(Party.org_id == body.org_id, func.lower(Party.email) == body.email.lower()).order_by(Party.created_at)
        )
        if party is not None:
            return party
    if body.phone:
        return db.scalar(select(Party).where(Party.org_id == body.org_id, Party.phone == body.phone).order_by(Party.created_at))
    return None


def _link(db: Session, party: Party, app: str, local_id: str | None) -> None:
    if not local_id:
        return
    exists = db.scalar(
        select(ExternalId).where(ExternalId.org_id == party.org_id, ExternalId.app_key == app, ExternalId.local_id == local_id)
    )
    if exists is None and db.scalar(select(ExternalId).where(ExternalId.party_id == party.id, ExternalId.app_key == app)) is None:
        db.add(ExternalId(org_id=party.org_id, party_id=party.id, app_key=app, local_id=local_id))


@router.post("/parties", response_model=PartyOut)
def find_or_create_party(body: PartyIn, service: Service = Depends(require_scope("parties:write")), db: Session = Depends(get_db)):
    _org(db, body.org_id)
    party = _find(db, body, service.app)
    created = party is None
    if created:
        party = Party(
            org_id=body.org_id,
            display_name=body.display_name,
            email=body.email.lower() if body.email else None,
            phone=body.phone,
            type=body.type,
        )
        db.add(party)
        db.flush()
        db.add(AuditLog(org_id=body.org_id, actor_type="service", actor_id=service.client_id, action="party.created", target=str(party.id)))
    else:
        party.type = _merge_type(party.type, body.type)
    _link(db, party, service.app, body.local_id)
    db.commit()
    return _out(party, created)


@router.patch("/parties/{party_id}", response_model=PartyOut)
def update_party(
    party_id: uuid.UUID, body: PartyUpdate, service: Service = Depends(require_scope("parties:write")), db: Session = Depends(get_db)
):
    party = db.get(Party, party_id)
    # Another organization's party answers exactly like a missing one.
    if party is None or party.org_id != body.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Party not found.")
    party.display_name = body.display_name
    party.email = body.email.lower() if body.email else None
    party.phone = body.phone
    party.type = body.type if party.type == body.type else _merge_type(party.type, body.type)
    db.add(AuditLog(org_id=party.org_id, actor_type="service", actor_id=service.client_id, action="party.updated", target=str(party.id)))
    db.commit()
    return _out(party)


@router.get("/parties/{party_id}", response_model=PartyOut)
def get_party(
    party_id: uuid.UUID, org_id: uuid.UUID, _service: Service = Depends(require_scope("parties:read")), db: Session = Depends(get_db)
):
    party = db.get(Party, party_id)
    if party is None or party.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Party not found.")
    return _out(party)


# --------------------------------------------------------------------------- #
# Entitlements: which apps and modules an organization may use
# --------------------------------------------------------------------------- #
class AppEntitlement(BaseModel):
    app: str
    enabled: bool
    subscription_status: str | None = None
    modules: list[str] | None = None  # None = every module of the app
    cycle: str | None = None
    trial_ends_at: datetime | None = None


class Entitlements(BaseModel):
    org_id: uuid.UUID
    code: str
    status: str
    trial_ends_at: datetime | None
    apps: list[AppEntitlement]


@router.get("/orgs/{org_id}/entitlements", response_model=Entitlements)
def entitlements(org_id: uuid.UUID, _service: Service = Depends(require_scope("entitlements:read")), db: Session = Depends(get_db)):
    org = _org(db, org_id)
    apps = {a.app_key: a for a in db.scalars(select(OrgApp).where(OrgApp.org_id == org_id))}
    subs = {s.app_key: s for s in db.scalars(select(OrgSubscription).where(OrgSubscription.org_id == org_id))}
    out = []
    for key in sorted(set(apps) | set(subs)):
        sub = subs.get(key)
        app = apps.get(key)
        out.append(
            AppEntitlement(
                app=key,
                enabled=app is not None and app.status == "active",
                subscription_status=sub.status if sub else None,
                modules=sub.modules if sub else None,
                cycle=sub.cycle if sub else None,
                trial_ends_at=sub.trial_ends_at if sub else None,
            )
        )
    return Entitlements(org_id=org.id, code=org.code, status=org.status, trial_ends_at=org.trial_ends_at, apps=out)
