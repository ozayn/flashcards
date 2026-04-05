"""Enforce OAuth-linked (private) account boundaries vs legacy public accounts."""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Deck, User

_SECRET = (os.environ.get("MEMO_OAUTH_SYNC_SECRET") or "").strip()


def verify_acting_user_headers(
    user_id: Optional[str],
    signature: Optional[str],
) -> Optional[str]:
    """
    Verify HMAC-SHA256(secret, user_id) from trusted proxy (Next.js).
    Returns the user id if valid; otherwise None (public / unauthenticated context).
    """
    if not _SECRET or not user_id or not user_id.strip():
        return None
    sig = (signature or "").strip()
    if len(sig) != 64 or any(c not in "0123456789abcdef" for c in sig.lower()):
        return None
    uid = user_id.strip()
    expected = hmac.new(
        _SECRET.encode("utf-8"), uid.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected.lower(), sig.lower()):
        return None
    return uid


async def get_trusted_acting_user_id(
    x_memo_acting_user_id: Optional[str] = Header(None, alias="X-Memo-Acting-User-Id"),
    x_memo_acting_user_signature: Optional[str] = Header(
        None, alias="X-Memo-Acting-User-Signature"
    ),
) -> Optional[str]:
    return verify_acting_user_headers(x_memo_acting_user_id, x_memo_acting_user_signature)


def is_oauth_linked_user(user: User) -> bool:
    """OAuth-linked rows are private; legacy rows (google_sub is null) stay shared/public."""
    return user.google_sub is not None


async def fetch_user(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def assert_may_act_as_user(
    db: AsyncSession,
    trusted_acting_user_id: Optional[str],
    target_user_id: str,
) -> User:
    user = await fetch_user(db, target_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_oauth_linked_user(user):
        if trusted_acting_user_id != target_user_id:
            raise HTTPException(
                status_code=403,
                detail="Not allowed to access this account",
            )
    return user


async def assert_may_read_deck(
    db: AsyncSession,
    trusted_acting_user_id: Optional[str],
    deck: Deck,
) -> None:
    owner = await fetch_user(db, deck.user_id)
    if not owner or not is_oauth_linked_user(owner):
        return
    if deck.is_public:
        return
    if trusted_acting_user_id == deck.user_id:
        return
    raise HTTPException(status_code=403, detail="Not allowed to access this deck")


async def assert_may_mutate_deck(
    db: AsyncSession,
    trusted_acting_user_id: Optional[str],
    deck: Deck,
) -> None:
    owner = await fetch_user(db, deck.user_id)
    if not owner or not is_oauth_linked_user(owner):
        return
    if trusted_acting_user_id == deck.user_id:
        return
    raise HTTPException(status_code=403, detail="Not allowed to modify this deck")


async def list_users_visible_in_context(
    db: AsyncSession, trusted_acting_user_id: Optional[str]
) -> list[User]:
    if trusted_acting_user_id:
        result = await db.execute(
            select(User)
            .where(
                or_(
                    User.google_sub.is_(None),
                    User.id == trusted_acting_user_id,
                )
            )
            .order_by(User.created_at)
        )
    else:
        result = await db.execute(
            select(User).where(User.google_sub.is_(None)).order_by(User.created_at)
        )
    return list(result.scalars().all())
