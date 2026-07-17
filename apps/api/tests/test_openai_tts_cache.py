"""Unit tests for OpenAI TTS cache (no real OpenAI network calls)."""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.core.guest_trial import GUEST_TRIAL_USER_ID
from app.core.openai_tts_config import (
    DEFAULT_OPENAI_TTS_VOICE,
    clamp_openai_tts_speed,
    normalize_openai_tts_voice,
)
from app.models.enums import UserRole
from app.services import openai_tts_cache as cache_mod
from app.services.openai_tts import OpenAiTtsError, cache_key_for, synthesize_openai_tts
from app.services.openai_tts_cache import (
    OPENAI_TTS_PREPROCESSING_VERSION,
    cleanup_tts_cache,
    get_or_generate_cached_audio,
    read_cached_audio,
    write_cached_audio,
)


@pytest.fixture
def tts_cache_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(cache_mod, "_CACHE_DIR", tmp_path)
    return tmp_path


def test_normalize_voice_defaults():
    assert normalize_openai_tts_voice(None) == DEFAULT_OPENAI_TTS_VOICE
    assert normalize_openai_tts_voice("marin") == "marin"
    assert normalize_openai_tts_voice("nope") == DEFAULT_OPENAI_TTS_VOICE


def test_clamp_speed():
    assert clamp_openai_tts_speed(None) == 1.0
    assert clamp_openai_tts_speed(0.1) == 0.25
    assert clamp_openai_tts_speed(9) == 4.0
    assert clamp_openai_tts_speed(1.25) == 1.25


def test_cache_key_stable_and_sensitive():
    instr = "Speak warmly."
    base = dict(
        text="Hello  world",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions=instr,
        language="en",
    )
    a = cache_key_for(**base)
    b = cache_key_for(**{**base, "text": "Hello world"})
    c = cache_key_for(**{**base, "text": "Hello world", "voice": "marin"})
    d = cache_key_for(**{**base, "text": "Hello world", "speed": 1.1})
    e = cache_key_for(**{**base, "text": "Hello world", "instructions": "Different."})
    f = cache_key_for(**{**base, "text": "Hello world", "language": "fa"})
    g = cache_key_for(
        **{**base, "text": "Hello world", "preprocessing_version": "v2-test"}
    )
    assert a == b
    assert a != c
    assert a != d
    assert a != e
    assert a != f
    assert a != g
    assert len(a) == 64


def test_changed_preprocessing_version_new_key():
    kwargs = dict(
        text="Same text",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions="x",
        language="en",
    )
    v1 = cache_key_for(**kwargs, preprocessing_version="v1")
    v2 = cache_key_for(**kwargs, preprocessing_version="v2")
    assert v1 != v2


def _fake_openai_client(audio: bytes = b"fake-mp3-bytes"):
    client = MagicMock()
    client.audio.speech.create.return_value = SimpleNamespace(content=audio)
    return client


def test_first_request_miss_second_hit_no_second_openai(
    tts_cache_dir, monkeypatch
):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    monkeypatch.delenv("OPENAI_TTS_ENABLED", raising=False)
    client = _fake_openai_client(b"audio-v1")
    monkeypatch.setattr(
        "app.services.openai_tts.openai_client", lambda _key: client
    )

    audio1, meta1 = synthesize_openai_tts(text="Cache me", voice="cedar", speed=1.0)
    assert meta1["cache"] == "miss"
    assert audio1 == b"audio-v1"
    assert client.audio.speech.create.call_count == 1

    audio2, meta2 = synthesize_openai_tts(text="Cache me", voice="cedar", speed=1.0)
    assert meta2["cache"] == "hit"
    assert audio2 == b"audio-v1"
    assert client.audio.speech.create.call_count == 1
    assert (tts_cache_dir / f"{meta1['cache_key']}.mp3").is_file()
    assert (tts_cache_dir / f"{meta1['cache_key']}.json").is_file()


