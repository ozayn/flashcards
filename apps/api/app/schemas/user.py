from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import Plan, UserRole


class UserCreate(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = Field(default=UserRole.user)
    plan: Plan = Field(default=Plan.free)


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    plan: Plan
    created_at: datetime

    model_config = {"from_attributes": True}
