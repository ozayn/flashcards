from typing import List, Optional

from pydantic import BaseModel, model_validator


class GeneratedFlashcard(BaseModel):
    question: str
    answer_short: str
    answer_detailed: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: dict) -> dict:
        """Map front/back or answer to question/answer_short."""
        if not isinstance(data, dict):
            return data
        # front -> question
        if "front" in data and "question" not in data:
            data = {**data, "question": data["front"]}
        # back -> answer_short (also handle "answer")
        if "back" in data and "answer_short" not in data:
            data = {**data, "answer_short": data["back"]}
        elif "answer" in data and "answer_short" not in data:
            data = {**data, "answer_short": data["answer"]}
        return data


class FlashcardGenerationResponse(BaseModel):
    flashcards: List[GeneratedFlashcard]
