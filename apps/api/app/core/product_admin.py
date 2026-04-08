"""
Single product rule for elevated (admin) privileges.

True if any of:
- User.role is admin in the database, or
- Display name is the primary product admin (case-insensitive \"Azin\"), or
- Email is listed in PRODUCT_ADMIN_EMAILS (comma-separated, optional env override).

Admin users table access labels (see ``user_access_role_for_admin_list``):
- owner: ADMIN_EMAILS platform allowlist (same rule as /admin API)
- admin: product admin via this module, but not platform owner
- user: everyone else
"""
from __future__ import annotations

import os
from typing import Literal

from app.core.admin_email_allowlist import email_is_admin_allowlisted
from app.models import User
from app.models.enums import UserRole

_PRODUCT_ADMIN_NAME_NORMALIZED = "azin"


def user_access_role_for_admin_list(user: User) -> Literal["owner", "admin", "user"]:
    """Display role for platform admin user list; uses ADMIN_EMAILS + product admin rules."""
    if email_is_admin_allowlisted(user.email):
        return "owner"
    if user_has_product_admin_access(user):
        return "admin"
    return "user"


def user_has_product_admin_access(user: User | None) -> bool:
    if user is None:
        return False
    if user.role == UserRole.admin:
        return True
    if (user.name or "").strip().casefold() == _PRODUCT_ADMIN_NAME_NORMALIZED:
        return True
    raw = os.environ.get("PRODUCT_ADMIN_EMAILS", "").strip()
    if raw and user.email:
        allowed = {e.strip().casefold() for e in raw.split(",") if e.strip()}
        if user.email.strip().casefold() in allowed:
            return True
    return False
