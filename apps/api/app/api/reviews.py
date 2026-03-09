from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Flashcard, Review
from app.schemas.review import ReviewCreate, ReviewResponse

router = APIRouter(prefix="/reviews", tags=["reviews"])


def _next_review_delta(rating: str) -> timedelta:
    """Simple spaced repetition: again=10min, hard=1d, good=3d, easy=7d."""
    match rating:
        case "again":
            return timedelta(minutes=10)
        case "hard":
            return timedelta(days=1)
        case "good":
            return timedelta(days=3)
        case "easy":
            return timedelta(days=7)
        case _:
            return timedelta(days=1)


@router.post("", response_model=ReviewResponse, status_code=201)
async def create_review(
    payload: ReviewCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a spaced repetition review for a flashcard."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == payload.flashcard_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Flashcard not found")

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
