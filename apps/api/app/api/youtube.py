"""YouTube transcript endpoint — fetches captions for a video."""

import html
import json
import logging
import os
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Literal, Optional
from urllib.parse import parse_qs, urlparse

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from youtube_transcript_api import (
    AgeRestricted,
    CookieError,
    CookieInvalid,
    CookiePathInvalid,
    CouldNotRetrieveTranscript,
    FailedToCreateConsentCookie,
    InvalidVideoId,
    IpBlocked,
    NoTranscriptFound,
    NotTranslatable,
    PoTokenRequired,
    RequestBlocked,
    TranslationLanguageNotAvailable,
    TranscriptsDisabled,
    VideoUnavailable,
    VideoUnplayable,
    YouTubeDataUnparsable,
    YouTubeRequestFailed,
    YouTubeTranscriptApi,
)
from youtube_transcript_api.proxies import GenericProxyConfig, WebshareProxyConfig

from app.core.auth import require_admin_key
from app.core.proxy_env import parse_generic_proxy_url_list

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


def _youtube_proxy_verify_egress_default_enabled() -> bool:
    """Production: verify by default when proxies exist. Dev: opt-in via YOUTUBE_PROXY_VERIFY_EGRESS=1."""
    return os.environ.get("ENVIRONMENT", "development").lower() == "production"


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


def _transcript_proxy_mode_list(configs: list[Any]) -> str:
    if not configs:
        return "none"
    if isinstance(configs[0], WebshareProxyConfig):
        return "webshare"
    if len(configs) == 1:
        return "generic"
    return f"multi_generic({len(configs)})"


def _proxy_hosts_summary(configs: list[Any]) -> str:
    if not configs:
        return "(none)"
    parts = [f"[{i}]{_proxy_host_for_logs(c)}" for i, c in enumerate(configs)]
    return "; ".join(parts)[:400]


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


def _build_proxy_configs() -> list[Any]:
    """Ordered proxy configs: Webshare (single) wins; else one GenericProxyConfig per URL."""
    ws_user = os.environ.get("WEBSHARE_PROXY_USER", "").strip()
    ws_pass = os.environ.get("WEBSHARE_PROXY_PW", "").strip()
    if ws_user and ws_pass:
        cfg = WebshareProxyConfig(proxy_username=ws_user, proxy_password=ws_pass)
        host = _proxy_host_for_logs(cfg)
        logger.info("[youtube] proxy: 1 config (webshare, host=%s)", host)
        print(f"[youtube] proxy: 1 config (webshare, host={host})")
        return [cfg]

    urls = parse_generic_proxy_url_list()
    if urls:
        cfgs = [GenericProxyConfig(https_url=u) for u in urls]
        labels = [_proxy_host_for_logs(c) for c in cfgs]
        logger.info(
            "[youtube] proxy: %d generic URL(s) configured (order=%s)",
            len(cfgs),
            labels,
        )
        print(f"[youtube] proxy: {len(cfgs)} generic proxy URL(s) configured (try in order)")
        return cfgs

    yt_nonempty = bool(os.environ.get("YOUTUBE_PROXY_URL", "").strip())
    yts_nonempty = bool(os.environ.get("YOUTUBE_PROXY_URLS", "").strip())
    ws_user_set = bool(os.environ.get("WEBSHARE_PROXY_USER", "").strip())
    ws_pass_set = bool(os.environ.get("WEBSHARE_PROXY_PW", "").strip())
    logger.info(
        "[youtube] proxy: not configured — transcript uses server egress "
        "(YOUTUBE_PROXY_URL non-empty=%s; YOUTUBE_PROXY_URLS non-empty=%s; WEBSHARE user/pass set=%s/%s)",
        yt_nonempty,
        yts_nonempty,
        ws_user_set,
        ws_pass_set,
    )
    print("[youtube] proxy: not configured — transcript requests use server egress (no proxy)")
    return []


_proxy_configs: list[Any] = []


def reload_proxy_config_from_env() -> None:
    """Re-read proxy settings from the environment (call after .env load / at app startup)."""
    global _proxy_configs, _proxy_egress_observed_ip, _proxy_egress_check_outcome, _proxy_egress_check_message
    _proxy_configs = _build_proxy_configs()
    _proxy_egress_observed_ip = None
    _proxy_egress_check_outcome = "not_run"
    _proxy_egress_check_message = ""


reload_proxy_config_from_env()


