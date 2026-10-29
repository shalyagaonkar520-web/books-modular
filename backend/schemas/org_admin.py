"""Organization schemas used by the platform (super admin) API."""

from __future__ import annotations

from backend.schemas.common import APIModel


class ApproveOrganizationRequest(APIModel):
    # Kept so older clients that still send a body are accepted.
    pass
