"""
ALLOWED_LOGIN_EMAILS: comma-separated; trim + lowercase comparison only.

Keep parsing aligned with: apps/web/lib/login-email-allowlist.ts

Not Gmail-normalized: compare email.strip().lower() to each entry the same way.
Dots in gmail.com local parts and +tags are NOT folded (use the exact spelling
Google sends, lowercased, in the allowlist).
"""

from __future__ import annotations

import os
from functools import lru_cache


@lru_cache(maxsize=1)
def _allowed_login_email_set() -> frozenset[str]:
    raw = (os.environ.get("ALLOWED_LOGIN_EMAILS") or "").strip()
    out: list[str] = []
    for part in raw.split(","):
        s = part.strip().lower()
        if s:
            out.append(s)
    return frozenset(out)


def clear_login_email_allowlist_cache() -> None:
    _allowed_login_email_set.cache_clear()


def email_is_allowed_for_login(email: str | None) -> bool:
    if not email or not isinstance(email, str):
        return False
    allow = _allowed_login_email_set()
    if not allow:
        return False
    return email.strip().lower() in allow


def allowed_login_allowlist_entry_count() -> int:
    """For diagnostics only (e.g. oauth deny logs)."""
    return len(_allowed_login_email_set())
