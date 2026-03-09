import json
import logging
import os
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from groq import Groq
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Deck, Flashcard
from app.schemas.flashcard import DIFFICULTY_TO_INT
from app.schemas.generated_flashcards import FlashcardGenerationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generate-flashcards", tags=["generation"])

GROQ_MODEL = "llama-3.1-8b-instant"


class GenerateFlashcardsRequest(BaseModel):
    deck_id: UUID = Field(..., description="Deck ID")
    topic: str = Field(..., min_length=1, description="Topic for flashcard generation")
    num_cards: int = Field(default=5, ge=1, le=50, description="Number of cards to generate")


class GenerateFlashcardsResponse(BaseModel):
    created: int


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    if not text:
        return {}
    data = json.loads(text)
    if isinstance(data, list):
        return {"flashcards": data}
    return data if isinstance(data, dict) else {}


@router.post("", response_model=GenerateFlashcardsResponse)
async def generate_flashcards(
    payload: GenerateFlashcardsRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate flashcards using Groq LLM."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY not configured. Set it in environment or .env.",
        )

    deck_id_str = str(payload.deck_id)
    result = await db.execute(select(Deck).where(Deck.id == deck_id_str))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    prompt = f"""Generate {payload.num_cards} flashcards about {payload.topic}.
Return JSON with the format:

{{
  "flashcards": [
    {{
      "question": "...",
      "answer_short": "...",
      "answer_detailed": "..."
    }}
  ]
}}

Return only valid JSON, no other text."""

    client = Groq(api_key=api_key)
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant. Return only valid JSON, no other text.",
            },
            {"role": "user", "content": prompt},
        ],
        model=GROQ_MODEL,
    )
    response_text = chat_completion.choices[0].message.content or ""

    try:
        parsed_json = _extract_json(response_text)
    except json.JSONDecodeError as e:
        logger.exception("Failed to parse LLM response as JSON: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Failed to parse LLM response as JSON",
        )

    try:
        validated = FlashcardGenerationResponse.model_validate(parsed_json)
    except ValidationError as e:
        logger.exception("LLM output validation failed: %s", e)
        raise HTTPException(
            status_code=500,
            detail="LLM returned invalid flashcard format",
        )

    created = 0
    for card in validated.flashcards:
        question = card.question
        answer_short = card.answer_short
        answer_detailed = card.answer_detailed

        result = await db.execute(
            select(Flashcard).where(
                Flashcard.deck_id == deck_id_str,
                Flashcard.question == question,
            )
        )
        existing = result.scalar_one_or_none()
        if not existing:
            flashcard = Flashcard(
                deck_id=deck_id_str,
                question=question[:10000],
                answer_short=answer_short[:1000],
                answer_detailed=(answer_detailed[:10000] if answer_detailed else None),
                difficulty=DIFFICULTY_TO_INT.get("medium", 1),
            )
            db.add(flashcard)
            created += 1

    await db.flush()

    return GenerateFlashcardsResponse(created=created)
