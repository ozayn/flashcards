from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Deck, Flashcard
from app.schemas.flashcard import (
    DIFFICULTY_TO_INT,
    INT_TO_DIFFICULTY,
    FlashcardCreate,
    FlashcardResponse,
)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


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