def _verify_single_proxy_egress(
    i: int,
    cfg: Any,
    n: int,
    echo_url: str,
    timeout: float,
) -> tuple[int, bool, Optional[str], str]:
    """One proxy egress check; safe to run in a thread pool."""
    host = _proxy_host_for_logs(cfg)
    proxies = _requests_proxies_from_ytt_config(cfg)
    if not proxies:
        logger.error("[youtube] proxy[%d/%d]: could not build requests proxy dict (host=%s)", i + 1, n, host)
        return i, False, None, f"[{i}]no_dict"
    logger.info("[youtube] proxy[%d/%d]: egress check starting (host=%s)", i + 1, n, host)
    try:
        resp = requests.get(
            echo_url,
            proxies=proxies,
            timeout=timeout,
            headers={"User-Agent": "MemoNext-YouTube-proxy-verify/1.0"},
        )
        body = (resp.text or "").strip()
        if resp.status_code != 200:
            logger.error(
                "[youtube] proxy[%d/%d]: egress failed — HTTP %s (host=%s)",
                i + 1,
                n,
                resp.status_code,
                host,
            )
            return i, False, None, f"[{i}]http{resp.status_code}"
        first_line = body.splitlines()[0].strip() if body else ""
        if not _IP_RE.match(first_line):
            logger.error(
                "[youtube] proxy[%d/%d]: egress failed — not plain IP (host=%s)",
                i + 1,
                n,
                host,
            )
            return i, False, None, f"[{i}]bad_body"
        logger.info(
            "[youtube] proxy[%d/%d]: egress OK — observed IP %s (host=%s)",
            i + 1,
            n,
            first_line,
            host,
        )
        print(f"[youtube] proxy[{i + 1}/{n}]: egress OK — IP {first_line} (host={host})")
        return i, True, first_line, f"[{i}]ok"
    except requests.RequestException as exc:
        logger.error("[youtube] proxy[%d/%d]: egress failed — %s (host=%s)", i + 1, n, exc, host)
        err_s = str(exc).lower()
        if "407" in str(exc) or "proxy authentication required" in err_s:
            logger.warning(
                "[youtube] proxy[%d/%d]: HTTP 407 from proxy — credentials missing, wrong, or not in the URL "
                "(expected http(s)://USER:PASS@host:port for this YOUTUBE_PROXY_URL / YOUTUBE_PROXY_URLS slot; host=%s)",
                i + 1,
                n,
                host,
            )
        return i, False, None, f"[{i}]{type(exc).__name__}"
    except Exception as exc:
        logger.exception("[youtube] proxy[%d/%d]: egress check crashed (host=%s)", i + 1, n, host)
        return i, False, None, f"[{i}]{type(exc).__name__}"


def run_proxy_egress_verification(*, force: bool = False) -> None:
    """
    For each configured proxy, one outbound HTTPS request through the same proxy dict
    as YouTubeTranscriptApi. Checks run in parallel (bounded pool). Overall ok if any succeeds.

    When ``force`` is False, respects YOUTUBE_PROXY_VERIFY_EGRESS (default on in production only;
    default off in development — set YOUTUBE_PROXY_VERIFY_EGRESS=1 to enable).
    """
    global _proxy_egress_observed_ip, _proxy_egress_check_outcome, _proxy_egress_check_message

    if not _proxy_configs:
        _proxy_egress_check_outcome = "no_proxy"
        _proxy_egress_check_message = "no proxy configured"
        return

    if not force:
        verify = _env_truthy(
            "YOUTUBE_PROXY_VERIFY_EGRESS",
            default=_youtube_proxy_verify_egress_default_enabled(),
        )
        if not verify:
            _proxy_egress_check_outcome = "skipped"
            explicit = (os.environ.get("YOUTUBE_PROXY_VERIFY_EGRESS") or "").strip().lower()
            if explicit in ("0", "false", "no", "off"):
                _proxy_egress_check_message = "YOUTUBE_PROXY_VERIFY_EGRESS disabled"
            else:
                _proxy_egress_check_message = (
                    "egress verification skipped (non-production defaults off; "
                    "set YOUTUBE_PROXY_VERIFY_EGRESS=1 for startup checks, or POST /youtube/proxy-verify-egress)"
                )
            mode = _transcript_proxy_mode_list(_proxy_configs)
            logger.info(
                "[youtube] proxy: %d config(s) (mode=%s) — egress verification skipped (%s)",
                len(_proxy_configs),
                mode,
                _proxy_egress_check_message,
            )
            print(
                f"[youtube] proxy: {len(_proxy_configs)} config(s) (mode={mode}) "
                f"— egress verification skipped — {_proxy_egress_check_message}"
            )
            return

    echo_url = os.environ.get("YOUTUBE_PROXY_IP_ECHO_URL", _DEFAULT_IP_ECHO_URL).strip() or _DEFAULT_IP_ECHO_URL
    timeout = float(os.environ.get("YOUTUBE_PROXY_EGRESS_TIMEOUT", "5"))
    max_workers = max(1, int(os.environ.get("YOUTUBE_PROXY_EGRESS_MAX_WORKERS", "8")))
    mode = _transcript_proxy_mode_list(_proxy_configs)
    n = len(_proxy_configs)
    workers = min(n, max_workers)
    logger.info(
        "[youtube] proxy: verifying egress for %d config(s) (mode=%s, echo=%s, timeout=%ss, workers=%d)",
        n,
        mode,
        echo_url,
        timeout,
        workers,
    )
    print(
        f"[youtube] proxy: verifying egress for {n} proxy config(s) "
        f"(mode={mode}, echo={echo_url}, timeout={timeout}s, parallel workers={workers})"
    )

    per_results: list[str] = [""] * n
    any_ok = False
    first_ip: Optional[str] = None

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [
            executor.submit(_verify_single_proxy_egress, i, cfg, n, echo_url, timeout)
            for i, cfg in enumerate(_proxy_configs)
        ]
        for fut in as_completed(futures):
            i, ok, observed, tag = fut.result()
            per_results[i] = tag
            if ok:
                any_ok = True
                if first_ip is None and observed:
                    first_ip = observed

    _proxy_egress_observed_ip = first_ip if any_ok else None
    summary = "; ".join(per_results)
    if any_ok:
        _proxy_egress_check_outcome = "ok"
        _proxy_egress_check_message = summary
        logger.info("[youtube] proxy: egress summary (at least one OK) — %s", summary)
    else:
        _proxy_egress_check_outcome = "failed"
        _proxy_egress_check_message = summary or "all failed"
        logger.error("[youtube] proxy: egress verification — all %d proxy config(s) failed — %s", n, summary)
        print(f"[youtube] proxy: egress verification — all {n} proxy config(s) failed")


