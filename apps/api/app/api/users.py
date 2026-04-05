import hmac
import logging
import os
import re
import secrets
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.email_identity import (
    list_users_matching_email_identity,
    normalize_email_for_identity,
)
from app.core.login_email_allowlist import email_is_allowed_for_login
from app.core.user_access import (
    assert_may_act_as_user,
    get_trusted_acting_user_id,
    list_users_visible_in_context,
)
from app.models import User
from app.schemas.user import (
    GoogleOAuthSyncRequest,
    UserCreate,
    UserProfileNameUpdate,
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
    norm = normalize_email_for_identity(payload.email or "")
    if norm:
        identity_matches = await list_users_matching_email_identity(db, norm)
        if identity_matches:
            preferred = None

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
    if not email_is_allowed_for_login(payload.email):
        raise HTTPException(
            status_code=403,
            detail="This email is not authorized to sign in yet.",
        )
    user = await _upsert_google_oauth_user(db, payload)
    return UserResponse.model_validate(user)


@router.get("", response_model=List[UserResponse])
async def get_users(
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """List users: public context sees legacy accounts only; signed-in sees those plus self."""
    users = await list_users_visible_in_context(db, trusted_id)
    return [UserResponse.model_validate(u) for u in users]


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user."""
    norm = normalize_email_for_identity(payload.email)
    if norm and await list_users_matching_email_identity(db, norm):
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


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get one user by id (for profile and client UIs)."""
    user = await assert_may_act_as_user(db, trusted_id, user_id)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}/profile", response_model=UserResponse)
async def update_user_profile_name(
    user_id: str,
    payload: UserProfileNameUpdate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Update display name only."""
    user = await assert_may_act_as_user(db, trusted_id, user_id)
    user.name = payload.name.strip()
    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/{user_id}/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get user study settings."""
    user = await assert_may_act_as_user(db, trusted_id, user_id)
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
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Update user study settings."""
    user = await assert_may_act_as_user(db, trusted_id, user_id)
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
