"""Tables of the AI Employee Workspace ("Connect to Mobile").

- AiWorkspace      a department workspace the owner defines: permissions, tools, config.
- AiEmployee       one invited employee in a workspace (invite status, AI limits).
- AiChat/AiMessage an employee's private chat history (never visible to other employees).
- AiPendingAction  a draft or a sensitive operation waiting for the employee's confirmation.
- AiAttachment     an uploaded photo / file, readable only by its uploader.
- AiUsage          one row per Claude API call (tokens, estimated cost) for the owner's dashboard.
- AiCache          reusable, non-sensitive results (routing plans, photo reads) so the same
                   request never costs a second API call.
- AiOrgSettings    the owner's switches and budgets.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.db import Base
from backend.models import OrgScopedMixin, TimestampMixin, new_id, utcnow


class AiWorkspace(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "ai_workspaces"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_ai_workspace_org_name"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    department: Mapped[str] = mapped_column(String(80), default="General", nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300))
    # JSON {"features": {key: [actions]}, "financial": bool} (services/workspace/perms.py)
    permissions: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # JSON {"allow_auto": bool, "allow_manual": bool, "default_mode": "auto"|"manual", "confirm_writes": bool, "context": str}
    config: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # The hidden OrgRole that carries this workspace's permissions into the normal API guards.
    role_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    employees: Mapped[list["AiEmployee"]] = relationship(back_populates="workspace", cascade="all, delete-orphan")


class AiEmployee(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "ai_employees"
    __table_args__ = (UniqueConstraint("organization_id", "email", name="uq_ai_employee_org_email"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(String(32), ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(32), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    job_title: Mapped[Optional[str]] = mapped_column(String(80))
    # pending (invited) | accepted (password set) | active (has used the workspace) | revoked
    status: Mapped[str] = mapped_column(String(10), default="pending", nullable=False, index=True)
    invite_token_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True)
    invite_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    invited_by: Mapped[Optional[str]] = mapped_column(String(32))
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # The owner's controls over this employee's AI.
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_auto: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_manual: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Estimated USD per calendar month / Claude calls per day; NULL = the organization default.
    monthly_budget_usd: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    daily_call_limit: Mapped[Optional[int]] = mapped_column(Integer)
    preferred_mode: Mapped[str] = mapped_column(String(10), default="auto", nullable=False)

    workspace: Mapped[AiWorkspace] = relationship(back_populates="employees")


class AiChat(TimestampMixin, OrgScopedMixin, Base):
    __tablename__ = "ai_chats"
    __table_args__ = (Index("ix_ai_chats_user_updated", "user_id", "updated_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(String(32), ForeignKey("ai_workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), default="New chat", nullable=False)
    # Rolling summary of older turns, so history sent to Claude stays short.
    summary: Mapped[Optional[str]] = mapped_column(Text)
    summarized_upto: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    chat_id: Mapped[str] = mapped_column(String(32), ForeignKey("ai_chats.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(10), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON: cards, attachments, pending_action_id, used_ai, tool, mode...
    meta: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class AiPendingAction(Base):
    __tablename__ = "ai_pending_actions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(String(32), nullable=False)
    chat_id: Mapped[str] = mapped_column(String(32), ForeignKey("ai_chats.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    tool: Mapped[str] = mapped_column(String(60), nullable=False)
    args: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # draft (still missing details) | ready (waiting for confirmation) | done | cancelled | expired
    status: Mapped[str] = mapped_column(String(10), default="draft", nullable=False, index=True)
    result: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AiAttachment(Base):
    __tablename__ = "ai_attachments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    chat_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    filename: Mapped[str] = mapped_column(String(200), nullable=False)
    content_type: Mapped[str] = mapped_column(String(60), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(400), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AiUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (Index("ix_ai_usage_org_created", "organization_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    workspace_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    user_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    feature: Mapped[str] = mapped_column(String(30), nullable=False)  # understand | photo | summarize
    model: Mapped[str] = mapped_column(String(60), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(12, 6), default=Decimal("0"), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


class AiCache(Base):
    __tablename__ = "ai_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AiOrgSettings(Base):
    __tablename__ = "ai_org_settings"

    organization_id: Mapped[str] = mapped_column(String(32), ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monthly_budget_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("20"), nullable=False)
    default_employee_budget_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("5"), nullable=False)
    default_daily_call_limit: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