def schedule_proxy_egress_verification_after_startup() -> None:
    """
    Apply fast proxy state (no_proxy / skipped) on the startup thread; when verification is
    enabled, run the network checks in a daemon thread so ASGI startup is not blocked.
    """
    if not _proxy_configs:
        run_proxy_egress_verification(force=False)
        return

    verify = _env_truthy(
        "YOUTUBE_PROXY_VERIFY_EGRESS",
        default=_youtube_proxy_verify_egress_default_enabled(),
    )
    if not verify:
        run_proxy_egress_verification(force=False)
        return

    def _run() -> None:
        try:
            run_proxy_egress_verification(force=False)
        except Exception:
            logger.exception("[youtube] proxy: background egress verification crashed")

    logger.info("[youtube] proxy: egress verification running in background (startup not blocked)")
    print("[youtube] proxy: egress verification running in background…")
    threading.Thread(target=_run, name="youtube-proxy-egress-verify", daemon=True).start()


def run_proxy_egress_verification_at_startup() -> None:
    """Backward-compatible name; prefer schedule_proxy_egress_verification_after_startup from app startup."""
    run_proxy_egress_verification(force=False)


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
# Embedded player config (more reliable than <title> when consent/bot pages appear).
_VD_TITLE_RE = re.compile(r'"title"\s*:\s*"((?:[^"\\]|\\.)*)"')
# Sidebar / renderer snippets often use "title":"130K" (views); reject as video title.
_COMPACT_METRIC_TITLE_RE = re.compile(
    r"^[\d.,]+\s*([KkMmBb]|million|billion|mln|bln|%|views?|subscribers?)?$"
)


def _looks_like_metric_snippet_title(title: str) -> bool:
    """True if string looks like a view/subscriber count, not a real video title."""
    s = title.strip()
    if len(s) > 24:
        return False
    if _COMPACT_METRIC_TITLE_RE.match(s):
        return True
    if len(s) <= 6 and s.replace(".", "").replace(",", "").isdigit():
        return True
    return False


def _is_placeholder_watch_title(title: Optional[str]) -> bool:
    """Consent / interstitial pages often set a generic <title>; reject those."""
    if not title:
        return True
    t = title.strip().lower()
    if not t or t == "youtube":
        return True
    if "before you continue" in t:
        return True
    if "just a moment" in t or "attention required" in t:
        return True
    if "sign in to" in t and len(t) < 50:
        return True
    return False


def _is_usable_watch_title(title: Optional[str]) -> bool:
    """Title is non-empty, not a consent placeholder, and not a numeric/metric UI snippet."""
    if not title or not str(title).strip():
        return False
    if _is_placeholder_watch_title(title):
        return False
    if _looks_like_metric_snippet_title(title):
        return False
    return True


def _decode_json_string_fragment(inner: str) -> str:
    """Decode a JSON string literal body (escape sequences) to Unicode text."""
    try:
        return str(json.loads(f'"{inner}"'))
    except json.JSONDecodeError:
        return inner


