"""YouTube transcript endpoint — fetches captions for a video."""

import html
import logging
import re
from typing import Optional
from urllib.parse import parse_qs, urlparse

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from youtube_transcript_api import YouTubeTranscriptApi

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/youtube", tags=["youtube"])

_YT_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?.*v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})"),
]

MAX_TRANSCRIPT_CHARS = 60_000


def extract_video_id(url: str) -> Optional[str]:
    url = url.strip()
    if len(url) == 11 and re.match(r"^[a-zA-Z0-9_-]+$", url):
        return url
    for pattern in _YT_PATTERNS:
        m = pattern.search(url)
        if m:
            return m.group(1)
    parsed = urlparse(url)
    if "youtube.com" in (parsed.hostname or ""):
        qs = parse_qs(parsed.query)
        v = qs.get("v")
        if v and len(v[0]) == 11:
            return v[0]
    return None


def fetch_video_title(video_id: str) -> Optional[str]:
    try:
        resp = requests.get(
            f"https://www.youtube.com/watch?v={video_id}",
            headers={"Accept-Language": "en-US,en;q=0.9"},
            timeout=10,
        )
        if resp.status_code == 200:
            m = re.search(r"<title>(.+?)(?:\s*-\s*YouTube)?\s*</title>", resp.text)
            if m:
                return html.unescape(m.group(1)).strip()
    except Exception:
        logger.debug("Could not fetch video title for %s", video_id)
    return None


class TranscriptRequest(BaseModel):
    url: str = Field(..., min_length=5, description="YouTube video URL")


class TranscriptResponse(BaseModel):
    video_id: str
    title: Optional[str] = None
    transcript: str
    language: Optional[str] = None
    char_count: int


@router.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(payload: TranscriptRequest):
    video_id = extract_video_id(payload.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL. Please paste a valid video link.")

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.fetch(video_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Transcript fetch failed for %s: %s", video_id, exc)
        raise HTTPException(
            status_code=422,
            detail="No transcript available for this video. The video may not have captions enabled.",
        )

    try:
        parts = [snippet.text for snippet in transcript_list.snippets]
        text = " ".join(parts)
    except Exception:
        parts = [str(entry) for entry in transcript_list]
        text = " ".join(parts)

    lang = None
    try:
        lang = transcript_list.language
    except Exception:
        pass

    if len(text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Transcript is too short to generate useful flashcards.")

    if len(text) > MAX_TRANSCRIPT_CHARS:
        text = text[:MAX_TRANSCRIPT_CHARS]

    title = fetch_video_title(video_id)

    return TranscriptResponse(
        video_id=video_id,
        title=title,
        transcript=text,
        language=lang,
        char_count=len(text),
    )
