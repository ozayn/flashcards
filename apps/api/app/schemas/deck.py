from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, computed_field, field_validator

from app.models.enums import SourceType


def _coerce_enum_to_str(v: Any) -> Optional[str]:
    """Coerce enum to string for JSON serialization."""
    if v is None:
        return None
    return v.value if hasattr(v, "value") else str(v)


class DeckUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    archived: Optional[bool] = None
    is_public: Optional[bool] = None
    category_id: Optional[str] = None


class DeckMoveRequest(BaseModel):
    category_id: Optional[str] = Field(None, description="Target category ID, or null for Uncategorized")


class DeckCreate(BaseModel):
    user_id: str = Field(..., description="User ID")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    source_type: Optional[SourceType] = Field(default=SourceType.topic)
    source_url: Optional[str] = Field(None, max_length=2048)
    source_topic: Optional[str] = Field(None, max_length=512, description="Topic used for AI generation (Topic mode)")
    source_text: Optional[str] = None
    source_segments: Optional[str] = None
    source_metadata: Optional[str] = Field(
        None,
        max_length=4096,
        description="Optional JSON string for source metadata (e.g. YouTube duration)",
    )
    count: Optional[int] = Field(default=10, ge=1, le=50, description="Number of flashcards to generate (1–50)")


class DeckResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    source_type: Optional[str] = Field(default=None)
    source_url: Optional[str] = None
    source_title: Optional[str] = None
    source_topic: Optional[str] = None
    source_text: Optional[str] = None
    source_segments: Optional[str] = Field(None, exclude=True)
    source_metadata: Optional[str] = None
    generation_status: str = "completed"
    generated_by_ai: bool = False
    archived: bool = False
    is_public: bool = False
    category_id: Optional[str] = None
    category_assigned_at: Optional[datetime] = None
    created_at: datetime
    card_count: int = 0
    owner_is_legacy: bool = False
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("source_type", mode="before")
    @classmethod
    def coerce_source_type(cls, v: Any) -> Optional[str]:
        return _coerce_enum_to_str(v)

    @computed_field
    @property
    def has_timestamps(self) -> bool:
        return bool(self.source_segments and self.source_segments.strip())
