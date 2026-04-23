from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.user_access import (
    assert_may_mutate_deck,
    assert_may_read_deck,
    get_trusted_acting_user_id,
)
from app.core.user_tier import (
    FREE_TIER_MAX_CARDS_DECK_MSG,
    LIMITED_MAX_CARDS_PER_DECK,
    assert_may_add_flashcards_to_deck,
    count_flashcards_in_deck,
    user_has_elevated_tier,
)
from app.models import Deck, Flashcard, FlashcardBookmark, User
from app.utils.import_answer_split import resolve_import_answer_fields
from app.api.flashcard_images import validate_image_url_for_write
from app.schemas.flashcard import (
    DIFFICULTY_TO_INT,
    INT_TO_DIFFICULTY,
    FlashcardCreate,
    FlashcardResponse,
    FlashcardUpdate,
)

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


async def _flashcard_bookmarked(
    db: AsyncSession, user_id: str, flashcard_id: str
) -> bool:
    r = await db.execute(
        select(FlashcardBookmark).where(
            FlashcardBookmark.user_id == user_id,
            FlashcardBookmark.flashcard_id == flashcard_id,
        )
    )
    return r.scalar_one_or_none() is not None


class BookmarkSetRequest(BaseModel):
    bookmarked: bool


@router.put("/{flashcard_id}/bookmark", response_model=FlashcardResponse)
async def set_flashcard_bookmark(
    flashcard_id: str,
    body: BookmarkSetRequest,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Bookmark or unbookmark a flashcard for the signed-in user."""
    if not trusted_id:
        raise HTTPException(status_code=401, detail="Sign in to bookmark cards")
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    deck_result = await db.execute(select(Deck).where(Deck.id == flashcard.deck_id))
    deck = deck_result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck)

    if body.bookmarked:
        existing = await db.execute(
            select(FlashcardBookmark).where(
                FlashcardBookmark.user_id == trusted_id,
                FlashcardBookmark.flashcard_id == flashcard_id,
            )
        )
        if existing.scalar_one_or_none() is None:
            db.add(
                FlashcardBookmark(user_id=trusted_id, flashcard_id=flashcard_id)
            )
            await db.flush()
    else:
        await db.execute(
            delete(FlashcardBookmark).where(
                FlashcardBookmark.user_id == trusted_id,
                FlashcardBookmark.flashcard_id == flashcard_id,
            )
        )
        await db.flush()

    return FlashcardResponse.from_flashcard(flashcard, bookmarked=body.bookmarked)


@router.get("/{flashcard_id}", response_model=FlashcardResponse)
async def get_flashcard(
    flashcard_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get a single flashcard by ID."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    deck_result = await db.execute(select(Deck).where(Deck.id == flashcard.deck_id))
    deck = deck_result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck)
    bookmarked = (
        await _flashcard_bookmarked(db, trusted_id, flashcard.id)
        if trusted_id
        else False
    )
    return FlashcardResponse.from_flashcard(flashcard, bookmarked=bookmarked)


@router.patch("/{flashcard_id}", response_model=FlashcardResponse)
async def update_flashcard(
    flashcard_id: str,
    data: FlashcardUpdate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Update a flashcard."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    deck_result = await db.execute(select(Deck).where(Deck.id == flashcard.deck_id))
    deck = deck_result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)
    update_payload = data.model_dump(exclude_unset=True)
    if data.question is not None:
        flashcard.question = data.question
    if data.answer_short is not None:
        flashcard.answer_short = data.answer_short
    if "answer_example" in update_payload:
        ex = update_payload["answer_example"]
        flashcard.answer_example = (
            None if ex is None else (str(ex).strip() or None)
        )
    if data.answer_detailed is not None:
        flashcard.answer_detailed = data.answer_detailed
    if data.difficulty is not None:
        flashcard.difficulty = DIFFICULTY_TO_INT.get(data.difficulty, 1)
    if "image_url" in update_payload:
        v = update_payload.get("image_url")
        if v is None or (isinstance(v, str) and not v.strip()):
            flashcard.image_url = None
        else:
            flashcard.image_url = validate_image_url_for_write(str(v).strip())
    await db.flush()
    await db.refresh(flashcard)
    bookmarked = (
        await _flashcard_bookmarked(db, trusted_id, flashcard.id)
        if trusted_id
        else False
    )
    return FlashcardResponse.from_flashcard(flashcard, bookmarked=bookmarked)


@router.delete("/{flashcard_id}", status_code=204)
async def delete_flashcard(
    flashcard_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Delete a flashcard."""
    result = await db.execute(select(Flashcard).where(Flashcard.id == flashcard_id))
    flashcard = result.scalar_one_or_none()
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    deck_result = await db.execute(select(Deck).where(Deck.id == flashcard.deck_id))
    deck = deck_result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)
    await db.delete(flashcard)
    await db.flush()


