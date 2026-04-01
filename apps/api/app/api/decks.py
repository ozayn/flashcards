import os
import re
import unicodedata
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Category, Deck, Flashcard, Review, User
from app.models.enums import UserRole
from app.schemas.deck import DeckCreate, DeckMoveRequest, DeckResponse, DeckUpdate
from app.schemas.flashcard import FlashcardResponse

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=List[DeckResponse])
async def get_decks(
    user_id: str = Query(..., description="User ID to filter decks"),
    archived: bool = Query(False, description="If true, return only archived decks"),
    db: AsyncSession = Depends(get_db),
):
    """Get all decks for a user. By default returns active (non-archived) decks."""
    result = await db.execute(
        select(Deck)
        .where(Deck.user_id == user_id, Deck.archived == archived)
        .order_by(Deck.created_at.desc())
    )
    decks = result.scalars().all()
    if not decks:
        return []
    deck_ids = [d.id for d in decks]
    count_result = await db.execute(
        select(Flashcard.deck_id, func.count(Flashcard.id))
        .where(Flashcard.deck_id.in_(deck_ids))
        .group_by(Flashcard.deck_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return [
        DeckResponse.model_validate(d).model_copy(update={"card_count": counts.get(d.id, 0)})
        for d in decks
    ]


@router.get("/library", response_model=List[DeckResponse])
async def get_library_decks(
    db: AsyncSession = Depends(get_db),
):
    """Get all public/library decks."""
    result = await db.execute(
        select(Deck)
        .where(Deck.is_public == True, Deck.archived == False)
        .order_by(Deck.created_at.desc())
    )
    decks = result.scalars().all()
    if not decks:
        return []
    deck_ids = [d.id for d in decks]
    count_result = await db.execute(
        select(Flashcard.deck_id, func.count(Flashcard.id))
        .where(Flashcard.deck_id.in_(deck_ids))
        .group_by(Flashcard.deck_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return [
        DeckResponse.model_validate(d).model_copy(update={"card_count": counts.get(d.id, 0)})
        for d in decks
    ]


@router.post("/{deck_id}/duplicate", response_model=DeckResponse, status_code=201)
async def duplicate_deck(
    deck_id: str,
    user_id: str = Query(..., description="User ID to own the duplicated deck"),
    db: AsyncSession = Depends(get_db),
):
    """Create a personal copy of a deck and all its flashcards."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Deck not found")

    new_deck = Deck(
        user_id=user_id,
        name=source.name,
        description=source.description,
        source_type=source.source_type,
        source_url=source.source_url,
        source_topic=source.source_topic,
        is_public=False,
    )
    db.add(new_deck)
    await db.flush()

    cards_result = await db.execute(
        select(Flashcard).where(Flashcard.deck_id == deck_id).order_by(Flashcard.created_at)
    )
    cards = cards_result.scalars().all()
    card_count = 0
    for card in cards:
        db.add(Flashcard(
            deck_id=new_deck.id,
            question=card.question,
            answer_short=card.answer_short,
            answer_detailed=card.answer_detailed,
            difficulty=card.difficulty,
        ))
        card_count += 1

    await db.flush()
    await db.refresh(new_deck)
    return DeckResponse.model_validate(new_deck).model_copy(update={"card_count": card_count})


@router.get("/{deck_id}/flashcards", response_model=List[FlashcardResponse])
async def get_deck_flashcards(
    deck_id: str,
    due_only: bool = Query(False, description="Return only cards due for review"),
    user_id: Optional[str] = Query(None, description="User ID (required when due_only=true)"),
    db: AsyncSession = Depends(get_db),
):
    """Get all flashcards for a deck. When due_only=true, return only cards due for review for the given user."""
    result = await db.execute(
        select(Flashcard).where(Flashcard.deck_id == deck_id).order_by(Flashcard.created_at)
    )
    flashcards = result.scalars().all()

    if due_only:
        if not user_id or not user_id.strip():
            raise HTTPException(
                status_code=400,
                detail="user_id is required when due_only=true",
            )
        now = datetime.utcnow()
        # Latest review per flashcard for THIS user only
        latest_review_subq = (
            select(
                Review.flashcard_id,
                func.max(Review.review_time).label("max_time"),
            )
            .where(Review.user_id == user_id.strip())
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
            .where(Review.user_id == user_id.strip(), Review.next_review > now)
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
    count_result = await db.execute(
        select(func.count(Flashcard.id)).where(Flashcard.deck_id == deck_id)
    )
    card_count = count_result.scalar() or 0
    return DeckResponse.model_validate(deck).model_copy(update={"card_count": card_count})


@router.get("/{deck_id}/related", response_model=List[DeckResponse])
async def get_related_decks(
    deck_id: str,
    limit: int = Query(4, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
):
    """Get other decks in the same category as this deck. Excludes current deck and archived."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck or not deck.category_id:
        return []
    related = await db.execute(
        select(Deck)
        .where(
            Deck.category_id == deck.category_id,
            Deck.id != deck_id,
            Deck.archived == False,
            Deck.user_id == deck.user_id,
        )
        .order_by(Deck.created_at.desc())
        .limit(limit)
    )
    decks = related.scalars().all()
    if not decks:
        return []
    deck_ids = [d.id for d in decks]
    count_result = await db.execute(
        select(Flashcard.deck_id, func.count(Flashcard.id))
        .where(Flashcard.deck_id.in_(deck_ids))
        .group_by(Flashcard.deck_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return [
        DeckResponse.model_validate(d).model_copy(update={"card_count": counts.get(d.id, 0)})
        for d in decks
    ]


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

    if data.archived is not None:
        deck.archived = data.archived

    if data.is_public is not None:
        user_result = await db.execute(select(User.role).where(User.id == deck.user_id))
        user_row = user_result.first()
        is_admin = user_row and user_row[0] in (UserRole.admin, UserRole.admin.value)
        if not is_admin:
            raise HTTPException(status_code=403, detail="Only admin users can change deck visibility.")
        deck.is_public = data.is_public

    if "category_id" in (data.model_dump(exclude_unset=True) or {}):
        new_cat_id = data.category_id if data.category_id else None
        if new_cat_id:
            cat_result = await db.execute(
                select(Category).where(
                    Category.id == new_cat_id,
                    Category.user_id == deck.user_id,
                )
            )
            if cat_result.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=403,
                    detail="Category not found or does not belong to you",
                )
        old_cat_id = deck.category_id
        deck.category_id = new_cat_id
        if new_cat_id != old_cat_id:
            deck.category_assigned_at = datetime.utcnow() if new_cat_id else None

    await db.flush()
    await db.refresh(deck)

    return DeckResponse.model_validate(deck)


@router.patch("/{deck_id}/move", response_model=DeckResponse)
async def move_deck(
    deck_id: str,
    payload: DeckMoveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Move a deck to a category."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    raw = payload.category_id
    category_id = (raw.strip() if raw else None) or None
    old_cat_id = deck.category_id
    if not category_id:
        deck.category_id = None
    else:
        cat_result = await db.execute(
            select(Category).where(
                Category.id == category_id,
                Category.user_id == deck.user_id,
            )
        )
        if cat_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=403,
                detail="Category not found or does not belong to you",
            )
        deck.category_id = category_id
    if category_id != old_cat_id:
        deck.category_assigned_at = datetime.utcnow() if category_id else None

    await db.flush()
    await db.refresh(deck)
    return DeckResponse.model_validate(deck)


@router.delete("/{deck_id}/reviews")
async def delete_deck_reviews(
    deck_id: str,
    user_id: Optional[str] = Query(None, description="If provided, only delete reviews for this user"),
    db: AsyncSession = Depends(get_db),
):
    """Development-only: Delete all review records for a deck. Flashcards become 'new' again."""
    if (os.environ.get("ENVIRONMENT") or "development").strip().lower() == "production":
        raise HTTPException(status_code=403, detail="This endpoint is disabled in production")

    deck_result = await db.execute(select(Deck).where(Deck.id == deck_id))
    if not deck_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Deck not found")

    flashcard_ids = select(Flashcard.id).where(Flashcard.deck_id == deck_id)
    stmt = delete(Review).where(Review.flashcard_id.in_(flashcard_ids))
    if user_id and user_id.strip():
        stmt = stmt.where(Review.user_id == user_id.strip())
    result = await db.execute(stmt)
    await db.flush()
    deleted_count = result.rowcount or 0
    return {"deleted_reviews": deleted_count}


@router.delete("/{deck_id}", status_code=204)
async def delete_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a deck and all its flashcards."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await db.delete(deck)
    await db.flush()


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
        source_topic=payload.source_topic,
        source_text=payload.source_text,
        source_segments=payload.source_segments,
    )
    db.add(deck)
    await db.flush()
    await db.refresh(deck)
    return DeckResponse.model_validate(deck)


def _slugify(text: str, max_len: int = 60) -> str:
    """Convert text to a filesystem-safe slug."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    text = re.sub(r"[-\s]+", "-", text)
    return text[:max_len].rstrip("-") or "transcript"


def _format_timestamp(seconds: float) -> str:
    """Format seconds as [HH:MM:SS] or [MM:SS]."""
    total = int(seconds)
    h, remainder = divmod(total, 3600)
    m, s = divmod(remainder, 60)
    if h > 0:
        return f"[{h:d}:{m:02d}:{s:02d}]"
    return f"[{m:02d}:{s:02d}]"


def _get_transcript_deck(deck) -> None:
    """Validate that a deck is eligible for transcript download."""
    if deck.source_type != "youtube":
        raise HTTPException(status_code=400, detail="Transcript download is only available for YouTube decks.")
    if not deck.source_text or not deck.source_text.strip():
        raise HTTPException(status_code=404, detail="No transcript stored for this deck.")


@router.get("/{deck_id}/transcript")
async def download_transcript(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Download the stored plain transcript as a .txt file."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    _get_transcript_deck(deck)

    title = deck.source_topic or deck.name or "YouTube Video"
    url = deck.source_url or ""

    body = f"Title: {title}\n"
    if url:
        body += f"Source URL: {url}\n"
    body += "\nTranscript:\n\n"
    body += deck.source_text

    filename = _slugify(title) + "-transcript.txt"

    return PlainTextResponse(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{deck_id}/transcript/timestamped")
async def download_transcript_timestamped(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Download the stored transcript with timestamps as a .txt file."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    _get_transcript_deck(deck)

    if not deck.source_segments or not deck.source_segments.strip():
        raise HTTPException(status_code=404, detail="No timestamped data available for this deck.")

    import json as _json
    try:
        segments = _json.loads(deck.source_segments)
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="No timestamped data available for this deck.")

    title = deck.source_topic or deck.name or "YouTube Video"
    url = deck.source_url or ""

    body = f"Title: {title}\n"
    if url:
        body += f"Source URL: {url}\n"
    body += "\nTranscript (with timestamps):\n\n"

    for seg in segments:
        ts = _format_timestamp(seg.get("start", 0))
        body += f"{ts} {seg.get('text', '')}\n"

    filename = _slugify(title) + "-transcript-timestamped.txt"

    return PlainTextResponse(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
