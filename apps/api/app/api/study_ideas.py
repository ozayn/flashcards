from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.user_access import assert_may_act_as_user, get_trusted_acting_user_id
from app.models import StudyIdea
from app.schemas.study_idea import (
    StudyIdeaCreate,
    StudyIdeaResponse,
    StudyIdeaUpdate,
)

router = APIRouter(prefix="/study-ideas", tags=["study-ideas"])


@router.get("", response_model=List[StudyIdeaResponse])
async def list_study_ideas(
    user_id: str = Query(..., description="Owner user id"),
    status: Optional[str] = Query(
        None,
        description="Filter: idea, ready, or archived; omit for all",
    ),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    await assert_may_act_as_user(db, trusted_id, user_id)
    q = select(StudyIdea).where(StudyIdea.user_id == user_id)
    if status is not None and status.strip() != "":
        s = status.strip().lower()
        if s not in ("idea", "ready", "archived"):
            raise HTTPException(status_code=400, detail="Invalid status filter")
        q = q.where(StudyIdea.status == s)
    q = q.order_by(StudyIdea.updated_at.desc(), StudyIdea.created_at.desc())
    r = await db.execute(q)
    return [StudyIdeaResponse.model_validate(x) for x in r.scalars().all()]


@router.post("", response_model=StudyIdeaResponse, status_code=201)
async def create_study_idea(
    payload: StudyIdeaCreate,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    await assert_may_act_as_user(db, trusted_id, payload.user_id)
    now = datetime.utcnow()
    row = StudyIdea(
        user_id=payload.user_id,
        title=payload.title.strip(),
        body=(payload.body.strip() if payload.body else None) or None,
        url=payload.url,
        status=payload.status,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return StudyIdeaResponse.model_validate(row)


@router.patch("/{idea_id}", response_model=StudyIdeaResponse)
async def update_study_idea(
    idea_id: str,
    data: StudyIdeaUpdate,
    user_id: str = Query(..., description="Owner user id"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    await assert_may_act_as_user(db, trusted_id, user_id)
    r = await db.execute(
        select(StudyIdea).where(StudyIdea.id == idea_id, StudyIdea.user_id == user_id)
    )
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Study idea not found")
    patch = data.model_dump(exclude_unset=True)
    if not patch:
        return StudyIdeaResponse.model_validate(row)
    if "title" in patch and patch["title"] is not None:
        row.title = patch["title"].strip()
    if "body" in patch:
        b = patch["body"]
        if b is None:
            row.body = None
        elif isinstance(b, str):
            row.body = b.strip() or None
    if "url" in patch:
        u = patch["url"]
        if u is None:
            row.url = None
        else:
            row.url = u
    if "status" in patch and patch["status"] is not None:
        row.status = patch["status"]
    row.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(row)
    return StudyIdeaResponse.model_validate(row)


@router.delete("/{idea_id}", status_code=204)
async def delete_study_idea(
    idea_id: str,
    user_id: str = Query(..., description="Owner user id"),
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    await assert_may_act_as_user(db, trusted_id, user_id)
    r = await db.execute(
        select(StudyIdea).where(StudyIdea.id == idea_id, StudyIdea.user_id == user_id)
    )
    row = r.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Study idea not found")
    await db.delete(row)
    return None
