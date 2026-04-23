import json
import os
import re
import unicodedata
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.category_deck_order import renormalize_category_positions
from app.core.database import get_db
from app.core.user_activity import record_user_activity
from app.core.platform_admin import assert_acting_user_is_platform_admin
from app.core.user_access import (
    assert_may_act_as_user,
    assert_may_mutate_deck,
    assert_may_read_deck,
    get_trusted_acting_user_id,
)
from app.core.user_tier import (
    FREE_TIER_DUPLICATE_DECK_TOO_MANY_CARDS_MSG,
    LIMITED_MAX_CARDS_PER_DECK,
    assert_may_create_deck_for_user,
    user_has_elevated_tier,
)
from app.models import Category, Deck, Flashcard, FlashcardBookmark, Review, User
from app.models.enums import DeckStudyStatus
from app.schemas.deck import DeckCreate, DeckMoveRequest, DeckResponse, DeckUpdate
from app.schemas.flashcard import FlashcardResponse

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=List[DeckResponse])
async def get_decks(
    user_id: str = Query(..., description="User ID to filter decks"),
    archived: bool = Query(False, description="If true, return only archived decks"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get all decks for a user. By default returns active (non-archived) decks."""
    await assert_may_act_as_user(db, trusted_id, user_id)
    result = await db.execute(
        select(Deck)
        .where(Deck.user_id == user_id, Deck.archived == archived)
        .order_by(Deck.created_at.desc())
    )
    decks = result.scalars().all()
    if not decks:
        return []
    owner_result = await db.execute(select(User).where(User.id == user_id))
    owner = owner_result.scalar_one_or_none()
    owner_is_legacy = bool(owner and owner.google_sub is None)
    owner_name = owner.name if owner else None
    owner_email = owner.email if owner else None
    deck_ids = [d.id for d in decks]
    count_result = await db.execute(
        select(Flashcard.deck_id, func.count(Flashcard.id))
        .where(Flashcard.deck_id.in_(deck_ids))
        .group_by(Flashcard.deck_id)
    )
    counts = {row[0]: row[1] for row in count_result.all()}
    return [
        DeckResponse.model_validate(d).model_copy(
            update={
                "card_count": counts.get(d.id, 0),
                "owner_is_legacy": owner_is_legacy,
                "owner_name": owner_name,
                "owner_email": owner_email,
            }
        )
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
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Create a personal copy of a deck and all its flashcards."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, source)
    await assert_may_act_as_user(db, trusted_id, user_id)

    owner_result = await db.execute(select(User).where(User.id == user_id))
    owner = owner_result.scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")
    await assert_may_create_deck_for_user(db, owner, trusted_id)

    cards_result = await db.execute(
        select(Flashcard).where(Flashcard.deck_id == deck_id).order_by(Flashcard.created_at)
    )
    cards = cards_result.scalars().all()
    if not user_has_elevated_tier(owner, trusted_id) and len(cards) > LIMITED_MAX_CARDS_PER_DECK:
        raise HTTPException(status_code=403, detail=FREE_TIER_DUPLICATE_DECK_TOO_MANY_CARDS_MSG)

    new_deck = Deck(
        user_id=user_id,
        name=source.name,
        description=source.description,
        source_type=source.source_type,
        source_url=source.source_url,
        source_topic=source.source_topic,
        source_metadata=source.source_metadata,
        is_public=False,
        study_status=DeckStudyStatus.not_started.value,
    )
    db.add(new_deck)
    await db.flush()

    card_count = 0
    for card in cards:
        db.add(Flashcard(
            deck_id=new_deck.id,
            question=card.question,
            answer_short=card.answer_short,
            answer_example=card.answer_example,
            answer_detailed=card.answer_detailed,
            image_url=getattr(card, "image_url", None) or None,
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
    bookmarked_only: bool = Query(
        False, description="Return only cards bookmarked by the signed-in user"
    ),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get all flashcards for a deck. When due_only=true, return only cards due for review for the given user."""
    deck_row = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck_for_access = deck_row.scalar_one_or_none()
    if not deck_for_access:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck_for_access)

    if bookmarked_only and not trusted_id:
        raise HTTPException(
            status_code=401,
            detail="Sign in to filter bookmarked cards",
        )

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
        await assert_may_act_as_user(db, trusted_id, user_id.strip())
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

    bookmarked_ids: set[str] = set()
    if trusted_id and flashcards:
        fc_ids = [f.id for f in flashcards]
        bm_rows = await db.execute(
            select(FlashcardBookmark.flashcard_id).where(
                FlashcardBookmark.user_id == trusted_id,
                FlashcardBookmark.flashcard_id.in_(fc_ids),
            )
        )
        bookmarked_ids = {row[0] for row in bm_rows.all()}

    if bookmarked_only:
        flashcards = [f for f in flashcards if f.id in bookmarked_ids]

    return [
        FlashcardResponse.from_flashcard(f, bookmarked=f.id in bookmarked_ids)
        for f in flashcards
    ]


@router.get("/{deck_id}", response_model=DeckResponse)
async def get_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get a single deck by ID."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck)
    count_result = await db.execute(
        select(func.count(Flashcard.id)).where(Flashcard.deck_id == deck_id)
    )
    card_count = count_result.scalar() or 0
    owner_result = await db.execute(select(User).where(User.id == deck.user_id))
    owner = owner_result.scalar_one_or_none()
    owner_is_legacy = bool(owner and owner.google_sub is None)
    return DeckResponse.model_validate(deck).model_copy(
        update={
            "card_count": card_count,
            "owner_is_legacy": owner_is_legacy,
            "owner_name": owner.name if owner else None,
            "owner_email": owner.email if owner else None,
        }
    )


@router.get("/{deck_id}/related", response_model=List[DeckResponse])
async def get_related_decks(
    deck_id: str,
    limit: int = Query(4, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Get other decks in the same category as this deck. Excludes current deck and archived."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck or not deck.category_id:
        return []
    await assert_may_read_deck(db, trusted_id, deck)
    owner_result = await db.execute(select(User).where(User.id == deck.user_id))
    owner = owner_result.scalar_one_or_none()
    restrict_to_public = (
        owner is not None
        and owner.google_sub is not None
        and trusted_id != deck.user_id
    )
    related = await db.execute(
        select(Deck)
        .where(
            Deck.category_id == deck.category_id,
            Deck.id != deck_id,
            Deck.archived == False,
            Deck.user_id == deck.user_id,
            *([Deck.is_public == True] if restrict_to_public else []),
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
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Update a deck's name and/or description."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()

    if deck is None:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)

    if data.name is not None:
        deck.name = data.name

    if data.description is not None:
        deck.description = data.description

    if data.archived is not None:
        deck.archived = data.archived

    if data.is_public is not None:
        await assert_acting_user_is_platform_admin(db, trusted_id)
        deck.is_public = data.is_public

    renormalize_old_cat: Optional[str] = None
    renormalize_new_cat: Optional[str] = None
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
        prev_cat = deck.category_id
        if (new_cat_id or None) != (prev_cat or None):
            deck.category_id = new_cat_id
            deck.category_assigned_at = datetime.utcnow() if new_cat_id else None
            deck.category_position = None
            renormalize_old_cat = prev_cat
            renormalize_new_cat = new_cat_id

    if data.study_status is not None:
        deck.study_status = data.study_status

    await db.flush()

    if renormalize_old_cat:
        await renormalize_category_positions(db, renormalize_old_cat, deck.user_id)
    if renormalize_new_cat:
        await renormalize_category_positions(db, renormalize_new_cat, deck.user_id)

    await db.refresh(deck)

    return DeckResponse.model_validate(deck)


@router.patch("/{deck_id}/move", response_model=DeckResponse)
async def move_deck(
    deck_id: str,
    payload: DeckMoveRequest,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Move a deck to a category."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)

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
        deck.category_position = None

    await db.flush()

    if old_cat_id and old_cat_id != deck.category_id:
        await renormalize_category_positions(db, old_cat_id, deck.user_id)
    if deck.category_id and old_cat_id != deck.category_id:
        await renormalize_category_positions(db, deck.category_id, deck.user_id)

    await db.refresh(deck)
    return DeckResponse.model_validate(deck)


@router.delete("/{deck_id}/reviews")
async def delete_deck_reviews(
    deck_id: str,
    user_id: Optional[str] = Query(None, description="If provided, only delete reviews for this user"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Development-only: Delete all review records for a deck. Flashcards become 'new' again."""
    if (os.environ.get("ENVIRONMENT") or "development").strip().lower() == "production":
        raise HTTPException(status_code=403, detail="This endpoint is disabled in production")

    deck_result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck_row = deck_result.scalar_one_or_none()
    if not deck_row:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck_row)

    flashcard_ids = select(Flashcard.id).where(Flashcard.deck_id == deck_id)
    stmt = delete(Review).where(Review.flashcard_id.in_(flashcard_ids))
    if user_id and user_id.strip():
        await assert_may_act_as_user(db, trusted_id, user_id.strip())
        stmt = stmt.where(Review.user_id == user_id.strip())
    result = await db.execute(stmt)
    await db.flush()
    deleted_count = result.rowcount or 0
    return {"deleted_reviews": deleted_count}


@router.delete("/{deck_id}", status_code=204)
async def delete_deck(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Delete a deck and all its flashcards."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_mutate_deck(db, trusted_id, deck)
    cat_before = deck.category_id
    owner_id = deck.user_id
    await db.delete(deck)
    await db.flush()
    if cat_before:
        await renormalize_category_positions(db, cat_before, owner_id)


@router.post("", response_model=DeckResponse, status_code=201)
async def create_deck(
    payload: DeckCreate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Create a new deck."""
    await assert_may_act_as_user(db, trusted_id, payload.user_id)
    owner_result = await db.execute(select(User).where(User.id == payload.user_id))
    owner = owner_result.scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="User not found")
    await assert_may_create_deck_for_user(db, owner, trusted_id)
    deck = Deck(
        user_id=payload.user_id,
        name=payload.name,
        description=payload.description,
        source_type=payload.source_type,
        source_url=payload.source_url,
        source_topic=payload.source_topic,
        source_text=payload.source_text,
        source_segments=payload.source_segments,
        source_metadata=payload.source_metadata,
    )
    db.add(deck)
    await db.flush()
    await db.refresh(deck)
    try:
        await record_user_activity(
            db,
            payload.user_id,
            "deck_created",
            {
                "deck_id": str(deck.id),
                "deck_name": (deck.name or "")[:200],
            },
        )
    except Exception:
        pass
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


def _parsed_transcript_segments(raw: Optional[str]) -> Optional[list]:
    """Return segment list if ``raw`` is non-empty JSON array, else None."""
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list) and len(data) > 0:
            return data
    except (ValueError, TypeError):
        pass
    return None


def _plain_transcript_for_download(deck) -> str:
    """
    Full plain transcript for export. Prefer joining ``source_segments`` (uncapped) so the .txt
    matches the timestamped download; fall back to ``source_text`` for older decks without segments.
    Join rule matches ``youtube.py`` (snippet texts joined with spaces).
    """
    segs = _parsed_transcript_segments(deck.source_segments)
    if segs is not None:
        return " ".join(str(s.get("text") or "") for s in segs)
    return (deck.source_text or "").strip()


def _get_transcript_deck(deck) -> None:
    """Validate that a deck is eligible for transcript download."""
    if deck.source_type != "youtube":
        raise HTTPException(status_code=400, detail="Transcript download is only available for YouTube decks.")
    has_text = bool(deck.source_text and deck.source_text.strip())
    has_segments = _parsed_transcript_segments(deck.source_segments) is not None
    if not has_text and not has_segments:
        raise HTTPException(status_code=404, detail="No transcript stored for this deck.")


@router.get("/{deck_id}/transcript")
async def download_transcript(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Download the stored plain transcript as a .txt file."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck)
    _get_transcript_deck(deck)

    title = deck.source_topic or deck.name or "YouTube Video"
    url = deck.source_url or ""

    body = f"Title: {title}\n"
    if url:
        body += f"Source URL: {url}\n"
    body += "\nTranscript:\n\n"
    body += _plain_transcript_for_download(deck)

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
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    """Download the stored transcript with timestamps as a .txt file."""
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    await assert_may_read_deck(db, trusted_id, deck)
    _get_transcript_deck(deck)

    if not deck.source_segments or not deck.source_segments.strip():
        raise HTTPException(status_code=404, detail="No timestamped data available for this deck.")

    try:
        segments = json.loads(deck.source_segments)
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
