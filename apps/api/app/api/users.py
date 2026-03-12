from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import User
from app.schemas.user import UserCreate, UserResponse, UserSettingsResponse, UserSettingsUpdate

router = APIRouter(prefix="/users", tags=["users"])


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
