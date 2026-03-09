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
    answer_detailed: Optional[str] = None
    difficulty: Literal["easy", "medium", "hard"] = Field(default="medium")


class FlashcardResponse(BaseModel):
    id: str
    deck_id: str
    question: str
    answer_short: str
    answer_detailed: Optional[str] = None
    difficulty: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_flashcard(cls, flashcard) -> "FlashcardResponse":
        """Build response from Flashcard ORM model (converts difficulty int to str)."""
        return cls(
            id=flashcard.id,
            deck_id=flashcard.deck_id,
            question=flashcard.question,
            answer_short=flashcard.answer_short,
            answer_detailed=flashcard.answer_detailed,
            difficulty=INT_TO_DIFFICULTY.get(flashcard.difficulty, "medium"),
            created_at=flashcard.created_at,
        )
