"""
Upload and serve optional flashcard images (on-disk, URL stored on Flashcard.image_url).
Uploads are decoded, resized (max 1600px long side), and saved as WebP (quality 82).
"""
from __future__ import annotations

import logging
import mimetypes
import os
import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.user_access import assert_may_read_deck, get_trusted_acting_user_id
from app.models import Deck, Flashcard
from app.utils.flashcard_image_process import (
    process_upload_to_webp,
    write_sidecar_meta_json,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["flashcard-images"])

# Relative path stored in DB, e.g. flashcard-images/a1b2c3d4-....webp
_IMAGE_PATH_RE = re.compile(
    r"^flashcard-images/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpe?g|png|gif|webp)$",
    re.IGNORECASE,
)
# Pre-process cap (v1: ~8 MB). Images are re-encoded smaller after resize/WebP.
_MAX_UPLOAD_BYTES = 8 * 1024 * 1024
_ALLOWED_CT = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
}
_UP_DIR = Path(
    os.environ.get("FLASHCARD_IMAGE_DIR", "")
    or (Path(__file__).resolve().parent.parent / "data" / "flashcard_images")
)
_UP_DIR.mkdir(parents=True, exist_ok=True)


def _upload_dir() -> Path:
    return _UP_DIR


def is_valid_stored_image_url(s: str | None) -> bool:
    if not s or not isinstance(s, str):
        return False
    t = s.strip()
    return bool(_IMAGE_PATH_RE.match(t))


class ImageMeta(BaseModel):
    width: int
    height: int
    byte_size: int = Field(..., description="Stored file size in bytes after processing")
    max_dimension: int = Field(
        ..., description="Longest side cap used when resizing (e.g. 1600)"
    )
    file_format: str = "webp"
    quality: int = 82


class UploadResponse(BaseModel):
    url: str = Field(..., description="Path to store on Flashcard.image_url (no leading slash)")
    meta: ImageMeta


@router.post("/flashcard-images", response_model=UploadResponse, status_code=201)
async def upload_flashcard_image(
    file: UploadFile = File(...),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    if not trusted_id:
        raise HTTPException(status_code=401, detail="Sign in to upload images")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Image is too large to upload. Maximum file size is 8 MB.",
        )
    ct = (file.content_type or "").split(";")[0].strip().lower()
    if ct and ct not in _ALLOWED_CT and ct != "image/jpg":
        raise HTTPException(
            status_code=400, detail="Only JPEG, PNG, GIF, and WebP images are allowed"
        )
    try:
        out_bytes, public_meta, pm = process_upload_to_webp(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("flashcard image processing failed: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Could not process this image. Try a different file or format.",
        ) from e

    uid = str(uuid.uuid4())
    name = f"{uid}.webp"
    rel = f"flashcard-images/{name}"
    path = _upload_dir() / name
    try:
        path.write_bytes(out_bytes)
        write_sidecar_meta_json(_upload_dir(), uid, pm)
    except OSError as e:
        logger.exception("failed to write flashcard image: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save image") from e

    return UploadResponse(
        url=rel,
        meta=ImageMeta.model_validate(public_meta),
    )


@router.get("/flashcard-images/{filename}")
async def get_flashcard_image(
    filename: str,
    db: AsyncSession = Depends(get_db),
    trusted_id: Optional[str] = Depends(get_trusted_acting_user_id),
):
    if ".." in filename or filename.startswith(("/", "\\")):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not re.match(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpe?g|png|gif|webp)$",
        filename,
        re.IGNORECASE,
    ):
        raise HTTPException(status_code=400, detail="Invalid filename")
    rel = f"flashcard-images/{filename}"
    r = await db.execute(select(Flashcard).where(Flashcard.image_url == rel).limit(5))
    rows = r.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    allowed = False
    for fc in rows:
        dr = await db.execute(select(Deck).where(Deck.id == fc.deck_id))
        deck = dr.scalar_one_or_none()
        if not deck:
            continue
        try:
            await assert_may_read_deck(db, trusted_id, deck)
        except HTTPException:
            continue
        allowed = True
        break
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed to view this image")
    path = _upload_dir() / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing")
    media_type, _ = mimetypes.guess_type(filename)
    return FileResponse(
        path, filename=filename, media_type=media_type or "application/octet-stream"
    )


def validate_image_url_for_write(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip() if isinstance(raw, str) else ""
    if not s:
        return None
    if not is_valid_stored_image_url(s):
        raise HTTPException(status_code=400, detail="Invalid image_url")
    return s