@router.post("", response_model=FlashcardResponse, status_code=201)
async def create_flashcard(
    payload: FlashcardCreate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Create a new flashcard."""
    # Validate deck exists
    result = await db.execute(select(Deck).where(Deck.id == payload.deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)

    owner_result = await db.execute(select(User).where(User.id == deck.user_id))
    owner = owner_result.scalar_one_or_none()
    await assert_may_add_flashcards_to_deck(db, payload.deck_id, owner, trusted_id, 1)

    img: str | None = None
    if payload.image_url:
        img = validate_image_url_for_write(payload.image_url)
    flashcard = Flashcard(
        deck_id=payload.deck_id,
        question=payload.question,
        answer_short=payload.answer_short,
        answer_example=payload.answer_example,
        answer_detailed=payload.answer_detailed,
        image_url=img,
        difficulty=DIFFICULTY_TO_INT.get(payload.difficulty, 1),
    )
    db.add(flashcard)
    await db.flush()
    await db.refresh(flashcard)

    return FlashcardResponse.from_flashcard(flashcard, bookmarked=False)


class _ImportCard(BaseModel):
    question: str = Field(..., min_length=1)
    answer_short: str = Field(..., min_length=1)
    answer_example: str | None = None
    answer_detailed: str | None = None


class _ImportRequest(BaseModel):
    deck_id: str
    cards: List[_ImportCard] = Field(..., min_length=1, max_length=500)


class _ImportResponse(BaseModel):
    created: int
    updated: int = 0
    skipped: int = 0


@router.post("/import", response_model=_ImportResponse, status_code=201)
async def import_flashcards(
    payload: _ImportRequest,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Batch-create or update flashcards from structured Q/A import (no LLM).

    Same question text as an existing card (case-insensitive, trimmed) updates
    that card with the new answers. New rows only consume a slot on free tier;
    updates are always allowed even at the deck card cap.
    """
    result = await db.execute(select(Deck).where(Deck.id == payload.deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)

    owner_result = await db.execute(select(User).where(User.id == deck.user_id))
    owner = owner_result.scalar_one_or_none()

    existing_rows = await db.execute(
        select(Flashcard)
        .where(Flashcard.deck_id == payload.deck_id)
        .order_by(Flashcard.created_at.asc())
    )
    norm_to_card: dict[str, Flashcard] = {}
    for fc in existing_rows.scalars().all():
        k = fc.question.strip().lower()
        if k not in norm_to_card:
            norm_to_card[k] = fc

    slots_for_new: int | None = None
    if not user_has_elevated_tier(owner, trusted_id):
        current = await count_flashcards_in_deck(db, payload.deck_id)
        slots_for_new = max(0, LIMITED_MAX_CARDS_PER_DECK - current)

    created = 0
    updated = 0
    skipped = 0
    for card in payload.cards:
        norm = card.question.strip().lower()
        answer_short, answer_example = resolve_import_answer_fields(
            card.answer_short, card.answer_example
        )
        if norm in norm_to_card:
            fc = norm_to_card[norm]
            fc.question = card.question
            fc.answer_short = answer_short
            fc.answer_example = answer_example
            fc.answer_detailed = card.answer_detailed
            fc.difficulty = 1
            updated += 1
            continue
        if slots_for_new is not None and created >= slots_for_new:
            skipped += 1
            continue
        fc = Flashcard(
            deck_id=payload.deck_id,
            question=card.question,
            answer_short=answer_short,
            answer_example=answer_example,
            answer_detailed=card.answer_detailed,
            difficulty=1,
        )
        db.add(fc)
        norm_to_card[norm] = fc
        created += 1

    await db.flush()
    return _ImportResponse(created=created, updated=updated, skipped=skipped)
