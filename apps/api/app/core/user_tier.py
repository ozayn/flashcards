"""
Free-tier vs elevated usage for monetization-ready limits.

Elevated (no deck-count / per-deck card cap from this module):
- Product admin (role / name / PRODUCT_ADMIN_EMAILS), or
- OAuth-linked user whose email is on ALLOWED_LOGIN_EMAILS, acting as self (trusted proxy).

Everyone else is "limited tier": max active decks and max cards per deck.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.guest_trial import GUEST_TRIAL_MAX_CARDS_TOTAL, GUEST_TRIAL_USER_ID
from app.core.login_email_allowlist import email_is_allowed_for_login
from app.core.product_admin import user_has_product_admin_access
from app.models import Deck, Flashcard, User

LIMITED_MAX_DECKS = 5
LIMITED_MAX_CARDS_PER_DECK = 10

FREE_TIER_MAX_DECKS_MSG = (
    "Free plan: up to 5 decks. Delete or archive one to create another."
)
FREE_TIER_MAX_CARDS_DECK_MSG = (
    "Free plan: up to 10 cards per deck. Remove cards to add more."
)
FREE_TIER_DUPLICATE_DECK_TOO_MANY_CARDS_MSG = (
    "Free plan: duplicate decks can have at most 10 cards; the source has more."
)


def user_has_elevated_tier(user: User | None, trusted_acting_user_id: Optional[str]) -> bool:
    """Unlimited deck count / per-deck card cap (still subject to product generation caps)."""
    if user is None:
        return False
    if user_has_product_admin_access(user):
        return True
    if user.google_sub is None:
        return False
    if (trusted_acting_user_id or "").strip() != (user.id or "").strip():
        return False
    return email_is_allowed_for_login(user.email)


async def count_active_decks_for_user(db: AsyncSession, user_id: str) -> int:
    r = await db.execute(
        select(func.count())
        .select_from(Deck)
        .where(Deck.user_id == user_id, Deck.archived == False)
    )
    return int(r.scalar() or 0)


async def count_flashcards_in_deck(db: AsyncSession, deck_id: str) -> int:
    r = await db.execute(
        select(func.count())
        .select_from(Flashcard)
        .where(Flashcard.deck_id == deck_id)
    )
    return int(r.scalar() or 0)


async def assert_may_create_deck_for_user(
    db: AsyncSession,
    user: User,
    trusted_id: Optional[str],
) -> None:
    from fastapi import HTTPException

    if user_has_elevated_tier(user, trusted_id):
        return
    n = await count_active_decks_for_user(db, user.id)
    if n >= LIMITED_MAX_DECKS:
        raise HTTPException(status_code=403, detail=FREE_TIER_MAX_DECKS_MSG)


def generation_request_cap_exceeded_detail(max_allowed: int) -> str:
    """403 detail when `num_cards` exceeds what the deck owner may still add."""
    if max_allowed <= 0:
        return FREE_TIER_MAX_CARDS_DECK_MSG
    return (
        f"Free plan: you can add at most {max_allowed} card(s) in this request "
        f"({LIMITED_MAX_CARDS_PER_DECK} per deck max)."
    )


async def max_new_cards_allowed_for_deck(
    db: AsyncSession,
    deck_id: str,
    owner: User | None,
    trusted_id: Optional[str],
    *,
    base_cap: int,
) -> int:
    """
    Max cards the user may add in one generation request (also total headroom for limited tier).
    `base_cap` is the existing product cap (e.g. 25 or 50 for admins).
    """
    if user_has_elevated_tier(owner, trusted_id):
        return base_cap
    current = await count_flashcards_in_deck(db, deck_id)
    remaining = max(0, LIMITED_MAX_CARDS_PER_DECK - current)
    cap = min(base_cap, remaining)
    if owner and (owner.id or "").strip() == GUEST_TRIAL_USER_ID:
        remaining_guest = max(0, GUEST_TRIAL_MAX_CARDS_TOTAL - current)
        cap = min(cap, remaining_guest)
    return cap


async def assert_may_add_flashcards_to_deck(
    db: AsyncSession,
    deck_id: str,
    owner: User | None,
    trusted_id: Optional[str],
    additional_count: int,
) -> None:
    from fastapi import HTTPException

    if additional_count <= 0:
        return
    if user_has_elevated_tier(owner, trusted_id):
        return
    current = await count_flashcards_in_deck(db, deck_id)
    if owner and (owner.id or "").strip() == GUEST_TRIAL_USER_ID:
        if current + additional_count > GUEST_TRIAL_MAX_CARDS_TOTAL:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Trial deck: at most {GUEST_TRIAL_MAX_CARDS_TOTAL} cards. "
                    "Sign in to create larger decks."
                ),
            )
        return
    if current + additional_count > LIMITED_MAX_CARDS_PER_DECK:
        raise HTTPException(status_code=403, detail=FREE_TIER_MAX_CARDS_DECK_MSG)
