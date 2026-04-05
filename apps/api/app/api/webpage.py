"""Webpage content extraction — fetches and extracts text from URLs (Wikipedia for v1)."""

import ipaddress
import logging
import os
import re
import socket
from typing import Optional
from urllib.parse import unquote, urlparse

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.proxy_env import parse_generic_proxy_url_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webpage", tags=["webpage"])

MAX_ARTICLE_CHARS = 60_000
MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_SCHEMES = {"http", "https"}
_WIKIPEDIA_HOSTS = re.compile(r"^([a-z]{2,3}\.)?wikipedia\.org$", re.IGNORECASE)
_REQUEST_TIMEOUT = 15
_MAX_REDIRECTS = 5
_REQUEST_HEADERS = {
    "User-Agent": "MemoNext/1.0 (flashcard generator; educational use)",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html",
}

_BLOCK_STATUS_CODES = {403, 429, 503}
_BLOCK_BODY_PATTERNS = re.compile(
    r"access denied|captcha|challenge|blocked|unusual traffic|sorry/index",
    re.IGNORECASE,
)

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


# ---------------------------------------------------------------------------
# URL validation
# ---------------------------------------------------------------------------

class _UrlValidationError(Exception):
    """Raised when a URL fails safety checks."""


def _validate_url(url: str) -> None:
    """Raise _UrlValidationError if the URL is unsafe or unsupported."""
    parsed = urlparse(url)

    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise _UrlValidationError(f"Scheme not allowed: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise _UrlValidationError("No hostname in URL")

    if not _WIKIPEDIA_HOSTS.match(hostname):
        raise _UrlValidationError(f"Domain not allowed: {hostname}")

    # Reject raw IP addresses as hostnames
    try:
        ipaddress.ip_address(hostname)
        raise _UrlValidationError(f"Raw IP address not allowed: {hostname}")
    except ValueError:
        pass  # not an IP literal — good

    _check_dns(hostname)


def _check_dns(hostname: str) -> None:
    """Resolve hostname and reject if any address is private/internal."""
    try:
        results = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        return  # DNS failure is not an SSRF concern; let the HTTP request fail naturally

    for family, _type, _proto, _canonname, sockaddr in results:
        ip_str = sockaddr[0]
        try:
            addr = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for net in _PRIVATE_NETWORKS:
            if addr in net:
                raise _UrlValidationError(f"Hostname resolves to private/internal address: {ip_str}")


def _validate_redirect_chain(resp: requests.Response) -> None:
    """Check every URL in the redirect history plus the final URL."""
    urls_to_check = [r.url for r in resp.history] + [resp.url]
    for hop_url in urls_to_check:
        parsed = urlparse(hop_url)
        hostname = parsed.hostname
        if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
            raise _UrlValidationError(f"Redirect to disallowed scheme: {parsed.scheme}")
        if not hostname or not _WIKIPEDIA_HOSTS.match(hostname):
            raise _UrlValidationError(f"Redirect to disallowed domain: {hostname}")
        # Also check resolved IPs of redirect targets
        _check_dns(hostname)


def _validate_response(resp: requests.Response) -> None:
    """Reject responses with disallowed content type or excessive size."""
    content_type = resp.headers.get("content-type", "")
    if "text/html" not in content_type.lower() and "text/plain" not in content_type.lower():
        raise _UrlValidationError(f"Unexpected content type: {content_type}")

    content_length = resp.headers.get("content-length")
    if content_length and int(content_length) > MAX_RESPONSE_BYTES:
        raise _UrlValidationError(f"Response too large: {content_length} bytes")

    if len(resp.content) > MAX_RESPONSE_BYTES:
        raise _UrlValidationError(f"Response body too large: {len(resp.content)} bytes")


# ---------------------------------------------------------------------------
# Proxy + fetch logic
# ---------------------------------------------------------------------------

def _get_proxy_urls() -> list[str]:
    return parse_generic_proxy_url_list()


def _safe_proxy_label(proxy_url: str) -> str:
    return proxy_url.split("@")[-1] if "@" in proxy_url else proxy_url[:30]


def log_webpage_proxy_status() -> None:
    """Log generic proxy URL list for webpage fallback (YOUTUBE_PROXY_URL + YOUTUBE_PROXY_URLS)."""
    urls = _get_proxy_urls()
    if urls:
        labels = [_safe_proxy_label(u) for u in urls]
        logger.info(
            "[webpage] proxy: %d URL(s) for fallback fetch (order=%s)",
            len(urls),
            labels,
        )
        print(f"[webpage] Proxy: {len(urls)} URL(s) for fallback — try in order")
    else:
        logger.info("[webpage] proxy: not configured — webpage proxy fallback disabled")
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
    """Return True if a network exception plausibly reflects IP blocking or proxy failure."""
    msg = str(exc).lower()
    return any(
        kw in msg
        for kw in (
            "403",
            "429",
            "503",
            "502",
            "504",
            "blocked",
            "captcha",
            "access denied",
            "max retries",
            "/sorry",
            "proxy",
            "connection refused",
            "connection reset",
            "tunnel connection failed",
            "connect timeout",
            "timed out",
        )
    )


def _proxy_failure_allows_next(resp: Optional[requests.Response], exc: Optional[Exception]) -> bool:
    """True when trying the next proxy might help (block / rate limit / proxy transport)."""
    if resp is not None and _is_block_response(resp):
        return True
    if exc is not None and _is_block_exception(exc):
        return True
    return False


def _fetch_url(url: str, proxies: Optional[dict] = None) -> requests.Response:
    session = requests.Session()
    session.max_redirects = _MAX_REDIRECTS
    resp = session.get(
        url,
        headers=_REQUEST_HEADERS,
        timeout=_REQUEST_TIMEOUT,
        proxies=proxies or {},
        stream=True,
    )
    body = resp.content[:MAX_RESPONSE_BYTES + 1]
    if len(body) > MAX_RESPONSE_BYTES:
        raise _UrlValidationError(f"Response body too large (>{MAX_RESPONSE_BYTES} bytes)")
    resp._content = body  # type: ignore[attr-defined]
    return resp


def _fetch_with_proxy_fallback(url: str) -> requests.Response:
    """Fetch URL directly first; retry through each configured proxy in order on block-like failure."""
    print(f"[webpage] Direct fetch: {url}")
    direct_resp: Optional[requests.Response] = None
    direct_exc: Optional[Exception] = None
    try:
        direct_resp = _fetch_url(url)
        _validate_redirect_chain(direct_resp)
        _validate_response(direct_resp)
        if _is_block_response(direct_resp):
            print(f"[webpage] Direct fetch blocked (HTTP {direct_resp.status_code}), will try proxy list")
        else:
            direct_resp.raise_for_status()
            print(f"[webpage] Direct fetch succeeded (HTTP {direct_resp.status_code})")
            return direct_resp
    except _UrlValidationError:
        raise
    except requests.RequestException as exc:
        direct_exc = exc
        if not _is_block_exception(exc):
            print(f"[webpage] Direct fetch failed (non-block): {exc}")
            raise
        print(f"[webpage] Direct fetch failed (block-like): {exc}")

    if not _proxy_failure_allows_next(direct_resp, direct_exc):
        if direct_resp is not None:
            direct_resp.raise_for_status()
        assert direct_exc is not None
        raise direct_exc

    proxy_urls = _get_proxy_urls()
    if not proxy_urls:
        print("[webpage] No proxy configured — cannot retry")
        raise requests.RequestException("Page fetch was blocked and no proxy is available")

    n = len(proxy_urls)
    for i, proxy in enumerate(proxy_urls):
        label = _safe_proxy_label(proxy)
        logger.info("[webpage] proxy try %d/%d (host=%s)", i + 1, n, label)
        print(f"[webpage] Proxy try {i + 1}/{n}: {label}")
        proxy_dict = {"https": proxy, "http": proxy}
        try:
            resp = _fetch_url(url, proxies=proxy_dict)
            _validate_redirect_chain(resp)
            _validate_response(resp)
            if _is_block_response(resp):
                print(f"[webpage] Proxy {i + 1}/{n} returned block-like response (HTTP {resp.status_code})")
                if i < n - 1:
                    continue
                resp.raise_for_status()
            resp.raise_for_status()
            logger.info("[webpage] fetch succeeded via proxy index %d/%d (host=%s)", i + 1, n, label)
            print(f"[webpage] Proxy fetch succeeded ({i + 1}/{n}, HTTP {resp.status_code})")
            return resp
        except _UrlValidationError:
            raise
        except requests.RequestException as exc:
            print(f"[webpage] Proxy {i + 1}/{n} failed: {exc}")
            if i < n - 1 and _is_block_exception(exc):
                continue
            if i == n - 1:
                logger.error("[webpage] all %d proxy URL(s) failed", n)
                print(f"[webpage] All {n} proxies failed")
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

    try:
        _validate_url(url)
    except _UrlValidationError as exc:
        logger.warning("[webpage] URL rejected: %s — %s", url, exc)
        raise HTTPException(
            status_code=400,
            detail="Only Wikipedia URLs are supported for now. Please paste a Wikipedia article link.",
        )

    try:
        resp = _fetch_with_proxy_fallback(url)
    except _UrlValidationError as exc:
        logger.warning("[webpage] Safety check failed during fetch for %s: %s", url, exc)
        raise HTTPException(
            status_code=400,
            detail="The URL did not pass safety checks. Please use a standard Wikipedia article link.",
        )
    except requests.RequestException as exc:
        logger.warning("[webpage] Fetch failed for %s: %s", url, exc)
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
