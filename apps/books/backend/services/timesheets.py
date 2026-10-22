"""Time entries in their API shape, shared by time tracking, the employee
portal and the organization's user overview."""

from __future__ import annotations

from backend.models import TimeEntry
from backend.schemas.timetracking import TimeEntryOut


def entry_out(e: TimeEntry) -> TimeEntryOut:
    return TimeEntryOut(
        id=e.id,
        project_id=e.project_id,
        project_name=e.project.name,
        customer_name=e.project.customer.display_name if e.project.customer else None,
        user_id=e.user_id,
        user_name=e.user.name,
        date=e.date,
        hours=e.hours,
        description=e.description,
        is_billable=e.is_billable,
        invoice_id=e.invoice_id,
        created_at=e.created_at,
    )
