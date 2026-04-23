from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    user_id: str = Field(..., description="User ID (owner)")


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class CategoryDeckReorderRequest(BaseModel):
    direction: Literal["up", "down", "top", "bottom"]


class CategoryResponse(BaseModel):
    id: str
    name: str
    user_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
