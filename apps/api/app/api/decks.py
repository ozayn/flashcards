from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Deck, Flashcard
from app.schemas.deck import DeckCreate, DeckResponse
from app.schemas.flashcard import FlashcardResponse

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("/{deck_id}/flashcards", response_model=List[FlashcardResponse])
async def get_deck_flashcards(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all flashcards for a deck."""
    result = await db.execute(
        select(Flashcard).where(Flashcard.deck_id == deck_id).order_by(Flashcard.created_at)
    )
    flashcards = result.scalars().all()
    return [FlashcardResponse.from_flashcard(f) for f in flashcards]


@router.get("/{deck_id}", response_model=DeckResponse)
async def get_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single deck by ID."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    return DeckResponse.model_validate(deck)


@router.get("", response_model=List[DeckResponse])
async def get_decks(
    user_id: str = Query(..., description="User ID to filter decks"),
    db: AsyncSession = Depends(get_db),
):
    """Get all decks for a user."""
    result = await db.execute(
        select(Deck).where(Deck.user_id == user_id).order_by(Deck.created_at.desc())
    )
    decks = result.scalars().all()
    return [DeckResponse.model_validate(d) for d in decks]


@router.post("", response_model=DeckResponse, status_code=201)
async def create_deck(
    payload: DeckCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new deck."""
    deck = Deck(
        user_id=payload.user_id,
        name=payload.name,
        description=payload.description,
        source_type=payload.source_type,
        source_url=payload.source_url,
        source_text=payload.source_text,
    )
    db.add(deck)
    await db.flush()
    await db.refresh(deck)
    return DeckResponse.model_validate(deck)