def _parse_watch_page_html(page: str, video_id: str) -> tuple[Optional[str], Optional[int]]:
    """Extract title and lengthSeconds from watch HTML (player JSON, then fallbacks)."""
    title: Optional[str] = None
    duration: Optional[int] = None

    # Anchor on this video's videoId — the first "videoDetails" block can contain other "title" keys
    # (e.g. view counts like "130K") that are not the watch video title.
    vid_markers = (f'"videoId":"{video_id}"', f'"videoId": "{video_id}"')
    vidx = -1
    for needle in vid_markers:
        vidx = page.find(needle)
        if vidx != -1:
            break
    if vidx != -1:
        local = page[vidx : vidx + 14000]
        tm = _VD_TITLE_RE.search(local)
        if tm:
            cand = _decode_json_string_fragment(tm.group(1)).strip()
            if _is_usable_watch_title(cand):
                title = cand
        lm = _WATCH_LENGTH_SECONDS_RE.search(local)
        if lm:
            try:
                d = int(lm.group(1))
                if 0 <= d <= 86400 * 30:
                    duration = d
            except ValueError:
                pass

    if title is None or not _is_usable_watch_title(title):
        vd_idx = page.find('"videoDetails"')
        if vd_idx != -1:
            window = page[vd_idx : vd_idx + 32000]
            tm = _VD_TITLE_RE.search(window)
            if tm:
                cand = _decode_json_string_fragment(tm.group(1)).strip()
                if _is_usable_watch_title(cand):
                    title = cand
            if duration is None:
                lm = _WATCH_LENGTH_SECONDS_RE.search(window)
                if lm:
                    try:
                        d = int(lm.group(1))
                        if 0 <= d <= 86400 * 30:
                            duration = d
                    except ValueError:
                        pass

    if title is None or not _is_usable_watch_title(title):
        m = re.search(r"<title>(.+?)(?:\s*-\s*YouTube)?\s*</title>", page, re.DOTALL)
        if m:
            cand = html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
            if _is_usable_watch_title(cand):
                title = cand

    if duration is None:
        lm = _WATCH_LENGTH_SECONDS_RE.search(page)
        if lm:
            try:
                d = int(lm.group(1))
                if 0 <= d <= 86400 * 30:
                    duration = d
            except ValueError:
                duration = None

    if not _is_usable_watch_title(title):
        title = None

    return title, duration


def _fetch_oembed_title(
    video_id: str,
    *,
    proxies: Optional[dict[str, str]],
    headers: dict[str, str],
    timeout: float,
) -> Optional[str]:
    """YouTube oEmbed JSON — often returns a real title when the watch HTML is a bot wall."""
    watch = f"https://www.youtube.com/watch?v={video_id}"
    try:
        r = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": watch, "format": "json"},
            headers=headers,
            proxies=proxies,
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        t = data.get("title")
        if isinstance(t, str):
            t = t.strip()
        if not _is_usable_watch_title(t):
            return None
        return t
    except Exception:
        logger.debug("oEmbed title fetch failed for %s", video_id, exc_info=True)
        return None


def fetch_video_watch_meta(video_id: str) -> tuple[Optional[str], Optional[int]]:
    """
    Watch-page GET: parse HTML title and embedded lengthSeconds (no API key).

    When YOUTUBE/Webshare proxies are configured (same as transcript), uses them so
    residential egress can read the page. Plain server IP often gets consent/bot HTML
    with no usable title or lengthSeconds while transcript APIs still work via proxy.
    """
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    headers = {
        "Accept-Language": "en-US,en;q=0.9",
        # YouTube frequently serves minimal/bot interstitials to default python-requests UAs.
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
    }

    attempts: list[Optional[dict[str, str]]] = []
    if _proxy_configs:
        for cfg in _proxy_configs:
            pd = _requests_proxies_from_ytt_config(cfg)
            if pd:
                attempts.append(pd)
    if not attempts:
        attempts.append(None)

    last_error: Optional[Exception] = None
    for proxies in attempts:
        try:
            kwargs: dict[str, Any] = {"headers": headers, "timeout": 10}
            if proxies is not None:
                kwargs["proxies"] = proxies
            resp = requests.get(watch_url, **kwargs)
            if resp.status_code != 200:
                continue
            title, duration_seconds = _parse_watch_page_html(resp.text, video_id)
            if not _is_usable_watch_title(title):
                title = None
            if title is None:
                oe = _fetch_oembed_title(
                    video_id,
                    proxies=proxies,
                    headers=headers,
                    timeout=10.0,
                )
                if oe:
                    title = oe
            if (title and str(title).strip()) or duration_seconds is not None:
                return title, duration_seconds
        except Exception as e:
            last_error = e
            logger.debug("watch page meta request failed video_id=%s: %s", video_id, e)
            continue

    if last_error:
        logger.debug("Could not fetch watch page meta for %s: %s", video_id, last_error)
    else:
        logger.debug(
            "Could not parse watch page meta for %s (non-200 or no title/duration in HTML)",
            video_id,
        )
    return None, None


