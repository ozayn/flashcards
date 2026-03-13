from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import SourceType


class DeckUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    archived: Optional[bool] = None
    category_id: Optional[str] = None


class DeckCreate(BaseModel):
    user_id: str = Field(..., description="User ID")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    source_type: Optional[SourceType] = Field(default=SourceType.topic)
    source_url: Optional[str] = Field(None, max_length=2048)
    source_text: Optional[str] = None


class DeckResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_text: Optional[str] = None
    generation_status: str = "completed"
    generated_by_ai: bool = False
    archived: bool = False
    category_id: Optional[str] = None
    created_at: datetime
    card_count: int = 0

    model_config = {"from_attributes": True}
