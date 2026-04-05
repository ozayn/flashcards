"""Signed session token for /admin page access (shared secret: ADMIN_PAGE_PASSWORD)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time


def verify_admin_page_token(token: str | None) -> bool:
    """
    Validate token produced by the Next.js POST /api/admin/unlock route.
    Format: base64url(JSON {"exp": unix_seconds}).hex_hmac_sha256
    """
    if not token or "." not in token:
        return False
    secret = os.environ.get("ADMIN_PAGE_PASSWORD", "")
    if not secret:
        return False
    payload_b64, sig = token.rsplit(".", 1)
    if not payload_b64 or not sig:
        return False
    try:
        pad = "=" * (-len(payload_b64) % 4)
        raw = base64.urlsafe_b64decode((payload_b64 + pad).encode("ascii"))
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return False
    exp = data.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, sig)
