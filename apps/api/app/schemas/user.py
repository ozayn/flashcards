from datetime import datetime
from typing import Optional

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


class UserSettingsResponse(BaseModel):
    think_delay_enabled: bool = True
    think_delay_ms: int = Field(default=1500, ge=0, le=30000)
    card_style: str = "paper"

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    think_delay_enabled: Optional[bool] = None
    think_delay_ms: Optional[int] = Field(default=None, ge=0, le=30000)
    card_style: Optional[str] = Field(default=None, pattern="^(paper|minimal|modern|anki)$")
