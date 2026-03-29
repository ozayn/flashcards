"""Webpage content extraction — fetches and extracts text from URLs (Wikipedia for v1)."""

import logging
import os
import re
from typing import Optional
from urllib.parse import unquote, urlparse

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webpage", tags=["webpage"])

MAX_ARTICLE_CHARS = 60_000
_WIKIPEDIA_HOSTS = re.compile(r"^([a-z]{2,3}\.)?wikipedia\.org$", re.IGNORECASE)
_REQUEST_TIMEOUT = 15
_REQUEST_HEADERS = {
    "User-Agent": "MemoNext/1.0 (flashcard generator; educational use)",
    "Accept-Language": "en-US,en;q=0.9",
}

_BLOCK_STATUS_CODES = {403, 429, 503}
_BLOCK_BODY_PATTERNS = re.compile(
    r"access denied|captcha|challenge|blocked|unusual traffic|sorry/index",
    re.IGNORECASE,
)


def _get_proxy_url() -> Optional[str]:
    url = os.environ.get("YOUTUBE_PROXY_URL", "").strip()
    return url or None


def _safe_proxy_label(proxy_url: str) -> str:
    return proxy_url.split("@")[-1] if "@" in proxy_url else proxy_url[:30]


_proxy_url = _get_proxy_url()
if _proxy_url:
    print(f"[webpage] Proxy configured: {_safe_proxy_label(_proxy_url)}")
else:
    print("[webpage] Proxy: NONE — proxy fallback disabled")


def _is_block_response(resp: requests.Response) -> bool:
    """Return True if the HTTP response looks like an anti-bot block."""
    if resp.status_code in _BLOCK_STATUS_CODES:
        return True
    if resp.status_code >= 400:
        snippet = resp.text[:2000] if resp.text else ""
        if _BLOCK_BODY_PATTERNS.search(snippet):
            return True
    return False


def _is_block_exception(exc: Exception) -> bool:
    """Return True if a network exception plausibly reflects IP blocking."""
    msg = str(exc).lower()
    return any(kw in msg for kw in ("403", "429", "503", "blocked", "captcha",
                                     "access denied", "max retries", "/sorry"))


def _fetch_url(url: str, proxies: Optional[dict] = None) -> requests.Response:
    return requests.get(
        url,
        headers=_REQUEST_HEADERS,
        timeout=_REQUEST_TIMEOUT,
        proxies=proxies,
    )


def _fetch_with_proxy_fallback(url: str) -> requests.Response:
    """Fetch URL directly first; retry through proxy if the response looks blocked."""
    print(f"[webpage] Direct fetch: {url}")
    try:
        resp = _fetch_url(url)
        if _is_block_response(resp):
            print(f"[webpage] Direct fetch blocked (HTTP {resp.status_code}), will retry with proxy")
        else:
            resp.raise_for_status()
            print(f"[webpage] Direct fetch succeeded (HTTP {resp.status_code})")
            return resp
    except requests.RequestException as exc:
        if not _is_block_exception(exc):
            print(f"[webpage] Direct fetch failed (non-block): {exc}")
            raise
        print(f"[webpage] Direct fetch failed (block-like): {exc}")

    proxy = _get_proxy_url()
    if not proxy:
        print("[webpage] No proxy configured — cannot retry")
        raise requests.RequestException("Page fetch was blocked and no proxy is available")

    print(f"[webpage] Proxy retry: {_safe_proxy_label(proxy)}")
    proxy_dict = {"https": proxy, "http": proxy}
    try:
        resp = _fetch_url(url, proxies=proxy_dict)
        resp.raise_for_status()
        print(f"[webpage] Proxy fetch succeeded (HTTP {resp.status_code})")
        return resp
    except requests.RequestException as exc:
        print(f"[webpage] Proxy fetch failed: {exc}")
        raise


def _is_wikipedia_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
        return bool(parsed.hostname and _WIKIPEDIA_HOSTS.match(parsed.hostname))
    except Exception:
        return False


def _title_from_url(url: str) -> Optional[str]:
    """Extract a readable article title from a Wikipedia URL path."""
    try:
        path = urlparse(url.strip()).path
        if "/wiki/" in path:
            slug = path.split("/wiki/", 1)[1].split("#")[0].split("?")[0]
            return unquote(slug).replace("_", " ").strip() or None
    except Exception:
        pass
    return None


def _extract_wikipedia_text(html: str) -> tuple[Optional[str], str]:
    """Extract title and clean article text from Wikipedia HTML.
    Returns (title, text).
    """
    soup = BeautifulSoup(html, "html.parser")

    title = None
    h1 = soup.find("h1", id="firstHeading") or soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)

    content = soup.find("div", id="mw-content-text")
    if not content:
        content = soup.find("div", class_="mw-parser-output")
    if not content:
        return title, ""

    for tag in content.find_all(["table", "sup", "style", "script", "nav",
                                  "figure", "img", "audio", "video"]):
        tag.decompose()
    for cls in ["navbox", "sidebar", "infobox", "metadata", "mw-editsection",
                "reference", "reflist", "refbegin", "toc", "catlinks",
                "authority-control", "noprint", "mw-empty-elt"]:
        for el in content.find_all(class_=cls):
            el.decompose()
    for el in content.find_all(id=["References", "External_links", "Further_reading",
                                    "See_also", "Notes"]):
        heading = el.find_parent(["h2", "h3"])
        if heading:
            for sibling in list(heading.find_next_siblings()):
                sibling.decompose()
            heading.decompose()

    paragraphs = []
    for p in content.find_all(["p", "h2", "h3", "h4", "li"]):
        text = p.get_text(separator=" ", strip=True)
        text = re.sub(r"\[\d+\]", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 20:
            paragraphs.append(text)

    return title, "\n\n".join(paragraphs)


class WebpageRequest(BaseModel):
    url: str = Field(..., min_length=5, description="URL of the page to extract")


class WebpageResponse(BaseModel):
    url: str
    title: Optional[str] = None
    text: str
    char_count: int
    source_type: str = "wikipedia"


@router.post("/extract", response_model=WebpageResponse)
async def extract_webpage(payload: WebpageRequest):
    url = payload.url.strip()

    if not _is_wikipedia_url(url):
        raise HTTPException(
            status_code=400,
            detail="Only Wikipedia URLs are supported for now. Please paste a Wikipedia article link.",
        )

    try:
        resp = _fetch_with_proxy_fallback(url)
    except requests.RequestException as exc:
        logger.warning("Wikipedia fetch failed for %s: %s", url, exc)
        raise HTTPException(
            status_code=502,
            detail="Could not fetch the Wikipedia page. Please check the URL and try again.",
        )

    title, text = _extract_wikipedia_text(resp.text)

    if not title:
        title = _title_from_url(url)

    if not text or len(text.strip()) < 100:
        raise HTTPException(
            status_code=422,
            detail="The page did not contain enough text to generate flashcards.",
        )

    if len(text) > MAX_ARTICLE_CHARS:
        text = text[:MAX_ARTICLE_CHARS]

    return WebpageResponse(
        url=url,
        title=title,
        text=text,
        char_count=len(text),
        source_type="wikipedia",
    )
