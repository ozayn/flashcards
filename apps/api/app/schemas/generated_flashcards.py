from typing import List, Optional

from pydantic import BaseModel, model_validator


class GeneratedFlashcard(BaseModel):
    question: str
    answer_short: str
    answer_detailed: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def answer_to_answer_short(cls, data: dict) -> dict:
        if isinstance(data, dict) and "answer" in data and "answer_short" not in data:
            data = {**data, "answer_short": data["answer"]}
        return data


class FlashcardGenerationResponse(BaseModel):
    flashcards: List[GeneratedFlashcard]
