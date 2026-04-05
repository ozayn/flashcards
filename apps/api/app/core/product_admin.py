"""
Single product rule for elevated (admin) privileges.

True if any of:
- User.role is admin in the database, or
- Display name is the primary product admin (case-insensitive \"Azin\"), or
- Email is listed in PRODUCT_ADMIN_EMAILS (comma-separated, optional env override).
"""
from __future__ import annotations

import os

from app.models import User
from app.models.enums import UserRole

_PRODUCT_ADMIN_NAME_NORMALIZED = "azin"


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
