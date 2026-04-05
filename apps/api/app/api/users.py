import hmac
import logging
import os
import re
import secrets
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import User
from app.schemas.user import (
    GoogleOAuthSyncRequest,
    UserCreate,
    UserResponse,
    UserSettingsResponse,
    UserSettingsUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

_SUB_SANITIZE_RE = re.compile(r"[^a-zA-Z0-9]+")


def _synthetic_email_for_google_sub(google_sub: str) -> str:
    safe = _SUB_SANITIZE_RE.sub("-", google_sub).strip("-")[:200] or "sub"
    return f"g-{safe}@oauth.memo.local"


async def _upsert_google_oauth_user(db: AsyncSession, payload: GoogleOAuthSyncRequest) -> User:
    """Find or create a user row for this Google account. Does not touch legacy-only rows."""
    result = await db.execute(select(User).where(User.google_sub == payload.google_sub))
    existing = result.scalar_one_or_none()
    if existing:
        if payload.name and existing.name != payload.name:
            existing.name = payload.name
        await db.flush()
        await db.refresh(existing)
        return existing

    preferred = (payload.email or "").strip().lower() or None
    if preferred:
        clash = await db.execute(select(User).where(User.email == preferred))
        row = clash.scalar_one_or_none()
        if row is not None and row.google_sub is None:
            preferred = None
        elif row is not None and row.google_sub == payload.google_sub:
            return row
        elif row is not None:
            preferred = None

    email_to_use = preferred or _synthetic_email_for_google_sub(payload.google_sub)
    for _ in range(8):
        taken = await db.execute(select(User).where(User.email == email_to_use))
        if taken.scalar_one_or_none() is None:
            break
        email_to_use = f"g-{secrets.token_hex(6)}@oauth.memo.local"

    user = User(
        email=email_to_use,
        name=payload.name.strip() or "Google user",
        google_sub=payload.google_sub,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    logger.info("Created Google-linked user id=%s", user.id)
    return user


@router.post("/oauth/google", response_model=UserResponse)
async def sync_google_oauth_user(
    payload: GoogleOAuthSyncRequest,
    db: AsyncSession = Depends(get_db),
    x_memo_oauth_secret: str | None = Header(default=None, alias="X-Memo-OAuth-Secret"),
):
    """
    Called by the Next.js server after Google OAuth (shared secret).
    Not used by browser clients directly.
    """
    expected = (os.environ.get("MEMO_OAUTH_SYNC_SECRET") or "").strip()
    if (
        not expected
        or not x_memo_oauth_secret
        or len(x_memo_oauth_secret) != len(expected)
        or not hmac.compare_digest(x_memo_oauth_secret, expected)
    ):
        raise HTTPException(status_code=401, detail="Invalid or missing OAuth sync secret")
    user = await _upsert_google_oauth_user(db, payload)
    return UserResponse.model_validate(user)


@router.get("", response_model=List[UserResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    """Get all users."""
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user."""
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email,
        name=payload.name,
        role=payload.role,
        plan=payload.plan,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/{user_id}/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get user study settings."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserSettingsResponse(
        think_delay_enabled=user.think_delay_enabled,
        think_delay_ms=user.think_delay_ms,
        card_style=getattr(user, "card_style", "paper"),
    )


@router.patch("/{user_id}/settings", response_model=UserSettingsResponse)
async def update_user_settings(
    user_id: str,
    payload: UserSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update user study settings."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.think_delay_enabled is not None:
        user.think_delay_enabled = payload.think_delay_enabled
    if payload.think_delay_ms is not None:
        user.think_delay_ms = payload.think_delay_ms
    if payload.card_style is not None:
        user.card_style = payload.card_style
    await db.flush()
    await db.refresh(user)
    return UserSettingsResponse(
        think_delay_enabled=user.think_delay_enabled,
        think_delay_ms=user.think_delay_ms,
        card_style=getattr(user, "card_style", "paper"),
    )