def _watch_metadata_succeeded(title: Optional[str], duration_seconds: Optional[int]) -> bool:
    """True if the watch-page scrape yielded a title and/or duration."""
    if duration_seconds is not None:
        return True
    if title and str(title).strip():
        return True
    return False


def _youtube_ingestion_error_detail(
    *,
    code: str,
    message: str,
    video_id: Optional[str] = None,
    title: Optional[str] = None,
    duration_seconds: Optional[int] = None,
    transcript_ok: bool = False,
) -> dict[str, Any]:
    """Structured error body for /youtube/transcript (client + logging)."""
    return {
        "code": code,
        "message": message,
        "video_id": video_id,
        "title": title,
        "duration_seconds": duration_seconds,
        "watch_metadata_ok": _watch_metadata_succeeded(title, duration_seconds),
        "transcript_ok": transcript_ok,
    }


def _log_transcript_failed_after_watch_metadata_ok(
    video_id: str,
    *,
    title: Optional[str],
    duration_seconds: Optional[int],
    code: str,
    detail: str,
) -> None:
    if not _watch_metadata_succeeded(title, duration_seconds):
        return
    logger.warning(
        "[youtube] transcript failed after watch_metadata_ok video_id=%s code=%s "
        "title=%r duration_seconds=%s detail=%s",
        video_id,
        code,
        title,
        duration_seconds,
        detail,
    )


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
    proxy_count: int = 0
    transcript_proxy_mode: str
    proxy_host_safe: str
    proxy_hosts_safe: str = ""
    egress_check_outcome: str
    egress_check_message: str
    egress_observed_ip: Optional[str] = None


def _proxy_egress_status_response() -> ProxyEgressStatusResponse:
    n = len(_proxy_configs)
    first = _proxy_configs[0] if _proxy_configs else None
    return ProxyEgressStatusResponse(
        proxy_configured=bool(_proxy_configs),
        proxy_count=n,
        transcript_proxy_mode=_transcript_proxy_mode_list(_proxy_configs),
        proxy_host_safe=_proxy_host_for_logs(first),
        proxy_hosts_safe=_proxy_hosts_summary(_proxy_configs),
        egress_check_outcome=_proxy_egress_check_outcome,
        egress_check_message=_proxy_egress_check_message,
        egress_observed_ip=_proxy_egress_observed_ip,
    )


@router.get("/proxy-egress-status", response_model=ProxyEgressStatusResponse, dependencies=[Depends(require_admin_key)])
async def proxy_egress_status():
    """Debug: whether YouTube transcript proxy is configured and egress verification result."""
    return _proxy_egress_status_response()


@router.post(
    "/proxy-verify-egress",
    response_model=ProxyEgressStatusResponse,
    dependencies=[Depends(require_admin_key)],
)
def proxy_verify_egress_now():
    """
    Run egress checks immediately (same probes as startup). Uses YOUTUBE_PROXY_EGRESS_TIMEOUT /
    YOUTUBE_PROXY_EGRESS_MAX_WORKERS. Ignores YOUTUBE_PROXY_VERIFY_EGRESS — use when debugging proxies
    without restarting the API.
    """
    run_proxy_egress_verification(force=True)
    return _proxy_egress_status_response()


def _is_ip_block_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(kw in msg for kw in (
        "ip", "block", "cloud provider", "too many requests",
        "429", "/sorry", "max retries exceeded", "responseerror",
        "403", "502", "503", "504", "proxy", "connection refused",
        "connection reset", "tunnel connection failed", "connect timeout",
        "timed out", "ssl", "certificate",
    ))


def _should_try_next_proxy_for_transcript(exc: Exception) -> bool:
    """True only for proxy/network/block-style failures — not missing captions or bad URL."""
    if isinstance(
        exc,
        (
            NoTranscriptFound,
            TranscriptsDisabled,
            InvalidVideoId,
            AgeRestricted,
            NotTranslatable,
            TranslationLanguageNotAvailable,
            CookieError,
            CookieInvalid,
            CookiePathInvalid,
            FailedToCreateConsentCookie,
            YouTubeDataUnparsable,
        ),
    ):
        return False
    if isinstance(exc, (VideoUnavailable, VideoUnplayable)):
        return _is_ip_block_error(exc)
    if isinstance(exc, (IpBlocked, RequestBlocked, PoTokenRequired)):
        return True
    if isinstance(exc, YouTubeRequestFailed):
        return True
    if isinstance(exc, CouldNotRetrieveTranscript):
        return _is_ip_block_error(exc)
    return _is_ip_block_error(exc)


