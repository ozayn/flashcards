from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.user_access import assert_may_act_as_user, get_trusted_acting_user_id
from app.models import Category, Deck, Flashcard
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from app.schemas.deck import DeckResponse

router = APIRouter(prefix="/categories", tags=["categories"])


def _normalize_category_name(s: str) -> str:
    """Trim, lowercase, collapse repeated spaces. Used for duplicate detection only."""
    return " ".join(s.strip().lower().split())


@router.get("", response_model=List[CategoryResponse])
async def get_categories(
    user_id: str = Query(..., description="User ID (returns only categories owned by this user)"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get categories owned by the user. Categories are user-specific and never shared."""
    await assert_may_act_as_user(db, trusted_id, user_id)
    result = await db.execute(
        select(Category)
        .where(Category.user_id == user_id)
        .order_by(Category.name.asc())
    )
    return [CategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=CategoryResponse, status_code=201)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Create a new category. The category is owned by the user_id in the payload."""
    await assert_may_act_as_user(db, trusted_id, payload.user_id)
    normalized = _normalize_category_name(payload.name)
    result = await db.execute(
        select(Category).where(Category.user_id == payload.user_id)
    )
    for c in result.scalars().all():
        if _normalize_category_name(c.name) == normalized:
            raise HTTPException(
                status_code=409,
                detail="This category already exists.",
            )
    category = Category(
        name=payload.name,
        user_id=payload.user_id,
    )
    db.add(category)
    await db.flush()
    await db.refresh(category)
    return CategoryResponse.model_validate(category)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    user_id: str = Query(..., description="User ID (must own the category)"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Rename a category. Only the owner can update."""
    await assert_may_act_as_user(db, trusted_id, user_id)
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if data.name is not None:
        normalized = _normalize_category_name(data.name)
        others = await db.execute(
            select(Category).where(
                Category.user_id == user_id,
                Category.id != category_id,
            )
        )
        for c in others.scalars().all():
            if _normalize_category_name(c.name) == normalized:
                raise HTTPException(
                    status_code=409,
                    detail="This category already exists.",
                )
        category.name = data.name
    await db.flush()
    await db.refresh(category)
    return CategoryResponse.model_validate(category)


@router.get("/{category_id}/decks", response_model=List[DeckResponse])
async def get_category_decks(
    category_id: str,
    user_id: str = Query(..., description="User ID (must own the category)"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get non-archived decks in a category, ordered by category_assigned_at ASC.
    Nulls (legacy decks) sort to the end, using created_at as tiebreaker."""
    await assert_may_act_as_user(db, trusted_id, user_id)
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Category not found")
    sort_key = case(
        (Deck.category_assigned_at.isnot(None), Deck.category_assigned_at),
        else_=Deck.created_at,
    )
    decks_result = await db.execute(
        select(Deck)
        .where(
            Deck.category_id == category_id,
            Deck.user_id == user_id,
            Deck.archived == False,
        )
        .order_by(sort_key.asc())
    )
    decks = decks_result.scalars().all()
    if not decks:
        return []
    deck_ids = [d.id for d in decks]
    count_result = await db.execute(
        select(Flashcard.deck_id, func.count(Flashcard.id))
        .where(Flashcard.deck_id.in_(deck_ids))
        .group_by(Flashcard.deck_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return [
        DeckResponse.model_validate(d).model_copy(update={"card_count": counts.get(d.id, 0)})
        for d in decks
    ]


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: str,
    user_id: str = Query(..., description="User ID (must own the category)"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Delete a category. Only the owner can delete. Decks in this category will have category_id set to NULL."""
    await assert_may_act_as_user(db, trusted_id, user_id)
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    # Explicitly nullify deck.category_id before delete (ensures SQLite works; DB ON DELETE SET NULL is backup)
    await db.execute(update(Deck).where(Deck.category_id == category_id).values(category_id=None, category_assigned_at=None))
    await db.delete(category)
    await db.flush()
