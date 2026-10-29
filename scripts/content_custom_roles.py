"""Add the custom roles texts (Settings → Users & roles) to both copies of the
default app content. Run from the repo root: python scripts/content_custom_roles.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from content_phase1 import main  # noqa: E402

TEXTS = {
    "common.noRoleAccess": "Your role doesn't include this page. Ask your administrator for access.",
    "settings.users.role.custom": "Custom role",
    "settings.roles.title": "Roles",
    "settings.roles.subtitle": "Make your own roles, such as Cashier or Accountant, and choose for each feature: No access, View or Edit.",
    "settings.roles.new": "New role",
    "settings.roles.builtin.admin": "Everything, including users, roles and settings.",
    "settings.roles.builtin.staff": "Creates and edits day-to-day work; no banking, accounts or payroll.",
    "settings.roles.builtin.viewer": "Sees everything, changes nothing.",
    "settings.roles.empty.title": "No custom roles yet",
    "settings.roles.empty.body": "Create one, then pick it when you add a user or change a user's role.",
    "settings.roles.col.name": "Role",
    "settings.roles.col.access": "Access",
    "settings.roles.col.users": "Users",
    "settings.roles.summary": "Edit on {edit} · View on {view} features",
    "settings.roles.edit": "Edit",
    "settings.roles.newTitle": "New role",
    "settings.roles.editTitle": "Edit role: {name}",
    "settings.roles.editorSubtitle": "Click a level for each feature. No access hides it, View shows it read-only, Edit allows changes.",
    "settings.roles.name": "Role name",
    "settings.roles.namePlaceholder": "e.g. Cashier, Accountant, Store manager",
    "settings.roles.description": "Description (optional)",
    "settings.roles.setAll": "Set every feature to:",
    "settings.roles.groupAll": "All {level}",
    "settings.roles.level.none": "No access",
    "settings.roles.level.view": "View",
    "settings.roles.level.edit": "Edit",
    "settings.roles.save": "Save role",
    "settings.roles.created": "Role {name} created",
    "settings.roles.updated": "Role {name} saved. Its users get the change straight away.",
    "settings.roles.deleted": "Role {name} deleted",
    "settings.roles.deleteTitle": "Delete role",
    "settings.roles.deleteConfirm": "Delete the role {name}? A role that users still have cannot be deleted; give them another role first.",
    "settings.invite.role.custom": "{name} (custom role)",
    "settings.invite.customRoleHint": "They get exactly what the {name} role allows. Change the role later under Roles.",
    "settings.invite.noCustomRoles": "Need a role other than Admin, Staff or Viewer? Create one under Roles below, then pick it here.",
}

if __name__ == "__main__":
    main(TEXTS)
