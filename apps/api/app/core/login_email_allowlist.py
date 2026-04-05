"""
ALLOWED_LOGIN_EMAILS: comma-separated; trim + lowercase comparison only.

Keep parsing aligned with: apps/web/lib/login-email-allowlist.ts
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
