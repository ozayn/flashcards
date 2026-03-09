import json
import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.llm.router import generate_flashcards as llm_generate_flashcards
from app.models import Deck, Flashcard
from app.schemas.flashcard import DIFFICULTY_TO_INT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/generate-flashcards", tags=["generation"])


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
    """Generate flashcards using configured LLM provider."""
    deck_id_str = str(payload.deck_id)
    result = await db.execute(select(Deck).where(Deck.id == deck_id_str))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    prompt = f"""You are an expert educator creating high-quality flashcards.

Generate {payload.num_cards} flashcards about the following topic:

{payload.topic}

Each flashcard must contain:
- question
- answer_short
- answer_detailed
- difficulty (easy, medium, hard)

Rules:
- Questions must be clear and concise.
- answer_short must be a short direct answer.
- answer_detailed should briefly explain the concept.
- Difficulty should reflect how challenging the card is.

Return ONLY valid JSON.

Format:

{{
  "flashcards": [
    {{
      "question": "...",
      "answer_short": "...",
      "answer_detailed": "...",
      "difficulty": "easy"
    }}
  ]
}}"""

    try:
        response_text = llm_generate_flashcards(prompt)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))

    try:
        parsed_json = _extract_json(response_text)
    except json.JSONDecodeError as e:
        logger.exception("Failed to parse LLM response as JSON: %s", e)
        raise HTTPException(
            status_code=502,
            detail="Failed to parse LLM response as JSON",
        )

    cards: list = parsed_json.get("flashcards", [])
    print("Generated cards:", cards)
    logger.info("Generated cards: %s", cards)

    created = 0
    for raw_card in cards:
        if not isinstance(raw_card, dict):
            logger.warning("Skipping invalid card (not a dict): %s", raw_card)
            continue

        # Read question, answer_short, answer_detailed, difficulty (fallback: front/back)
        question = raw_card.get("question") or raw_card.get("front")
        answer_short = raw_card.get("answer_short") or raw_card.get("back") or raw_card.get("answer")

        if not question or not answer_short:
            logger.warning(
                "Skipping card missing required fields (question/front, answer_short/back): %s",
                raw_card,
            )
            continue

        answer_detailed = raw_card.get("answer_detailed")
        difficulty_str = raw_card.get("difficulty", "medium")
        if difficulty_str not in DIFFICULTY_TO_INT:
            difficulty_str = "medium"
        difficulty = DIFFICULTY_TO_INT[difficulty_str]

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
                question=str(question)[:10000],
                answer_short=str(answer_short)[:1000],
                answer_detailed=(str(answer_detailed)[:10000] if answer_detailed else None),
                difficulty=difficulty,
            )
            db.add(flashcard)
            created += 1

    await db.flush()

    return GenerateFlashcardsResponse(created=created)