def _youtube_proxy_same_endpoint_extra_retries() -> int:
    """
    Extra transcript attempts per proxy after the first (rotating residential = fresh exit IP).
    Env YOUTUBE_PROXY_RETRY_SAME_ENDPOINTS: default 2 → 3 total tries per endpoint.
    """
    raw = os.environ.get("YOUTUBE_PROXY_RETRY_SAME_ENDPOINTS", "").strip()
    if raw:
        try:
            return max(0, min(int(raw), 10))
        except ValueError:
            pass
    return 2


def _youtube_proxy_retry_delay_seconds() -> float:
    """Base delay from YOUTUBE_PROXY_RETRY_DELAY_MS (default 500) plus random jitter (no secrets logged)."""
    raw = os.environ.get("YOUTUBE_PROXY_RETRY_DELAY_MS", "").strip()
    base_ms = 500.0
    if raw:
        try:
            base_ms = float(max(0.0, min(float(raw), 60_000.0)))
        except ValueError:
            pass
    jitter_max = min(400.0, base_ms * 0.75) if base_ms > 0 else 100.0
    jitter = random.uniform(0.0, jitter_max)
    return (base_ms + jitter) / 1000.0


def _should_retry_same_endpoint_transcript(exc: Exception) -> bool:
    """
    True when repeating the same rotating proxy URL may help (new residential session / exit IP).
    Never true for definitive caption/content/user errors.
    """
    if isinstance(
        exc,
        (
            NoTranscriptFound,
            TranscriptsDisabled,
            InvalidVideoId,
            AgeRestricted,
            NotTranslatable,
            TranslationLanguageNotAvailable,
            CookieError,
            CookieInvalid,
            CookiePathInvalid,
            FailedToCreateConsentCookie,
            YouTubeDataUnparsable,
        ),
    ):
        return False
    if isinstance(exc, (VideoUnavailable, VideoUnplayable)):
        return _is_ip_block_error(exc)
    if isinstance(exc, (IpBlocked, RequestBlocked, PoTokenRequired)):
        return True
    if isinstance(exc, YouTubeRequestFailed):
        return True
    if isinstance(exc, CouldNotRetrieveTranscript):
        return _is_ip_block_error(exc)
    return _is_ip_block_error(exc)


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


def _fetch_transcript_list_and_fetch(proxy_config: Any, video_id: str) -> tuple[Any, Any]:
    """One list + find_transcript + fetch. Logs available languages (safe)."""
    ytt_api = YouTubeTranscriptApi(proxy_config=proxy_config)
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
    return picked, transcript_list


