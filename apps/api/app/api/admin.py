from __future__ import annotations

from typing import List

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete as sql_delete
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.email_identity import (
    list_users_matching_email_identity,
    normalize_email_for_identity,
)
from app.core.platform_admin import require_platform_admin
from app.models import Category, Deck, Flashcard, Review, User
from app.schemas.deck import DeckResponse
from app.schemas.user import (
    UserAdminUpdate,
    UserDeletePreviewResponse,
    UserResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


class LegacyBulkTransferPreviewResponse(BaseModel):
    source_user_id: str
    name: str
    email: str
    is_legacy_user: bool
    deck_count: int


class BulkLegacyTransferResponse(BaseModel):
    moved_count: int
    deck_ids: List[str]


def _normalize_category_name(s: str) -> str:
    """Trim, lowercase, collapse spaces — same rule as /categories duplicate detection."""
    return " ".join(s.strip().lower().split())


async def _destination_category_for_transferred_deck(
    db: AsyncSession,
    admin_user: User,
    source_category: Category,
) -> tuple[str | None, datetime | None]:
    """
    Pick or create an admin-owned category matching the source category name.
    Returns (category_id, category_assigned_at) or (None, None) for uncategorized.
    """
    raw = (source_category.name or "").strip()
    if not raw:
        return None, None

    norm = _normalize_category_name(source_category.name)
    owned = await db.execute(
        select(Category).where(Category.user_id == admin_user.id)
    )
    for existing in owned.scalars().all():
        if _normalize_category_name(existing.name) == norm:
            return existing.id, datetime.utcnow()

    stored = raw[:100] if len(raw) > 100 else raw
    new_cat = Category(name=stored, user_id=admin_user.id)
    db.add(new_cat)
    await db.flush()
    await db.refresh(new_cat)
    return new_cat.id, datetime.utcnow()


async def _transfer_legacy_deck_to_admin_user(
    db: AsyncSession,
    deck: Deck,
    admin_user: User,
) -> DeckResponse:
    """
    Move one deck from its current owner into admin_user's account.
    Clears reviews on the deck's cards; maps category by normalized name, creating
    a new admin-owned category when needed. Caller must enforce legacy owner and admin google_sub.
    """
    fc_result = await db.execute(
        select(Flashcard.id).where(Flashcard.deck_id == deck.id)
    )
    flashcard_ids = [row[0] for row in fc_result.all()]
    if flashcard_ids:
        await db.execute(
            sql_delete(Review).where(Review.flashcard_id.in_(flashcard_ids))
        )

    if deck.category_id:
        cat_result = await db.execute(
            select(Category).where(Category.id == deck.category_id)
        )
        cat = cat_result.scalar_one_or_none()
        if not cat:
            deck.category_id = None
            deck.category_assigned_at = None
        elif cat.user_id == admin_user.id:
            deck.category_assigned_at = datetime.utcnow()
        else:
            target_id, assigned_at = await _destination_category_for_transferred_deck(
                db, admin_user, cat
            )
            deck.category_id = target_id
            deck.category_assigned_at = assigned_at

    deck.user_id = admin_user.id
    deck.is_public = False
    await db.flush()
    await db.refresh(deck)

    cnt = await db.execute(
        select(func.count(Flashcard.id)).where(Flashcard.deck_id == deck.id)
    )
    card_count = int(cnt.scalar() or 0)
    return DeckResponse.model_validate(deck).model_copy(
        update={
            "card_count": card_count,
            "owner_is_legacy": False,
            "owner_name": admin_user.name,
            "owner_email": admin_user.email,
        }
    )


@router.get(
    "/users",
    response_model=List[UserResponse],
    dependencies=[Depends(require_platform_admin)],
)
async def admin_list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.get(
    "/users/{user_id}/delete-preview",
    response_model=UserDeletePreviewResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_user_delete_preview(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    cnt = await db.execute(
        select(func.count()).select_from(Deck).where(Deck.user_id == user_id)
    )
    deck_count = int(cnt.scalar_one() or 0)
    return UserDeletePreviewResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        deck_count=deck_count,
    )


@router.get(
    "/users/{user_id}/legacy-bulk-transfer-preview",
    response_model=LegacyBulkTransferPreviewResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_legacy_bulk_transfer_preview(user_id: str, db: AsyncSession = Depends(get_db)):
    """Admin-only: whether a user is legacy (non-OAuth) and how many decks they own (all, any archive state)."""
    result = await db.execute(select(User).where(User.id == user_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="User not found")
    cnt = await db.execute(
        select(func.count()).select_from(Deck).where(Deck.user_id == user_id)
    )
    deck_count = int(cnt.scalar_one() or 0)
    is_legacy_user = source.google_sub is None
    return LegacyBulkTransferPreviewResponse(
        source_user_id=source.id,
        name=source.name,
        email=source.email,
        is_legacy_user=is_legacy_user,
        deck_count=deck_count,
    )


@router.post(
    "/users/{user_id}/transfer-all-legacy-decks-to-me",
    response_model=BulkLegacyTransferResponse,
)
async def admin_transfer_all_legacy_decks_to_me(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
):
    """
    Move every deck owned by a legacy (non-Google) user into the admin's Google-linked account.
    Same per-deck rules as POST /admin/decks/{deck_id}/transfer-to-me (reviews, categories, private).
    """
    if not admin_user.google_sub:
        raise HTTPException(
            status_code=400,
            detail="Your account must be Google-linked to receive transferred decks.",
        )
    if admin_user.id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot bulk-transfer decks from your own account.",
        )

    source_result = await db.execute(select(User).where(User.id == user_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="User not found")
    if source.google_sub is not None:
        raise HTTPException(
            status_code=403,
            detail="Only decks owned by a legacy (non-Google) user can be transferred.",
        )

    decks_result = await db.execute(
        select(Deck).where(Deck.user_id == user_id).order_by(Deck.created_at.asc())
    )
    decks = decks_result.scalars().all()
    deck_ids: List[str] = []
    for deck in decks:
        await _transfer_legacy_deck_to_admin_user(db, deck, admin_user)
        deck_ids.append(deck.id)

    return BulkLegacyTransferResponse(moved_count=len(deck_ids), deck_ids=deck_ids)


@router.delete(
    "/users/{user_id}",
    status_code=204,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_delete_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently delete the user. Database FKs use ON DELETE CASCADE for decks
    (and flashcards under those decks), categories, and reviews tied to this user.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.flush()


@router.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_update_user(
    user_id: str,
    payload: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        norm = normalize_email_for_identity(payload.email)
        if norm:
            matches = await list_users_matching_email_identity(db, norm)
            if any(u.id != user_id for u in matches):
                raise HTTPException(status_code=400, detail="Email already in use")

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = payload.email

    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.post(
    "/decks/{deck_id}/transfer-to-me",
    response_model=DeckResponse,
)
async def admin_transfer_legacy_deck_to_me(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
):
    """
    Move a deck from a legacy (non-OAuth) user into the admin's Google-linked account.
    Clears SRS reviews on the deck's cards; remaps category by name when possible.
    """
    if not admin_user.google_sub:
        raise HTTPException(
            status_code=400,
            detail="Your account must be Google-linked to receive transferred decks.",
        )

    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    owner_result = await db.execute(select(User).where(User.id == deck.user_id))
    old_owner = owner_result.scalar_one_or_none()
    if not old_owner:
        raise HTTPException(status_code=404, detail="Deck owner not found")
    if old_owner.google_sub is not None:
        raise HTTPException(
            status_code=403,
            detail="Only decks owned by a legacy (non-Google) user can be transferred.",
        )
    if deck.user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="You already own this deck.")

    return await _transfer_legacy_deck_to_admin_user(db, deck, admin_user)
