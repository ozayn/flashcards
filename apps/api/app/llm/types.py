from typing import List

from pydantic import BaseModel


class Flashcard(BaseModel):
    front: str
    back: str


class FlashcardResponse(BaseModel):
    flashcards: List[Flashcard]
