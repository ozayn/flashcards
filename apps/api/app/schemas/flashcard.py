from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Map difficulty string to integer for Flashcard model (0=easy, 1=medium, 2=hard)
DIFFICULTY_TO_INT = {"easy": 0, "medium": 1, "hard": 2}
INT_TO_DIFFICULTY = {0: "easy", 1: "medium", 2: "hard"}


class FlashcardCreate(BaseModel):
    deck_id: str = Field(..., description="Deck ID")
    question: str = Field(..., min_length=1)
    answer_short: str = Field(..., min_length=1, max_length=1000)
    answer_example: Optional[str] = None
    answer_detailed: Optional[str] = None
    # Set from upload response, e.g. flashcard-images/{uuid}.png
    image_url: Optional[str] = Field(None, max_length=512)
    difficulty: Literal["easy", "medium", "hard"] = Field(default="medium")


class FlashcardUpdate(BaseModel):
    question: Optional[str] = Field(None, min_length=1)
    answer_short: Optional[str] = Field(None, min_length=1, max_length=1000)
    answer_example: Optional[str] = None
    answer_detailed: Optional[str] = None
    image_url: Optional[str] = Field(None, max_length=512)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None


class FlashcardResponse(BaseModel):
    id: str
    deck_id: str
    question: str
    answer_short: str
    answer_example: Optional[str] = None
    answer_detailed: Optional[str] = None
    image_url: Optional[str] = None
    difficulty: str
    created_at: datetime
    bookmarked: bool = False

    model_config = {"from_attributes": True}

    @classmethod
    def from_flashcard(cls, flashcard, *, bookmarked: bool = False) -> "FlashcardResponse":
        """Build response from Flashcard ORM model (converts difficulty int to str)."""
        return cls(
            id=flashcard.id,
            deck_id=flashcard.deck_id,
            question=flashcard.question,
            answer_short=flashcard.answer_short,
            answer_example=flashcard.answer_example,
            answer_detailed=flashcard.answer_detailed,
            image_url=getattr(flashcard, "image_url", None) or None,
            difficulty=INT_TO_DIFFICULTY.get(flashcard.difficulty, "medium"),
            created_at=flashcard.created_at,
            bookmarked=bookmarked,
        )
