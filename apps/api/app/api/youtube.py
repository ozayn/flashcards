"""YouTube transcript endpoint — fetches captions for a video."""

import html
import logging
import os
import re
from typing import Any, Literal, Optional
from urllib.parse import parse_qs, urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from youtube_transcript_api import NoTranscriptFound, YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig

from app.core.auth import require_admin_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/youtube", tags=["youtube"])

# Same HTTPS endpoint the transcript library would use through the proxy (plain-text body = IPv4/IPv6).
_DEFAULT_IP_ECHO_URL = "https://api.ipify.org"
_IP_RE = re.compile(
    r"^(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)$",
)

# Filled by egress verification (startup) and read when logging transcript failures.
_proxy_egress_observed_ip: Optional[str] = None
_proxy_egress_check_outcome: Literal["not_run", "skipped", "no_proxy", "ok", "failed"] = "not_run"
_proxy_egress_check_message: str = ""

_YT_PATTERNS = [
    re.compile(r"(?:youtube\.com/watch\?.*v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})"),
]

MAX_TRANSCRIPT_CHARS = 60_000


def _env_truthy(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _proxy_host_for_logs(proxy_config: Any) -> str:
    """Non-secret label for logs (host or provider hint)."""
    if proxy_config is None:
        return "(none)"
    if isinstance(proxy_config, WebshareProxyConfig):
        return f"webshare:{getattr(proxy_config, 'domain_name', WebshareProxyConfig.DEFAULT_DOMAIN_NAME)}"
    if isinstance(proxy_config, GenericProxyConfig):
        url = proxy_config.https_url or proxy_config.http_url or ""
        return url.split("@")[-1] if "@" in url else (url[:48] + "…" if len(url) > 48 else url or "(generic)")
    return "(unknown proxy type)"


def _transcript_proxy_mode(proxy_config: Any) -> str:
    if proxy_config is None:
        return "none"
    if isinstance(proxy_config, WebshareProxyConfig):
        return "webshare"
    if isinstance(proxy_config, GenericProxyConfig):
        return "generic"
    return "unknown"


def _requests_proxies_from_ytt_config(proxy_config: Any) -> Optional[dict[str, str]]:
    """Same proxy dict youtube_transcript_api uses (via ProxyConfig.to_requests_dict)."""
    if proxy_config is None:
        return None
    to_dict = getattr(proxy_config, "to_requests_dict", None)
    if not callable(to_dict):
        return None
    try:
        d = to_dict()
        return {"http": d["http"], "https": d["https"]}
    except Exception:
        logger.exception("[youtube] proxy: could not build requests proxy dict from config")
        return None


def _build_proxy_config():
    """Build proxy config from environment variables, if set."""
    ws_user = os.environ.get("WEBSHARE_PROXY_USER", "").strip()
    ws_pass = os.environ.get("WEBSHARE_PROXY_PW", "").strip()
    if ws_user and ws_pass:
        cfg = WebshareProxyConfig(proxy_username=ws_user, proxy_password=ws_pass)
        host = _proxy_host_for_logs(cfg)
        logger.info("[youtube] proxy: configured (mode=webshare, host=%s)", host)
        print(f"[youtube] proxy: configured (mode=webshare, host={host})")
        return cfg

    proxy_url = os.environ.get("YOUTUBE_PROXY_URL", "").strip()
    if proxy_url:
        cfg = GenericProxyConfig(https_url=proxy_url)
        host = _proxy_host_for_logs(cfg)
        logger.info("[youtube] proxy: configured (mode=generic, host=%s)", host)
        print(f"[youtube] proxy: configured (mode=generic, host={host})")
        return cfg

    yt_nonempty = bool(os.environ.get("YOUTUBE_PROXY_URL", "").strip())
    ws_user_set = bool(os.environ.get("WEBSHARE_PROXY_USER", "").strip())
    ws_pass_set = bool(os.environ.get("WEBSHARE_PROXY_PW", "").strip())
    logger.info(
        "[youtube] proxy: not configured — transcript uses server egress "
        "(YOUTUBE_PROXY_URL non-empty=%s; WEBSHARE user/pass set=%s/%s; value not logged)",
        yt_nonempty,
        ws_user_set,
        ws_pass_set,
    )
    print("[youtube] proxy: not configured — transcript requests use server egress (no proxy)")
    return None


_proxy_config: Any = None


def reload_proxy_config_from_env() -> None:
    """Re-read proxy settings from the environment (call after .env load / at app startup)."""
    global _proxy_config, _proxy_egress_observed_ip, _proxy_egress_check_outcome, _proxy_egress_check_message
    _proxy_config = _build_proxy_config()
    _proxy_egress_observed_ip = None
    _proxy_egress_check_outcome = "not_run"
    _proxy_egress_check_message = ""


reload_proxy_config_from_env()


def run_proxy_egress_verification_at_startup() -> None:
    """
    One outbound HTTPS request through the same proxy dict as YouTubeTranscriptApi.
    Runs once at app startup when a proxy is configured (unless disabled via env).
    """
    global _proxy_egress_observed_ip, _proxy_egress_check_outcome, _proxy_egress_check_message

    if _proxy_config is None:
        _proxy_egress_check_outcome = "no_proxy"
        _proxy_egress_check_message = "no proxy configured"
        return

    verify = _env_truthy("YOUTUBE_PROXY_VERIFY_EGRESS", default=True)
    if not verify:
        _proxy_egress_check_outcome = "skipped"
        _proxy_egress_check_message = "YOUTUBE_PROXY_VERIFY_EGRESS disabled"
        logger.info(
            "[youtube] proxy: transcript path will use proxy (mode=%s) — egress verification skipped (YOUTUBE_PROXY_VERIFY_EGRESS=0)",
            _transcript_proxy_mode(_proxy_config),
        )
        print(
            f"[youtube] proxy: transcript path will use proxy (mode={_transcript_proxy_mode(_proxy_config)}) "
            "— egress verification skipped (YOUTUBE_PROXY_VERIFY_EGRESS=0)"
        )
        return

    proxies = _requests_proxies_from_ytt_config(_proxy_config)
    if not proxies:
        _proxy_egress_check_outcome = "failed"
        _proxy_egress_check_message = "could not derive requests proxy dict from config"
        logger.error(
            "[youtube] proxy: configured but egress check aborted — %s",
            _proxy_egress_check_message,
        )
        print(f"[youtube] proxy: configured but egress check aborted — {_proxy_egress_check_message}")
        return

    echo_url = os.environ.get("YOUTUBE_PROXY_IP_ECHO_URL", _DEFAULT_IP_ECHO_URL).strip() or _DEFAULT_IP_ECHO_URL
    mode = _transcript_proxy_mode(_proxy_config)
    host = _proxy_host_for_logs(_proxy_config)
    logger.info(
        "[youtube] proxy: verifying egress via same proxy as transcripts (mode=%s, host=%s, echo=%s)",
        mode,
        host,
        echo_url,
    )
    print(
        f"[youtube] proxy: verifying egress via same proxy as transcripts "
        f"(mode={mode}, host={host}, echo={echo_url})"
    )

    try:
        resp = requests.get(
            echo_url,
            proxies=proxies,
            timeout=float(os.environ.get("YOUTUBE_PROXY_EGRESS_TIMEOUT", "15")),
            headers={"User-Agent": "MemoNext-YouTube-proxy-verify/1.0"},
        )
        body = (resp.text or "").strip()
        if resp.status_code != 200:
            _proxy_egress_check_outcome = "failed"
            _proxy_egress_check_message = f"HTTP {resp.status_code}"
            logger.error(
                "[youtube] proxy: egress verification failed — HTTP %s (body prefix=%r)",
                resp.status_code,
                body[:80],
            )
            print(f"[youtube] proxy: egress verification failed — HTTP {resp.status_code}")
            return
        first_line = body.splitlines()[0].strip() if body else ""
        if not _IP_RE.match(first_line):
            _proxy_egress_check_outcome = "failed"
            _proxy_egress_check_message = "response was not a plain IP"
            logger.error(
                "[youtube] proxy: egress verification failed — body is not a plain IP (prefix=%r)",
                body[:80],
            )
            print("[youtube] proxy: egress verification failed — body is not a plain IP")
            return
        _proxy_egress_observed_ip = first_line
        _proxy_egress_check_outcome = "ok"
        _proxy_egress_check_message = "ok"
        logger.info(
            "[youtube] proxy: egress verification OK — observed outbound IP %s (same requests proxy dict as transcripts)",
            _proxy_egress_observed_ip,
        )
        print(
            f"[youtube] proxy: egress verification OK — observed outbound IP {_proxy_egress_observed_ip} "
            "(same requests proxy dict as transcripts)"
        )
    except requests.RequestException as exc:
        _proxy_egress_check_outcome = "failed"
        _proxy_egress_check_message = str(exc)
        logger.error("[youtube] proxy: egress verification failed — %s", exc)
        print(f"[youtube] proxy: egress verification failed — {exc}")


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


_WATCH_LENGTH_SECONDS_RE = re.compile(r'"lengthSeconds"\s*:\s*"?(\d+)"?')


def fetch_video_watch_meta(video_id: str) -> tuple[Optional[str], Optional[int]]:
    """
    One watch-page GET: parse HTML title and embedded lengthSeconds (no API key).
    Returns (title, duration_seconds); either may be None if parsing fails.
    """
    try:
        resp = requests.get(
            f"https://www.youtube.com/watch?v={video_id}",
            headers={"Accept-Language": "en-US,en;q=0.9"},
            timeout=10,
        )
        if resp.status_code != 200:
            return None, None
        page = resp.text
        title = None
        m = re.search(r"<title>(.+?)(?:\s*-\s*YouTube)?\s*</title>", page)
        if m:
            title = html.unescape(m.group(1)).strip()
        duration: Optional[int] = None
        lm = _WATCH_LENGTH_SECONDS_RE.search(page)
        if lm:
            try:
                duration = int(lm.group(1))
                if duration < 0 or duration > 86400 * 30:
                    duration = None
            except ValueError:
                duration = None
        return title, duration
    except Exception:
        logger.debug("Could not fetch watch page meta for %s", video_id)
        return None, None


class TranscriptRequest(BaseModel):
    url: str = Field(..., min_length=5, description="YouTube video URL")


class TranscriptSegment(BaseModel):
    text: str
    start: float


class TranscriptResponse(BaseModel):
    video_id: str
    title: Optional[str] = None
    transcript: str
    segments: list[TranscriptSegment] = []
    language: Optional[str] = None
    duration_seconds: Optional[int] = None
    char_count: int


class ProxyEgressStatusResponse(BaseModel):
    """Admin-only: proxy flags and last egress verification (no secrets)."""

    proxy_configured: bool
    transcript_proxy_mode: str
    proxy_host_safe: str
    egress_check_outcome: str
    egress_check_message: str
    egress_observed_ip: Optional[str] = None


@router.get("/proxy-egress-status", response_model=ProxyEgressStatusResponse, dependencies=[Depends(require_admin_key)])
async def proxy_egress_status():
    """Debug: whether YouTube transcript proxy is configured and egress verification result."""
    return ProxyEgressStatusResponse(
        proxy_configured=_proxy_config is not None,
        transcript_proxy_mode=_transcript_proxy_mode(_proxy_config),
        proxy_host_safe=_proxy_host_for_logs(_proxy_config),
        egress_check_outcome=_proxy_egress_check_outcome,
        egress_check_message=_proxy_egress_check_message,
        egress_observed_ip=_proxy_egress_observed_ip,
    )


def _is_ip_block_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(kw in msg for kw in (
        "ip", "block", "cloud provider", "too many requests",
        "429", "/sorry", "max retries exceeded", "responseerror",
    ))


def _enumerate_available_transcripts(tlist) -> list[tuple[str, str, bool]]:
    """(language_code, language_name, is_generated) in API order (manual transcripts before generated)."""
    out: list[tuple[str, str, bool]] = []
    seen: set[str] = set()
    for tr in tlist:
        code = tr.language_code
        if code not in seen:
            seen.add(code)
            out.append((code, tr.language, tr.is_generated))
    return out


def _normalize_lang_key(code: str) -> str:
    return code.strip().lower().replace("_", "-")


def _transcript_language_fetch_order(available: list[tuple[str, str, bool]]) -> list[str]:
    """
    Priority for youtube_transcript_api find_transcript():
    1) YOUTUBE_TRANSCRIPT_LANGUAGES (comma-separated, leftmost highest)
    2) Common English codes if present
    3) Any remaining languages YouTube returned (e.g. fa auto-generated only)
    """
    codes = [t[0] for t in available]
    result: list[str] = []
    used: set[str] = set()

    def try_add_preference(pref: str) -> None:
        p = _normalize_lang_key(pref)
        for c in codes:
            cnorm = _normalize_lang_key(c)
            if cnorm == p or cnorm.startswith(p + "-") or p.startswith(cnorm + "-"):
                if c not in used:
                    used.add(c)
                    result.append(c)
                return

    env_raw = os.environ.get("YOUTUBE_TRANSCRIPT_LANGUAGES", "").strip()
    if env_raw:
        for part in env_raw.split(","):
            if part.strip():
                try_add_preference(part.strip())
    for en in ("en", "en-US", "en-GB"):
        try_add_preference(en)
    for c in codes:
        if c not in used:
            used.add(c)
            result.append(c)
    return result


@router.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(payload: TranscriptRequest):
    video_id = extract_video_id(payload.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL. Please paste a valid video link.")

    title, duration_seconds = fetch_video_watch_meta(video_id)
    print(
        f"[youtube] Watch meta for {video_id}: title={'ok → ' + repr(title) if title else 'failed'}, "
        f"duration_seconds={duration_seconds if duration_seconds is not None else 'unknown'}"
    )

    path = "proxy" if _proxy_config else "direct"
    mode = _transcript_proxy_mode(_proxy_config)
    egress_suffix = ""
    if _proxy_config:
        if _proxy_egress_check_outcome == "ok" and _proxy_egress_observed_ip:
            egress_suffix = f", confirmed_egress_ip={_proxy_egress_observed_ip}"
        elif _proxy_egress_check_outcome == "failed":
            egress_suffix = ", confirmed_egress_ip=none_verification_failed"
        elif _proxy_egress_check_outcome == "skipped":
            egress_suffix = ", egress_check=skipped"
        elif _proxy_egress_check_outcome == "not_run":
            egress_suffix = ", egress_check=not_run"
    logger.info(
        "[youtube] transcript: starting fetch video_id=%s (path=%s, mode=%s%s)",
        video_id,
        path,
        mode,
        egress_suffix,
    )
    print(
        f"[youtube] transcript: starting fetch (path={path}, mode={mode}{egress_suffix})"
    )
    try:
        ytt_api = YouTubeTranscriptApi(proxy_config=_proxy_config)
        tlist = ytt_api.list(video_id)
        available = _enumerate_available_transcripts(tlist)
        lang_order = _transcript_language_fetch_order(available)
        avail_summary = [(a[0], a[1], a[2]) for a in available]
        logger.info(
            "[youtube] transcript: available languages (code, name, generated)=%s; fetch_order=%s",
            avail_summary,
            lang_order,
        )
        print(
            f"[youtube] transcript: available={[a[0] for a in available]} "
            f"fetch_order={lang_order}"
        )
        picked = tlist.find_transcript(lang_order)
        transcript_list = picked.fetch(preserve_formatting=False)
        logger.info(
            "[youtube] transcript: fetch ok video_id=%s (path=%s, language_code=%s)",
            video_id,
            path,
            getattr(picked, "language_code", None),
        )
        print(
            f"[youtube] Transcript fetch for {video_id}: ok "
            f"(path={path}, language={getattr(picked, 'language_code', '?')})"
        )
    except HTTPException:
        raise
    except NoTranscriptFound as exc:
        print(f"[youtube] Transcript fetch for {video_id}: FAILED — {exc}")
        logger.warning("Transcript fetch for %s: no matching language — %s", video_id, exc)
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No transcript available in a supported language for this video.",
                "title": title,
            },
        )
    except Exception as exc:
        print(f"[youtube] Transcript fetch for {video_id}: FAILED — {exc}")
        logger.warning("Transcript fetch for %s: failed — %s", video_id, exc)
        if _proxy_config and _is_ip_block_error(exc):
            if _proxy_egress_check_outcome == "ok" and _proxy_egress_observed_ip:
                logger.warning(
                    "[youtube] transcript: YouTube blocked or IP-related error while proxy was configured — "
                    "egress verification previously observed IP %s via the same proxy dict as transcripts "
                    "(transcript fetch still failed; may be YouTube-side block for that IP)",
                    _proxy_egress_observed_ip,
                )
                print(
                    f"[youtube] transcript: YouTube block/error with proxy — "
                    f"egress was verified as {_proxy_egress_observed_ip} but transcript still failed"
                )
            else:
                logger.warning(
                    "[youtube] transcript: YouTube block/error with proxy configured — "
                    "egress verification did not succeed (outcome=%s); proxy may not be applied to outbound traffic",
                    _proxy_egress_check_outcome,
                )
                print(
                    f"[youtube] transcript: YouTube block/error with proxy — "
                    f"egress verification outcome={_proxy_egress_check_outcome} (proxy application uncertain)"
                )
        if _is_ip_block_error(exc):
            raise HTTPException(
                status_code=503,
                detail={
                    "message": "We couldn\u2019t fetch the transcript from YouTube right now.",
                    "title": title,
                },
            )
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No transcript available for this video. It may not have captions enabled.",
                "title": title,
            },
        )

    segments: list[TranscriptSegment] = []
    try:
        parts = []
        for snippet in transcript_list.snippets:
            parts.append(snippet.text)
            segments.append(TranscriptSegment(text=snippet.text, start=snippet.start))
        text = " ".join(parts)
    except Exception:
        parts = [str(entry) for entry in transcript_list]
        text = " ".join(parts)
        segments = []

    lang = None
    try:
        lang = transcript_list.language
    except Exception:
        pass

    if len(text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Transcript is too short to generate useful flashcards.")

    if len(text) > MAX_TRANSCRIPT_CHARS:
        text = text[:MAX_TRANSCRIPT_CHARS]

    return TranscriptResponse(
        video_id=video_id,
        title=title,
        transcript=text,
        segments=segments,
        language=lang,
        duration_seconds=duration_seconds,
        char_count=len(text),
    )
