"""Record and query per-user activity (private; not a global feed).

Tracked event_type values (v1):
- ``signed_in``: OAuth profile sync after Google sign-in (see ``/users/oauth/google``).
- ``deck_created``: user created a deck (optional meta: deck_id, deck_name).

Callers append new types here as product events are added.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_activity import UserActivity


async def record_user_activity(
    db: AsyncSession,
    user_id: str,
    event_type: str,
    meta: Optional[dict[str, Any]] = None,
) -> None:
    row = UserActivity(
        id=str(uuid4()),
        user_id=user_id,
        event_type=event_type,
        meta_json=json.dumps(meta, separators=(",", ":")) if meta else None,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    await db.flush()


async def list_user_activity(
    db: AsyncSession, user_id: str, *, limit: int = 10
) -> list[UserActivity]:
    lim = max(1, min(limit, 50))
    result = await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == user_id)
        .order_by(desc(UserActivity.created_at))
        .limit(lim)
    )
    return list(result.scalars().all())
