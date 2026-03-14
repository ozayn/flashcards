from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Category, Deck
from app.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=List[CategoryResponse])
async def get_categories(
    user_id: str = Query(..., description="User ID (returns only categories owned by this user)"),
    db: AsyncSession = Depends(get_db),
):
    """Get categories owned by the user. Categories are user-specific and never shared."""
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
):
    """Create a new category. The category is owned by the user_id in the payload."""
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
):
    """Rename a category. Only the owner can update."""
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if data.name is not None:
        category.name = data.name
    await db.flush()
    await db.refresh(category)
    return CategoryResponse.model_validate(category)


@router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: str,
    user_id: str = Query(..., description="User ID (must own the category)"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a category. Only the owner can delete. Decks in this category will have category_id set to NULL."""
    result = await db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    # Explicitly nullify deck.category_id before delete (ensures SQLite works; DB ON DELETE SET NULL is backup)
    await db.execute(update(Deck).where(Deck.category_id == category_id).values(category_id=None))
    await db.delete(category)
    await db.flush()
