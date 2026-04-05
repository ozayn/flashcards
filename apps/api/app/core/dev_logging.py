"""
Development-only: filter uvicorn access logs so routine successful API polling is quieter.

Production is unchanged. Warnings/errors and non-2xx responses are always logged.
"""
from __future__ import annotations

import logging
import os
import re

_IS_PRODUCTION = os.environ.get("ENVIRONMENT", "development").lower() == "production"

# Uvicorn access line: 127.0.0.1:53498 - "GET /users HTTP/1.1" 200
_ACCESS_LINE_RE = re.compile(r'"([A-Z]+) ([^ ]+) HTTP/[^"]+" (\d{3})')

_FILTER_ATTACHED = False


def attach_dev_access_log_filter() -> None:
    """Register filter on uvicorn.access (idempotent). Call from FastAPI startup."""
    global _FILTER_ATTACHED
    if _IS_PRODUCTION or _FILTER_ATTACHED:
        return
    logging.getLogger("uvicorn.access").addFilter(_QuietRoutineSuccessfulAccessFilter())
    _FILTER_ATTACHED = True


class _QuietRoutineSuccessfulAccessFilter(logging.Filter):
    """Drop routine 2xx lines for high-churn read paths used by the web app in dev."""

    def filter(self, record: logging.LogRecord) -> bool:
        if _IS_PRODUCTION:
            return True
        msg = record.getMessage()
        m = _ACCESS_LINE_RE.search(msg)
        if not m:
            return True
        raw_path, status_s = m.group(2), m.group(3)
        status = int(status_s)
        if status >= 400:
            return True
        if not (200 <= status < 300):
            return True
        path = raw_path.split("?", 1)[0]
        if _is_quiet_routine_path(path):
            return False
        return True


def _is_quiet_routine_path(path: str) -> bool:
    if path == "/favicon.ico":
        return True
    if path == "/users" or path.startswith("/users/"):
        return True
    if path.startswith("/categories"):
        return True
    if path.startswith("/decks"):
        return True
    return False