@router.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(payload: TranscriptRequest):
    video_id = extract_video_id(payload.url)
    if not video_id:
        raise HTTPException(
            status_code=400,
            detail=_youtube_ingestion_error_detail(
                code="INVALID_YOUTUBE_URL",
                message="Invalid YouTube URL. Please paste a valid video link.",
            ),
        )

    title, duration_seconds = fetch_video_watch_meta(video_id)
    meta_ok = _watch_metadata_succeeded(title, duration_seconds)
    logger.info(
        "[youtube] watch_metadata video_id=%s outcome=%s title_present=%s duration_seconds=%s",
        video_id,
        "ok" if meta_ok else "none",
        bool(title and str(title).strip()),
        duration_seconds if duration_seconds is not None else None,
    )
    print(
        f"[youtube] Watch meta for {video_id}: "
        f"{'ok' if meta_ok else 'none'} "
        f"(title={'set' if title else 'missing'}, duration={duration_seconds if duration_seconds is not None else 'missing'})"
    )
    if not meta_ok:
        logger.info(
            "[youtube] watch_metadata video_id=%s note=continuing_transcript_attempt_without_watch_meta",
            video_id,
        )

    attempts = _proxy_configs if _proxy_configs else [None]
    n_attempts = len(attempts)
    path = "proxy" if _proxy_configs else "direct"
    mode = _transcript_proxy_mode_list(_proxy_configs)
    egress_suffix = ""
    if _proxy_configs:
        if _proxy_egress_check_outcome == "ok" and _proxy_egress_observed_ip:
            egress_suffix = f", confirmed_egress_ip={_proxy_egress_observed_ip}"
        elif _proxy_egress_check_outcome == "failed":
            egress_suffix = ", confirmed_egress_ip=none_verification_failed"
        elif _proxy_egress_check_outcome == "skipped":
            egress_suffix = ", egress_check=skipped"
        elif _proxy_egress_check_outcome == "not_run":
            egress_suffix = ", egress_check=not_run"
    logger.info(
        "[youtube] transcript: starting fetch video_id=%s (path=%s, mode=%s, proxies=%d%s)",
        video_id,
        path,
        mode,
        n_attempts,
        egress_suffix,
    )
    print(
        f"[youtube] transcript: starting fetch (path={path}, mode={mode}, proxies={n_attempts}{egress_suffix})"
    )

    transcript_list = None
    picked = None
    last_exc: Optional[Exception] = None
    last_attempt_idx: int = 0
    same_endpoint_extra = _youtube_proxy_same_endpoint_extra_retries()
    max_tries_per_proxy = 1 + same_endpoint_extra if _proxy_configs else 1

    for attempt_idx, cfg in enumerate(attempts):
        last_attempt_idx = attempt_idx
        host = _proxy_host_for_logs(cfg)
        logger.info(
            "[youtube] transcript: trying proxy index %d/%d (host=%s) video_id=%s (same_endpoint_max_tries=%d)",
            attempt_idx + 1,
            n_attempts,
            host,
            video_id,
            max_tries_per_proxy,
        )
        print(f"[youtube] transcript: try {attempt_idx + 1}/{n_attempts} (host={host})")
        proxy_success = False
        for sub_try in range(max_tries_per_proxy):
            if sub_try > 0:
                delay_s = _youtube_proxy_retry_delay_seconds()
                logger.info(
                    "[youtube] transcript: block-like failure — same-endpoint retry %d/%d on proxy %d/%d "
                    "after %.2fs delay (fresh residential exit; host=%s) video_id=%s",
                    sub_try,
                    same_endpoint_extra,
                    attempt_idx + 1,
                    n_attempts,
                    delay_s,
                    host,
                    video_id,
                )
                print(
                    f"[youtube] transcript: rotating endpoint retry {sub_try}/{same_endpoint_extra} "
                    f"on proxy {attempt_idx + 1}/{n_attempts} (delay {delay_s:.2f}s)"
                )
                time.sleep(delay_s)
            try:
                picked, transcript_list = _fetch_transcript_list_and_fetch(cfg, video_id)
                proxy_success = True
                if sub_try > 0:
                    logger.info(
                        "[youtube] transcript: success on same-endpoint retry %d/%d for proxy %d/%d "
                        "(host=%s) video_id=%s language_code=%s",
                        sub_try,
                        same_endpoint_extra,
                        attempt_idx + 1,
                        n_attempts,
                        host,
                        video_id,
                        getattr(picked, "language_code", None),
                    )
                    print(
                        f"[youtube] Transcript succeeded on same-endpoint retry {sub_try}/{same_endpoint_extra} "
                        f"for proxy {attempt_idx + 1}/{n_attempts} "
                        f"(language={getattr(picked, 'language_code', '?')})"
                    )
                else:
                    logger.info(
                        "[youtube] transcript: success via index %d/%d (host=%s) video_id=%s language_code=%s",
                        attempt_idx + 1,
                        n_attempts,
                        host,
                        video_id,
                        getattr(picked, "language_code", None),
                    )
                    print(
                        f"[youtube] Transcript fetch for {video_id}: ok "
                        f"(proxy_index={attempt_idx + 1}/{n_attempts}, language={getattr(picked, 'language_code', '?')})"
                    )
                logger.info(
                    "[youtube] transcript video_id=%s outcome=ok proxy_index=%d/%d language_code=%s "
                    "watch_metadata_was_ok=%s same_endpoint_attempt=%d",
                    video_id,
                    attempt_idx + 1,
                    n_attempts,
                    getattr(picked, "language_code", None),
                    meta_ok,
                    sub_try + 1,
                )
                break
            except HTTPException:
                raise
            except NoTranscriptFound as exc:
                print(f"[youtube] Transcript fetch for {video_id}: FAILED — {exc}")
                logger.warning("Transcript fetch for %s: no matching language — %s", video_id, exc)
                _log_transcript_failed_after_watch_metadata_ok(
                    video_id,
                    title=title,
                    duration_seconds=duration_seconds,
                    code="NO_TRANSCRIPT_LANGUAGE",
                    detail=str(exc),
                )
                raise HTTPException(
                    status_code=422,
                    detail=_youtube_ingestion_error_detail(
                        code="NO_TRANSCRIPT_LANGUAGE",
                        message="No transcript available in a supported language for this video.",
                        video_id=video_id,
                        title=title,
                        duration_seconds=duration_seconds,
                    ),
                )
            except Exception as exc:
                last_exc = exc
                print(f"[youtube] Transcript fetch for {video_id}: FAILED — {exc}")
                logger.warning(
                    "Transcript fetch for %s: failed (proxy_index=%d/%d, same_endpoint_try=%d/%d, host=%s) — %s",
                    video_id,
                    attempt_idx + 1,
                    n_attempts,
                    sub_try + 1,
                    max_tries_per_proxy,
                    host,
                    exc,
                )
                retry_same = (
                    _proxy_configs
                    and _should_retry_same_endpoint_transcript(exc)
                    and sub_try < max_tries_per_proxy - 1
                )
                if retry_same:
                    logger.warning(
                        "[youtube] transcript: block-like failure (%s), retrying same endpoint for fresh exit",
                        type(exc).__name__,
                    )
                    continue
                try_next_proxy = (
                    _proxy_configs
                    and _should_try_next_proxy_for_transcript(exc)
                    and attempt_idx < n_attempts - 1
                )
                if try_next_proxy:
                    logger.warning(
                        "[youtube] transcript: exhausted same-endpoint retries (%d attempts) for proxy %d/%d "
                        "— moving to next proxy (%s)",
                        max_tries_per_proxy,
                        attempt_idx + 1,
                        n_attempts,
                        type(exc).__name__,
                    )
                    print(
                        f"[youtube] transcript: exhausted retries for proxy {attempt_idx + 1}/{n_attempts}, "
                        f"moving to next ({type(exc).__name__})"
                    )
                break
        if proxy_success:
            break

    if transcript_list is None:
        exc = last_exc or RuntimeError("transcript fetch failed with no exception recorded")
        if _proxy_configs and _is_ip_block_error(exc):
            if _proxy_egress_check_outcome == "ok" and _proxy_egress_observed_ip:
                logger.warning(
                    "[youtube] transcript: YouTube blocked or IP-related error while proxy was configured — "
                    "egress verification previously observed IP %s (first successful proxy check) — "
                    "all transcript proxy attempts failed or last error was block-like",
                    _proxy_egress_observed_ip,
                )
                print(
                    f"[youtube] transcript: YouTube block/error with proxy — "
                    f"egress was verified as {_proxy_egress_observed_ip} but transcript still failed"
                )
            else:
                logger.warning(
                    "[youtube] transcript: YouTube block/error with proxy configured — "
                    "egress verification outcome=%s; proxy application uncertain",
                    _proxy_egress_check_outcome,
                )
                print(
                    f"[youtube] transcript: YouTube block/error with proxy — "
                    f"egress verification outcome={_proxy_egress_check_outcome} (proxy application uncertain)"
                )
        if _proxy_configs and n_attempts > 1 and last_attempt_idx == n_attempts - 1:
            logger.error(
                "[youtube] transcript: all %d proxy config(s) exhausted without success (last_error=%s)",
                n_attempts,
                type(exc).__name__,
            )
            print(
                f"[youtube] transcript: all {n_attempts} proxies exhausted (last: {type(exc).__name__})"
            )
        if _is_ip_block_error(exc):
            _log_transcript_failed_after_watch_metadata_ok(
                video_id,
                title=title,
                duration_seconds=duration_seconds,
                code="TRANSCRIPT_BLOCKED",
                detail=type(exc).__name__ + ": " + str(exc),
            )
            raise HTTPException(
                status_code=503,
                detail=_youtube_ingestion_error_detail(
                    code="TRANSCRIPT_BLOCKED",
                    message="We couldn\u2019t fetch the transcript from YouTube right now.",
                    video_id=video_id,
                    title=title,
                    duration_seconds=duration_seconds,
                ),
            )
        _log_transcript_failed_after_watch_metadata_ok(
            video_id,
            title=title,
            duration_seconds=duration_seconds,
            code="NO_TRANSCRIPT",
            detail=type(exc).__name__ + ": " + str(exc),
        )
        raise HTTPException(
            status_code=422,
            detail=_youtube_ingestion_error_detail(
                code="NO_TRANSCRIPT",
                message="No transcript available for this video. It may not have captions enabled.",
                video_id=video_id,
                title=title,
                duration_seconds=duration_seconds,
            ),
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
        logger.warning(
            "[youtube] transcript video_id=%s outcome=too_short chars=%d watch_metadata_was_ok=%s",
            video_id,
            len(text.strip()),
            meta_ok,
        )
        raise HTTPException(
            status_code=422,
            detail=_youtube_ingestion_error_detail(
                code="TRANSCRIPT_TOO_SHORT",
                message="Transcript is too short to generate useful flashcards.",
                video_id=video_id,
                title=title,
                duration_seconds=duration_seconds,
                transcript_ok=True,
            ),
        )

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
