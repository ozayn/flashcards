"""Platform /admin API: signed-in backend user whose email matches ADMIN_EMAILS (identity-normalized)."""

from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_email_allowlist import email_is_admin_allowlisted
from app.core.database import get_db
from app.core.user_access import get_trusted_acting_user_id
from app.models import User


async def assert_acting_user_is_platform_admin(
    db: AsyncSession,
    trusted_id: Optional[str],
) -> User:
    """Same rule as /admin: acting user must be allowlisted via ADMIN_EMAILS."""
    if not trusted_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    result = await db.execute(select(User).where(User.id == trusted_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not email_is_admin_allowlisted(user.email):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_platform_admin(
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
) -> User:
    return await assert_acting_user_is_platform_admin(db, trusted_id)
