"""join the Rooman One Books history

The Books that ran inside Rooman One (CT103) carried two revisions of its own
after d3f8a1c6e9b2 - e5b9d2f7a1c3 (Rooman One integration: contact party ids,
outbox, processed events) and f2a6c8e1d4b7 (records sent by other Rooman
apps: source_app / source_ref). They are kept as a side branch here, so a
database made by either Books upgrades to this head: a Rooman One database
gets this repository's revisions, and a database made here gets those two
(nullable columns and empty tables, harmless).

Revision ID: e2b8c4f6a9d3
Revises: d1a7f3c5e8b2, f2a6c8e1d4b7
Create Date: 2026-10-27 17:00:00.000000
"""
from __future__ import annotations


revision = 'e2b8c4f6a9d3'
down_revision = ('d1a7f3c5e8b2', 'f2a6c8e1d4b7')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
