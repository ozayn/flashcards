from __future__ import annotations

import json
import statistics
from collections import defaultdict
from typing import List, Optional

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete as sql_delete
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.user_activity import list_user_activity
from app.core.email_identity import (
    list_users_matching_email_identity,
    normalize_email_for_identity,
)
from app.core.platform_admin import require_platform_admin
from app.core.product_admin import user_access_role_for_admin_list
from app.models import Category, Deck, Flashcard, GenerationJobMetric, Review, User, UserActivity
from app.schemas.deck import DeckResponse
from app.schemas.user import (
    UserActivityItem,
    UserAdminListItem,
    UserAdminUpdate,
    UserDeletePreviewResponse,
    UserResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


async def _latest_activity_at(
    db: AsyncSession, user_id: str
) -> datetime | None:
    r = await db.execute(
        select(func.max(UserActivity.created_at)).where(
            UserActivity.user_id == user_id
        )
    )
    return r.scalar_one_or_none()


def _user_to_admin_list_item(
    user: User, last_active_at: datetime | None
) -> UserAdminListItem:
    return UserAdminListItem(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        plan=user.plan,
        access_role=user_access_role_for_admin_list(user),
        created_at=user.created_at,
        picture_url=user.picture_url,
        last_active_at=last_active_at,
    )


class LegacyBulkTransferPreviewResponse(BaseModel):
    source_user_id: str
    name: str
    email: str
    is_legacy_user: bool
    deck_count: int


class BulkLegacyTransferResponse(BaseModel):
    moved_count: int
    deck_ids: List[str]


def _normalize_category_name(s: str) -> str:
    """Trim, lowercase, collapse spaces — same rule as /categories duplicate detection."""
    return " ".join(s.strip().lower().split())


async def _destination_category_for_transferred_deck(
    db: AsyncSession,
    admin_user: User,
    source_category: Category,
) -> tuple[str | None, datetime | None]:
    """
    Pick or create an admin-owned category matching the source category name.
    Returns (category_id, category_assigned_at) or (None, None) for uncategorized.
    """
    raw = (source_category.name or "").strip()
    if not raw:
        return None, None

    norm = _normalize_category_name(source_category.name)
    owned = await db.execute(
        select(Category).where(Category.user_id == admin_user.id)
    )
    for existing in owned.scalars().all():
        if _normalize_category_name(existing.name) == norm:
            return existing.id, datetime.utcnow()

    stored = raw[:100] if len(raw) > 100 else raw
    new_cat = Category(name=stored, user_id=admin_user.id)
    db.add(new_cat)
    await db.flush()
    await db.refresh(new_cat)
    return new_cat.id, datetime.utcnow()


async def _transfer_legacy_deck_to_admin_user(
    db: AsyncSession,
    deck: Deck,
    admin_user: User,
) -> DeckResponse:
    """
    Move one deck from its current owner into admin_user's account.
    Clears reviews on the deck's cards; maps category by normalized name, creating
    a new admin-owned category when needed. Caller must enforce legacy owner and admin google_sub.
    """
    fc_result = await db.execute(
        select(Flashcard.id).where(Flashcard.deck_id == deck.id)
    )
    flashcard_ids = [row[0] for row in fc_result.all()]
    if flashcard_ids:
        await db.execute(
            sql_delete(Review).where(Review.flashcard_id.in_(flashcard_ids))
        )

    if deck.category_id:
        cat_result = await db.execute(
            select(Category).where(Category.id == deck.category_id)
        )
        cat = cat_result.scalar_one_or_none()
        if not cat:
            deck.category_id = None
            deck.category_assigned_at = None
        elif cat.user_id == admin_user.id:
            deck.category_assigned_at = datetime.utcnow()
        else:
            target_id, assigned_at = await _destination_category_for_transferred_deck(
                db, admin_user, cat
            )
            deck.category_id = target_id
            deck.category_assigned_at = assigned_at

    deck.user_id = admin_user.id
    deck.is_public = False
    await db.flush()
    await db.refresh(deck)

    cnt = await db.execute(
        select(func.count(Flashcard.id)).where(Flashcard.deck_id == deck.id)
    )
    card_count = int(cnt.scalar() or 0)
    return DeckResponse.model_validate(deck).model_copy(
        update={
            "card_count": card_count,
            "owner_is_legacy": False,
            "owner_name": admin_user.name,
            "owner_email": admin_user.email,
        }
    )


@router.get(
    "/users",
    response_model=List[UserAdminListItem],
    dependencies=[Depends(require_platform_admin)],
)
async def admin_list_users(db: AsyncSession = Depends(get_db)):
    last_active_sq = (
        select(
            UserActivity.user_id,
            func.max(UserActivity.created_at).label("last_active_at"),
        )
        .group_by(UserActivity.user_id)
        .subquery()
    )
    result = await db.execute(
        select(User, last_active_sq.c.last_active_at)
        .outerjoin(last_active_sq, User.id == last_active_sq.c.user_id)
        .order_by(User.created_at)
    )
    rows = result.all()
    return [_user_to_admin_list_item(u, last_active) for u, last_active in rows]


@router.get(
    "/users/{user_id}/activity",
    response_model=List[UserActivityItem],
    dependencies=[Depends(require_platform_admin)],
)
async def admin_user_activity(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(15, ge=1, le=50),
):
    """Recent activity for any user (platform admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    rows = await list_user_activity(db, user_id, limit=limit)
    out: List[UserActivityItem] = []
    for row in rows:
        meta = None
        if row.meta_json:
            try:
                meta = json.loads(row.meta_json)
                if not isinstance(meta, dict):
                    meta = None
            except json.JSONDecodeError:
                meta = None
        out.append(
            UserActivityItem(
                id=row.id,
                event_type=row.event_type,
                created_at=row.created_at,
                meta=meta,
            )
        )
    return out


@router.get(
    "/users/{user_id}/delete-preview",
    response_model=UserDeletePreviewResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_user_delete_preview(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    cnt = await db.execute(
        select(func.count()).select_from(Deck).where(Deck.user_id == user_id)
    )
    deck_count = int(cnt.scalar_one() or 0)
    return UserDeletePreviewResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        deck_count=deck_count,
    )


@router.get(
    "/users/{user_id}/legacy-bulk-transfer-preview",
    response_model=LegacyBulkTransferPreviewResponse,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_legacy_bulk_transfer_preview(user_id: str, db: AsyncSession = Depends(get_db)):
    """Admin-only: whether a user is legacy (non-OAuth) and how many decks they own (all, any archive state)."""
    result = await db.execute(select(User).where(User.id == user_id))
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="User not found")
    cnt = await db.execute(
        select(func.count()).select_from(Deck).where(Deck.user_id == user_id)
    )
    deck_count = int(cnt.scalar_one() or 0)
    is_legacy_user = source.google_sub is None
    return LegacyBulkTransferPreviewResponse(
        source_user_id=source.id,
        name=source.name,
        email=source.email,
        is_legacy_user=is_legacy_user,
        deck_count=deck_count,
    )


@router.post(
    "/users/{user_id}/transfer-all-legacy-decks-to-me",
    response_model=BulkLegacyTransferResponse,
)
async def admin_transfer_all_legacy_decks_to_me(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
):
    """
    Move every deck owned by a legacy (non-Google) user into the admin's Google-linked account.
    Same per-deck rules as POST /admin/decks/{deck_id}/transfer-to-me (reviews, categories, private).
    """
    if not admin_user.google_sub:
        raise HTTPException(
            status_code=400,
            detail="Your account must be Google-linked to receive transferred decks.",
        )
    if admin_user.id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot bulk-transfer decks from your own account.",
        )

    source_result = await db.execute(select(User).where(User.id == user_id))
    source = source_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="User not found")
    if source.google_sub is not None:
        raise HTTPException(
            status_code=403,
            detail="Only decks owned by a legacy (non-Google) user can be transferred.",
        )

    decks_result = await db.execute(
        select(Deck).where(Deck.user_id == user_id).order_by(Deck.created_at.asc())
    )
    decks = decks_result.scalars().all()
    deck_ids: List[str] = []
    for deck in decks:
        await _transfer_legacy_deck_to_admin_user(db, deck, admin_user)
        deck_ids.append(deck.id)

    return BulkLegacyTransferResponse(moved_count=len(deck_ids), deck_ids=deck_ids)


@router.delete(
    "/users/{user_id}",
    status_code=204,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_delete_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently delete the user. Database FKs use ON DELETE CASCADE for decks
    (and flashcards under those decks), categories, and reviews tied to this user.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.flush()


@router.patch(
    "/users/{user_id}",
    response_model=UserAdminListItem,
    dependencies=[Depends(require_platform_admin)],
)
async def admin_update_user(
    user_id: str,
    payload: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        norm = normalize_email_for_identity(payload.email)
        if norm:
            matches = await list_users_matching_email_identity(db, norm)
            if any(u.id != user_id for u in matches):
                raise HTTPException(status_code=400, detail="Email already in use")

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = payload.email

    await db.flush()
    await db.refresh(user)
    last_active = await _latest_activity_at(db, user.id)
    return _user_to_admin_list_item(user, last_active)


@router.post(
    "/decks/{deck_id}/transfer-to-me",
    response_model=DeckResponse,
)
async def admin_transfer_legacy_deck_to_me(
    deck_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(require_platform_admin),
):
    """
    Move a deck from a legacy (non-OAuth) user into the admin's Google-linked account.
    Clears SRS reviews on the deck's cards; remaps category by name when possible.
    """
    if not admin_user.google_sub:
        raise HTTPException(
            status_code=400,
            detail="Your account must be Google-linked to receive transferred decks.",
        )

    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    owner_result = await db.execute(select(User).where(User.id == deck.user_id))
    old_owner = owner_result.scalar_one_or_none()
    if not old_owner:
        raise HTTPException(status_code=404, detail="Deck owner not found")
    if old_owner.google_sub is not None:
        raise HTTPException(
            status_code=403,
            detail="Only decks owned by a legacy (non-Google) user can be transferred.",
        )
    if deck.user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="You already own this deck.")

    return await _transfer_legacy_deck_to_admin_user(db, deck, admin_user)


def _percentile_ms(values: list[int], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n == 1:
        return float(s[0])
    idx = (p / 100.0) * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return s[lo] * (1 - frac) + s[hi] * frac


def _mean_optional(xs: list[Optional[int]]) -> Optional[float]:
    nums = [int(x) for x in xs if x is not None]
    if not nums:
        return None
    return statistics.mean(nums)


class GenerationMetricItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    gen_job_id: str
    deck_id: str
    user_id: Optional[str] = None
    source_type: str
    success: bool
    failure_tag: Optional[str] = None
    cards_requested: int
    cards_created: int
    cards_provider: str
    started_at: datetime
    completed_at: datetime
    total_ms: int
    prepare_phase_ms: Optional[int] = None
    transcript_ms: Optional[int] = None
    source_fetch_ms: Optional[int] = None
    card_generation_ms: Optional[int] = None
    grounding_ms: Optional[int] = None
    summary_ms: Optional[int] = None
    other_ms: Optional[int] = None


class SourceTypeTimingBreakdown(BaseModel):
    source_type: str
    count: int
    avg_total_ms: float
    avg_transcript_ms: Optional[float] = None
    avg_source_fetch_ms: Optional[float] = None
    avg_card_generation_ms: Optional[float] = None
    avg_grounding_ms: Optional[float] = None
    avg_summary_ms: Optional[float] = None
    avg_other_ms: Optional[float] = None
    # Average % of total job time (for stacked bar); Nones treated as 0 in numerator
    stack_pct_transcript: float = 0.0
    stack_pct_source_fetch: float = 0.0
    stack_pct_cards: float = 0.0
    stack_pct_grounding: float = 0.0
    stack_pct_summary: float = 0.0
    stack_pct_other: float = 0.0


class GenerationMetricsStatsResponse(BaseModel):
    sample_size: int
    total_jobs: int
    success_count: int
    success_rate: float
    avg_total_ms: float
    p50_total_ms: float
    p90_total_ms: float
    by_source_type: list[SourceTypeTimingBreakdown]


@router.get(
    "/generation-metrics/recent",
    response_model=list[GenerationMetricItem],
)
async def admin_generation_metrics_recent(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
    limit: int = Query(100, ge=1, le=500),
):
    result = await db.execute(
        select(GenerationJobMetric)
        .order_by(desc(GenerationJobMetric.completed_at))
        .limit(limit)
    )
    rows = result.scalars().all()
    return [GenerationMetricItem.model_validate(r) for r in rows]


@router.get(
    "/generation-metrics/stats",
    response_model=GenerationMetricsStatsResponse,
)
async def admin_generation_metrics_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
    sample_limit: int = Query(2000, ge=50, le=10000),
):
    result = await db.execute(
        select(GenerationJobMetric)
        .order_by(desc(GenerationJobMetric.completed_at))
        .limit(sample_limit)
    )
    rows = result.scalars().all()
    n = len(rows)
    if n == 0:
        return GenerationMetricsStatsResponse(
            sample_size=0,
            total_jobs=0,
            success_count=0,
            success_rate=0.0,
            avg_total_ms=0.0,
            p50_total_ms=0.0,
            p90_total_ms=0.0,
            by_source_type=[],
        )

    totals = [int(r.total_ms) for r in rows]
    success_n = sum(1 for r in rows if r.success)
    by_st: dict[str, list[GenerationJobMetric]] = defaultdict(list)
    for r in rows:
        by_st[r.source_type or "unknown"].append(r)

    breakdowns: list[SourceTypeTimingBreakdown] = []
    for st, lst in sorted(by_st.items(), key=lambda x: -len(x[1])):
        tms = [int(x.total_ms) for x in lst]
        avg_tot = statistics.mean(tms) if tms else 0.0
        mt = _mean_optional([x.transcript_ms for x in lst])
        msf = _mean_optional([x.source_fetch_ms for x in lst])
        mcg = _mean_optional([x.card_generation_ms for x in lst])
        mgr = _mean_optional([x.grounding_ms for x in lst])
        msm = _mean_optional([x.summary_ms for x in lst])
        mot = _mean_optional([x.other_ms for x in lst])

        def _pct(part: Optional[float]) -> float:
            if avg_tot <= 0 or part is None:
                return 0.0
            return max(0.0, min(100.0, (part / avg_tot) * 100.0))

        breakdowns.append(
            SourceTypeTimingBreakdown(
                source_type=st,
                count=len(lst),
                avg_total_ms=round(avg_tot, 1),
                avg_transcript_ms=round(mt, 1) if mt is not None else None,
                avg_source_fetch_ms=round(msf, 1) if msf is not None else None,
                avg_card_generation_ms=round(mcg, 1) if mcg is not None else None,
                avg_grounding_ms=round(mgr, 1) if mgr is not None else None,
                avg_summary_ms=round(msm, 1) if msm is not None else None,
                avg_other_ms=round(mot, 1) if mot is not None else None,
                stack_pct_transcript=round(_pct(mt), 1),
                stack_pct_source_fetch=round(_pct(msf), 1),
                stack_pct_cards=round(_pct(mcg), 1),
                stack_pct_grounding=round(_pct(mgr), 1),
                stack_pct_summary=round(_pct(msm), 1),
                stack_pct_other=round(_pct(mot), 1),
            )
        )

    return GenerationMetricsStatsResponse(
        sample_size=n,
        total_jobs=n,
        success_count=success_n,
        success_rate=round(success_n / n, 4),
        avg_total_ms=round(statistics.mean(totals), 1),
        p50_total_ms=round(_percentile_ms(totals, 50), 1),
        p90_total_ms=round(_percentile_ms(totals, 90), 1),
        by_source_type=breakdowns,
    )
