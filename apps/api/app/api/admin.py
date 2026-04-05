from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.email_identity import (
    list_users_matching_email_identity,
    normalize_email_for_identity,
)
from app.core.platform_admin import require_platform_admin
from app.models import Deck, User
from app.schemas.user import (
    UserAdminUpdate,
    UserDeletePreviewResponse,
    UserResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


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
