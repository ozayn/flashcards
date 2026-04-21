"""Helpers for timestamps stored as naive UTC in PostgreSQL."""

from __future__ import annotations

from datetime import datetime, timezone


def ensure_utc_aware(dt: datetime) -> datetime:
    """Attach UTC so JSON is ISO8601 with Z; browsers then show the viewer's local zone."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def ensure_utc_aware_optional(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return ensure_utc_aware(dt)
