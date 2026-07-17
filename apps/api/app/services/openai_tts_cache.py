"""Durable on-disk OpenAI TTS audio cache (MP3 + JSON sidecar metadata).

Storage (same pattern as flashcard images — local disk, not Postgres):
  FLASHCARD_TTS_CACHE_DIR or apps/api/app/data/openai_tts_cache/
    {sha256}.mp3
    {sha256}.json

Railway note: the default path lives on the API container filesystem. For
production durability across redeploys, mount a volume and set FLASHCARD_TTS_CACHE_DIR.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

# Bump when speech-text normalization / key composition changes so old entries miss safely.
OPENAI_TTS_PREPROCESSING_VERSION = "v1"

_RESPONSE_FORMAT = "mp3"

_CACHE_DIR = Path(
    os.environ.get("FLASHCARD_TTS_CACHE_DIR", "")
    or (Path(__file__).resolve().parent.parent / "data" / "openai_tts_cache")
)
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Cleanup defaults (env-overridable).
_DEFAULT_MAX_AGE_DAYS = 90
_DEFAULT_MAX_TOTAL_BYTES = 512 * 1024 * 1024  # 512 MiB
_DEFAULT_CLEANUP_EVERY_N_WRITES = 25

_write_counter = 0
_write_counter_lock = threading.Lock()

# Per-key locks: serialize concurrent misses so only one OpenAI call runs per key.
_key_locks_guard = threading.Lock()
_key_locks: dict[str, threading.Lock] = {}


def _lock_for_key(key: str) -> threading.Lock:
    with _key_locks_guard:
        lock = _key_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _key_locks[key] = lock
        return lock


def get_or_generate_cached_audio(
    key: str,
    generate: Callable[[], tuple[bytes, dict[str, Any]]],
) -> tuple[bytes, dict[str, Any]]:
    """
    Cache lookup with per-key locking so concurrent identical misses share one generation.

    `generate` should call OpenAI and persist the cache entry, returning (audio, meta).
    """
    hit = read_cached_audio(key)
    if hit is not None:
        return hit.audio, {**hit.meta, "cache": "hit", "cache_key": key}

    with _lock_for_key(key):
        hit2 = read_cached_audio(key)
        if hit2 is not None:
            return hit2.audio, {**hit2.meta, "cache": "hit", "cache_key": key}
        audio, gen_meta = generate()
        return audio, {**gen_meta, "cache": gen_meta.get("cache", "miss"), "cache_key": key}


def instructions_fingerprint(instructions: str) -> str:
    return hashlib.sha256((instructions or "").encode("utf-8")).hexdigest()


def normalize_text_for_tts_cache(text: str) -> str:
    """Collapse whitespace so trivial formatting diffs share a cache entry."""
    return re.sub(r"\s+", " ", (text or "").strip())


def normalize_language_for_tts_cache(language: str | None) -> str:
    return (language or "").strip().lower()[:16] or "en"


def cache_key_for(
    *,
    text: str,
    model: str,
    voice: str,
    speed: float,
    instructions: str,
    language: str | None,
    preprocessing_version: str = OPENAI_TTS_PREPROCESSING_VERSION,
) -> str:
    """
    Stable SHA-256 over normalized speech inputs.

    Includes language and preprocessing_version so Farsi/English instruction
    differences and future normalization changes invalidate correctly.
    """
    payload = "\n".join(
        [
            normalize_text_for_tts_cache(text),
            (model or "").strip(),
            (voice or "").strip().lower(),
            f"{float(speed):.2f}",
            hashlib.sha256((instructions or "").encode("utf-8")).hexdigest(),
            normalize_language_for_tts_cache(language),
            (preprocessing_version or "").strip() or OPENAI_TTS_PREPROCESSING_VERSION,
            _RESPONSE_FORMAT,
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def audio_path_for(key: str) -> Path:
    return _CACHE_DIR / f"{key}.mp3"


def meta_path_for(key: str) -> Path:
    return _CACHE_DIR / f"{key}.json"


@dataclass
class TtsCacheEntry:
    key: str
    audio: bytes
    meta: dict[str, Any]


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _read_meta(key: str) -> dict[str, Any] | None:
    path = meta_path_for(key)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _write_meta(key: str, meta: dict[str, Any]) -> None:
    path = meta_path_for(key)
    tmp = path.with_suffix(".json.tmp")
    payload = json.dumps(meta, separators=(",", ":"), sort_keys=True)
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)


def touch_last_accessed(key: str) -> None:
    meta = _read_meta(key) or {"cache_key": key}
    meta["last_accessed_at"] = _now_iso()
    try:
        _write_meta(key, meta)
    except OSError:
        logger.debug("openai_tts_cache touch failed key=%s", key[:12], exc_info=True)


def read_cached_audio(key: str) -> TtsCacheEntry | None:
    path = audio_path_for(key)
    if not path.is_file() or path.stat().st_size <= 0:
        return None
    try:
        audio = path.read_bytes()
    except OSError:
        return None
    if not audio:
        return None
    meta = _read_meta(key) or {
        "cache_key": key,
        "byte_size": len(audio),
    }
    touch_last_accessed(key)
    return TtsCacheEntry(key=key, audio=audio, meta=meta)


def write_cached_audio(
    key: str,
    audio: bytes,
    *,
    model: str,
    voice: str,
    speed: float,
    language: str,
    instructions_fingerprint: str,
    preprocessing_version: str = OPENAI_TTS_PREPROCESSING_VERSION,
) -> dict[str, Any]:
    """Atomically write MP3 + sidecar. Returns metadata dict."""
    path = audio_path_for(key)
    tmp = path.with_suffix(".mp3.tmp")
    now = _now_iso()
    meta: dict[str, Any] = {
        "cache_key": key,
        "model": model,
        "voice": voice,
        "speed": float(f"{speed:.2f}"),
        "language": language,
        "instructions_fingerprint": instructions_fingerprint[:16],
        "preprocessing_version": preprocessing_version,
        "byte_size": len(audio),
        "created_at": now,
        "last_accessed_at": now,
        "response_format": _RESPONSE_FORMAT,
    }
    try:
        tmp.write_bytes(audio)
        tmp.replace(path)
        _write_meta(key, meta)
        cache_write = "ok"
    except OSError:
        logger.warning("openai_tts_cache write failed key=%s", key[:12], exc_info=True)
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
        cache_write = "failed"
        meta["cache_write"] = cache_write
        return meta

    meta["cache_write"] = cache_write
    _maybe_cleanup_after_write()
    return meta


def _max_age_seconds() -> float:
    raw = (os.environ.get("OPENAI_TTS_CACHE_MAX_AGE_DAYS") or "").strip()
    try:
        days = float(raw) if raw else _DEFAULT_MAX_AGE_DAYS
    except ValueError:
        days = _DEFAULT_MAX_AGE_DAYS
    return max(1.0, days) * 86400.0


def _max_total_bytes() -> int:
    raw = (os.environ.get("OPENAI_TTS_CACHE_MAX_BYTES") or "").strip()
    try:
        return max(1_000_000, int(raw)) if raw else _DEFAULT_MAX_TOTAL_BYTES
    except ValueError:
        return _DEFAULT_MAX_TOTAL_BYTES


def _maybe_cleanup_after_write() -> None:
    global _write_counter
    with _write_counter_lock:
        _write_counter += 1
        if _write_counter % _DEFAULT_CLEANUP_EVERY_N_WRITES != 0:
            return
    try:
        cleanup_tts_cache()
    except Exception:  # noqa: BLE001
        logger.debug("openai_tts_cache cleanup error", exc_info=True)


def cleanup_tts_cache(
    *,
    max_age_seconds: float | None = None,
    max_total_bytes: int | None = None,
) -> dict[str, int]:
    """
    Delete expired entries (by last_accessed/created), then LRU-trim to max total size.

    Returns counts: scanned, deleted_age, deleted_lru.
    """
    max_age = max_age_seconds if max_age_seconds is not None else _max_age_seconds()
    max_bytes = max_total_bytes if max_total_bytes is not None else _max_total_bytes()
    now = time.time()
    scanned = 0
    deleted_age = 0
    deleted_lru = 0

    entries: list[tuple[str, float, int]] = []  # key, last_access_ts, size

    for mp3 in _CACHE_DIR.glob("*.mp3"):
        key = mp3.stem
        if not re.fullmatch(r"[0-9a-f]{64}", key):
            continue
        scanned += 1
        try:
            size = mp3.stat().st_size
        except OSError:
            continue
        meta = _read_meta(key) or {}
        ts_raw = meta.get("last_accessed_at") or meta.get("created_at")
        try:
            if isinstance(ts_raw, str) and ts_raw:
                # fromisoformat handles "...+00:00"
                ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00")).timestamp()
            else:
                ts = mp3.stat().st_mtime
        except (ValueError, OSError, TypeError):
            try:
                ts = mp3.stat().st_mtime
            except OSError:
                continue

        if now - ts > max_age:
            _delete_entry(key)
            deleted_age += 1
            continue
        entries.append((key, ts, size))

    total = sum(s for _, _, s in entries)
    if total <= max_bytes:
        if deleted_age:
            logger.info(
                "openai_tts_cache_cleanup scanned=%s deleted_age=%s deleted_lru=0 total_bytes=%s",
                scanned,
                deleted_age,
                total,
            )
        return {"scanned": scanned, "deleted_age": deleted_age, "deleted_lru": deleted_lru}

    # LRU: oldest last_accessed first
    entries.sort(key=lambda e: e[1])
    for key, _, size in entries:
        if total <= max_bytes:
            break
        _delete_entry(key)
        total -= size
        deleted_lru += 1

    logger.info(
        "openai_tts_cache_cleanup scanned=%s deleted_age=%s deleted_lru=%s total_bytes=%s",
        scanned,
        deleted_age,
        deleted_lru,
        max(0, total),
    )
    return {"scanned": scanned, "deleted_age": deleted_age, "deleted_lru": deleted_lru}


def _delete_entry(key: str) -> None:
    for p in (audio_path_for(key), meta_path_for(key)):
        try:
            if p.exists():
                p.unlink()
        except OSError:
            pass


def get_tts_cache_dir() -> Path:
    return _CACHE_DIR
