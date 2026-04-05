"""
ADMIN_EMAILS env: comma-separated; entries compared via normalize_email_for_identity.

Keep allowlist parsing rules aligned with: apps/web/lib/admin-email-allowlist.ts
"""

from __future__ import annotations

import os
from functools import lru_cache

from app.core.email_identity import normalize_email_for_identity


@lru_cache(maxsize=1)
def _normalized_admin_email_set() -> frozenset[str]:
    raw = (os.environ.get("ADMIN_EMAILS") or "").strip()
    out: list[str] = []
    for part in raw.split(","):
        s = part.strip()
        if not s:
            continue
        norm = normalize_email_for_identity(s)
        if norm:
            out.append(norm)
    return frozenset(out)


def clear_admin_email_cache() -> None:
    """For tests or reload scenarios."""
    _normalized_admin_email_set.cache_clear()


def email_is_admin_allowlisted(email: str | None) -> bool:
    if not email or not isinstance(email, str):
        return False
    norm = normalize_email_for_identity(email)
    if not norm:
        return False
    return norm in _normalized_admin_email_set()
