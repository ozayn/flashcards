from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_page_token import verify_admin_page_token
from app.core.database import get_db
from app.models import User
from app.schemas.user import UserAdminUpdate, UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin_page_session(
    x_admin_page_token: str | None = Header(None, alias="X-Admin-Page-Token"),
) -> None:
    if not verify_admin_page_token(x_admin_page_token):
        raise HTTPException(status_code=401, detail="Admin authentication required")


@router.get(
    "/users",
    response_model=List[UserResponse],
    dependencies=[Depends(require_admin_page_session)],
)
async def admin_list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@router.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    dependencies=[Depends(require_admin_page_session)],
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
        dup = await db.execute(
            select(User).where(User.email == payload.email, User.id != user_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already in use")

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = payload.email

    await db.flush()
    await db.refresh(user)
    return UserResponse.model_validate(user)
