from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.user_access import (
    assert_may_act_as_user,
    assert_may_read_deck,
    get_trusted_acting_user_id,
)
from app.models import Deck, Flashcard, Review
from app.schemas.review import ReviewCreate, ReviewResponse

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _next_review_delta(rating: str) -> timedelta:
    """Simple spaced repetition: again=10min, hard=1d, good=3d, easy=7d."""
    if rating == "again":
        return timedelta(minutes=10)
    if rating == "hard":
        return timedelta(days=1)
    if rating == "good":
        return timedelta(days=3)
    if rating == "easy":
        return timedelta(days=7)
    return timedelta(days=1)


@router.post("", response_model=ReviewResponse, status_code=201)
async def create_review(
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Submit a spaced repetition review for a flashcard."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == payload.flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    deck_result = await db.execute(select(Deck).where(Deck.id == flashcard.deck_id))
    deck = deck_result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck)
    await assert_may_act_as_user(db, trusted_id, payload.user_id)

    now = datetime.utcnow()
    next_review = now + _next_review_delta(payload.rating.value)

    review = Review(
        user_id=payload.user_id,
        flashcard_id=payload.flashcard_id,
        rating=payload.rating,
        review_time=now,
        next_review=next_review,
    )
    db.add(review)
    await db.flush()
    await db.refresh(review)

    return ReviewResponse(
        id=review.id,
        flashcard_id=review.flashcard_id,
        rating=review.rating,
        review_time=review.review_time.isoformat(),
        next_review=review.next_review.isoformat(),
    )