def test_changed_voice_new_cache_entry(tts_cache_dir, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    monkeypatch.delenv("OPENAI_TTS_ENABLED", raising=False)
    client = _fake_openai_client()
    monkeypatch.setattr(
        "app.services.openai_tts.openai_client", lambda _key: client
    )

    _, m1 = synthesize_openai_tts(text="Hello", voice="cedar")
    _, m2 = synthesize_openai_tts(text="Hello", voice="marin")
    assert m1["cache"] == "miss"
    assert m2["cache"] == "miss"
    assert m1["cache_key"] != m2["cache_key"]
    assert client.audio.speech.create.call_count == 2


def test_changed_text_new_cache_entry(tts_cache_dir, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    monkeypatch.delenv("OPENAI_TTS_ENABLED", raising=False)
    client = _fake_openai_client()
    monkeypatch.setattr(
        "app.services.openai_tts.openai_client", lambda _key: client
    )

    _, m1 = synthesize_openai_tts(text="Alpha")
    _, m2 = synthesize_openai_tts(text="Beta")
    assert m1["cache_key"] != m2["cache_key"]
    assert client.audio.speech.create.call_count == 2


def test_changed_preprocessing_version_bypasses_old_cache(
    tts_cache_dir, monkeypatch
):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
    monkeypatch.delenv("OPENAI_TTS_ENABLED", raising=False)
    client = _fake_openai_client(b"v1-audio")
    monkeypatch.setattr(
        "app.services.openai_tts.openai_client", lambda _key: client
    )

    _, m1 = synthesize_openai_tts(text="Same")
    assert m1["cache"] == "miss"

    monkeypatch.setattr(
        "app.services.openai_tts.OPENAI_TTS_PREPROCESSING_VERSION", "v2-test"
    )
    client.audio.speech.create.return_value = SimpleNamespace(content=b"v2-audio")
    audio2, m2 = synthesize_openai_tts(text="Same")
    assert m2["cache"] == "miss"
    assert m2["cache_key"] != m1["cache_key"]
    assert audio2 == b"v2-audio"
    assert client.audio.speech.create.call_count == 2


def test_concurrent_identical_requests_one_upstream(tts_cache_dir):
    calls: list[int] = []
    release_generate = threading.Event()

    def generate():
        calls.append(1)
        # Hold the per-key lock while other threads pile up.
        assert release_generate.wait(timeout=2)
        audio = b"shared-audio"
        write_cached_audio(
            key,
            audio,
            model="gpt-4o-mini-tts",
            voice="cedar",
            speed=1.0,
            language="en",
            instructions_fingerprint="abc",
        )
        return audio, {"cache": "miss", "model": "gpt-4o-mini-tts", "voice": "cedar"}

    key = cache_key_for(
        text="Concurrent",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions="x",
        language="en",
    )
    results: list[tuple[bytes, dict]] = []
    errors: list[BaseException] = []
    ready = threading.Barrier(5)  # 4 workers + main

    def worker():
        try:
            ready.wait(timeout=5)
            results.append(get_or_generate_cached_audio(key, generate))
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    ready.wait(timeout=5)
    # Wait until the lock-holder enters generate(), then let others queue on the lock.
    deadline = time.time() + 2
    while len(calls) < 1 and time.time() < deadline:
        time.sleep(0.01)
    assert len(calls) == 1
    time.sleep(0.05)
    release_generate.set()
    for t in threads:
        t.join(timeout=5)

    assert not errors
    assert len(calls) == 1
    assert all(r[0] == b"shared-audio" for r in results)
    assert any(m.get("cache") == "miss" for _, m in results)
    assert any(m.get("cache") == "hit" for _, m in results)
    assert read_cached_audio(key) is not None


def test_cleanup_lru_respects_max_bytes(tts_cache_dir):
    keys = []
    for i in range(3):
        key = f"{'a' * 63}{i}"
        keys.append(key)
        write_cached_audio(
            key,
            b"x" * 1000,
            model="m",
            voice="cedar",
            speed=1.0,
            language="en",
            instructions_fingerprint="fp",
        )
        # Force distinct last_accessed timestamps (ISO truncates to seconds).
        meta_path = cache_mod.meta_path_for(key)
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        ts = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(
            seconds=10 - i
        )
        meta["created_at"] = ts.isoformat()
        meta["last_accessed_at"] = ts.isoformat()
        meta_path.write_text(json.dumps(meta), encoding="utf-8")

    # Make keys[0] most recently used
    meta0 = json.loads(cache_mod.meta_path_for(keys[0]).read_text(encoding="utf-8"))
    meta0["last_accessed_at"] = (
        datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    )
    cache_mod.meta_path_for(keys[0]).write_text(json.dumps(meta0), encoding="utf-8")

    stats = cleanup_tts_cache(max_age_seconds=86400 * 365, max_total_bytes=1500)
    assert stats["deleted_lru"] >= 1
    assert (tts_cache_dir / f"{keys[0]}.mp3").is_file()
    assert not (tts_cache_dir / f"{keys[1]}.mp3").is_file()


@pytest.mark.asyncio
async def test_unauthorized_rejected_even_if_cached(tts_cache_dir, monkeypatch):
    """Cache hit must not bypass product-admin auth."""
    from app.api.speech import _require_product_admin_user

    key = cache_key_for(
        text="Secret audio",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions="x",
        language="en",
    )
    write_cached_audio(
        key,
        b"cached-bytes",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        language="en",
        instructions_fingerprint="fp",
    )
    assert read_cached_audio(key) is not None

    db = MagicMock()
    with pytest.raises(HTTPException) as missing:
        await _require_product_admin_user(db, None)
    assert missing.value.status_code == 401

    with pytest.raises(HTTPException) as guest:
        await _require_product_admin_user(db, GUEST_TRIAL_USER_ID)
    assert guest.value.status_code == 401

    regular = SimpleNamespace(
        id="u1",
        email="user@example.com",
        name="Regular",
        role=UserRole.user,
    )

    async def fake_fetch(_db, _uid):
        return regular

    monkeypatch.setattr("app.api.speech.fetch_user", fake_fetch)
    with pytest.raises(HTTPException) as forbidden:
        await _require_product_admin_user(db, "u1")
    assert forbidden.value.status_code == 403


def test_sidecar_metadata_written(tts_cache_dir):
    key = cache_key_for(
        text="Meta",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions="style",
        language="en",
        preprocessing_version=OPENAI_TTS_PREPROCESSING_VERSION,
    )
    meta = write_cached_audio(
        key,
        b"abc",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        language="en",
        instructions_fingerprint="deadbeef" * 4,
    )
    assert meta["byte_size"] == 3
    assert meta["cache_key"] == key
    assert "created_at" in meta
    assert "last_accessed_at" in meta
    entry = read_cached_audio(key)
    assert entry is not None
    assert entry.meta["model"] == "gpt-4o-mini-tts"
    assert entry.meta["voice"] == "cedar"


def test_disabled_feature_raises(monkeypatch, tts_cache_dir):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_TTS_ENABLED", "0")
    with pytest.raises(OpenAiTtsError) as exc:
        synthesize_openai_tts(text="Nope")
    assert exc.value.http_status == 503
