from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Deck, Flashcard, Review
from app.schemas.deck import DeckCreate, DeckResponse, DeckUpdate
from app.schemas.flashcard import FlashcardResponse

router = APIRouter(prefix="/decks", tags=["decks"])


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


@router.get("/{deck_id}/flashcards", response_model=List[FlashcardResponse])
async def get_deck_flashcards(
    deck_id: str,
    due_only: bool = Query(False, description="Return only cards due for review"),
    db: AsyncSession = Depends(get_db),
):
    """Get all flashcards for a deck. When due_only=true, return only cards due for review."""
    result = await db.execute(
        select(Flashcard).where(Flashcard.deck_id == deck_id).order_by(Flashcard.created_at)
    )
    flashcards = result.scalars().all()

    if due_only:
        now = datetime.utcnow()
        latest_review_subq = (
            select(Review.flashcard_id, func.max(Review.review_time).label("max_time"))
            .group_by(Review.flashcard_id)
        ).subquery()
        not_due_ids_result = await db.execute(
            select(Review.flashcard_id)
            .select_from(Review)
            .join(
                latest_review_subq,
                and_(
                    Review.flashcard_id == latest_review_subq.c.flashcard_id,
                    Review.review_time == latest_review_subq.c.max_time,
                ),
            )
            .where(Review.next_review > now)
        )
        not_due_ids = {row[0] for row in not_due_ids_result.all()}
        flashcards = [f for f in flashcards if f.id not in not_due_ids]

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


@router.patch("/{deck_id}", response_model=DeckResponse)
async def update_deck(
    deck_id: str,
    data: DeckUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a deck's name and/or description."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()

    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")

    if data.name is not None:
        deck.name = data.name

    if data.description is not None:
        deck.description = data.description

    await db.flush()
    await db.refresh(deck)

    return DeckResponse.model_validate(deck)


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
