"""
Canonical email form for identity matching (admin allowlist, OAuth, duplicates).

Gmail / Googlemail only: strip +tags, remove dots in local part, googlemail.com → gmail.com.
Other domains: trim + lowercase only.

Keep in sync with: apps/web/lib/email-identity.ts
"""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


def normalize_email_for_identity(email: str | None) -> str:
    if not email or not isinstance(email, str):
        return ""
    s = email.strip().lower()
    if not s or "@" not in s:
        return s
    local, _, domain = s.rpartition("@")
    if not local:
        return s
    domain = domain.strip().lower()
    if domain in ("gmail.com", "googlemail.com"):
        local_base = local.split("+", 1)[0]
        local_norm = local_base.replace(".", "")
        if not local_norm:
            return s
        return f"{local_norm}@gmail.com"
    return f"{local}@{domain}"


async def list_users_matching_email_identity(
    db: AsyncSession, normalized: str
) -> list[User]:
    """Return users whose stored email matches this canonical identity."""
    if not normalized or "@" not in normalized:
        return []
    _, _, dom = normalized.rpartition("@")
    if dom == "gmail.com":
        result = await db.execute(
            select(User).where(
                or_(
                    User.email.ilike("%@gmail.com"),
                    User.email.ilike("%@googlemail.com"),
                )
            )
        )
    else:
        result = await db.execute(
            select(User).where(func.lower(User.email) == normalized)
        )
    out: list[User] = []
    for u in result.scalars().all():
        if normalize_email_for_identity(u.email) == normalized:
            out.append(u)
    return out
