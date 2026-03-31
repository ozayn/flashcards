from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Deck, Flashcard
from app.schemas.flashcard import (
    DIFFICULTY_TO_INT,
    INT_TO_DIFFICULTY,
    FlashcardCreate,
    FlashcardResponse,
    FlashcardUpdate,
)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.get("/{flashcard_id}", response_model=FlashcardResponse)
async def get_flashcard(
    flashcard_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single flashcard by ID."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    return FlashcardResponse.from_flashcard(flashcard)


@router.patch("/{flashcard_id}", response_model=FlashcardResponse)
async def update_flashcard(
    flashcard_id: str,
    data: FlashcardUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a flashcard."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    if data.question is not None:
        flashcard.question = data.question
    if data.answer_short is not None:
        flashcard.answer_short = data.answer_short
    if data.answer_detailed is not None:
        flashcard.answer_detailed = data.answer_detailed
    if data.difficulty is not None:
        flashcard.difficulty = DIFFICULTY_TO_INT.get(data.difficulty, 1)
    await db.flush()
    await db.refresh(flashcard)
    return FlashcardResponse.from_flashcard(flashcard)


@router.delete("/{flashcard_id}", status_code=204)
async def delete_flashcard(
    flashcard_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a flashcard."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    await db.delete(flashcard)
    await db.flush()


@router.post("", response_model=FlashcardResponse, status_code=201)
async def create_flashcard(
    payload: FlashcardCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new flashcard."""
    # Validate deck exists
    result = await db.execute(select(Deck).where(Deck.id == payload.deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    flashcard = Flashcard(
        deck_id=payload.deck_id,
        question=payload.question,
        answer_short=payload.answer_short,
        answer_detailed=payload.answer_detailed,
        difficulty=DIFFICULTY_TO_INT.get(payload.difficulty, 1),
    )
    db.add(flashcard)
    await db.flush()
    await db.refresh(flashcard)

    return FlashcardResponse(
        id=flashcard.id,
        deck_id=flashcard.deck_id,
        question=flashcard.question,
        answer_short=flashcard.answer_short,
        answer_detailed=flashcard.answer_detailed,
        difficulty=INT_TO_DIFFICULTY.get(flashcard.difficulty, "medium"),
        created_at=flashcard.created_at,
    )


class _ImportCard(BaseModel):
    question: str = Field(..., min_length=1)
    answer_short: str = Field(..., min_length=1)
    answer_detailed: str | None = None


class _ImportRequest(BaseModel):
    deck_id: str
    cards: List[_ImportCard] = Field(..., min_length=1, max_length=500)


class _ImportResponse(BaseModel):
    created: int
    skipped: int = 0


@router.post("/import", response_model=_ImportResponse, status_code=201)
async def import_flashcards(
    payload: _ImportRequest,
    db: AsyncSession = Depends(get_db),
):
    """Batch-create flashcards from structured Q/A import (no LLM).
    Skips exact duplicates (same question text) already in the deck.
    """
    result = await db.execute(select(Deck).where(Deck.id == payload.deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    existing = await db.execute(
        select(Flashcard.question).where(Flashcard.deck_id == payload.deck_id)
    )
    existing_questions = {row[0].strip().lower() for row in existing.all()}

    created = 0
    for card in payload.cards:
        if card.question.strip().lower() in existing_questions:
            continue
        db.add(Flashcard(
            deck_id=payload.deck_id,
            question=card.question,
            answer_short=card.answer_short,
            answer_detailed=card.answer_detailed,
            difficulty=1,
        ))
        existing_questions.add(card.question.strip().lower())
        created += 1

    await db.flush()
    return _ImportResponse(created=created, skipped=len(payload.cards) - created)
