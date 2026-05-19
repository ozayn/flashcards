from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.deck import DeckResponse


ReorderDirection = Literal["up", "down", "top", "bottom"]


class LibraryCollectionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    is_published: bool = Field(
        default=False,
        description="Only published collections appear on the public Library page.",
    )


class LibraryCollectionUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    is_published: Optional[bool] = None


class LibraryCollectionResponse(BaseModel):
    """Summary shape used in list responses (Library grid, admin list)."""

    id: str
    title: str
    description: Optional[str] = None
    is_published: bool = False
    position: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    deck_count: int = 0
    total_card_count: int = 0

    model_config = {"from_attributes": True}


class LibraryCollectionDetailResponse(LibraryCollectionResponse):
    """Detail shape used on the collection page: full ordered deck list."""

    decks: List[DeckResponse] = Field(default_factory=list)


class LibraryCollectionAddDeckRequest(BaseModel):
    deck_id: str
    # Optional position; when omitted the deck is appended to the end of the collection.
    position: Optional[int] = Field(None, ge=0)


class LibraryCollectionReorderDeckRequest(BaseModel):
    direction: ReorderDirection
