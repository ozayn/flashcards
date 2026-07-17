"""Unit tests for OpenAI TTS cache key + config helpers (no network)."""

from app.core.openai_tts_config import (
    DEFAULT_OPENAI_TTS_VOICE,
    clamp_openai_tts_speed,
    normalize_openai_tts_voice,
)
from app.services.openai_tts import cache_key_for


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
    a = cache_key_for(
        text="Hello  world",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions=instr,
    )
    b = cache_key_for(
        text="Hello world",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions=instr,
    )
    c = cache_key_for(
        text="Hello world",
        model="gpt-4o-mini-tts",
        voice="marin",
        speed=1.0,
        instructions=instr,
    )
    d = cache_key_for(
        text="Hello world",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.1,
        instructions=instr,
    )
    e = cache_key_for(
        text="Hello world",
        model="gpt-4o-mini-tts",
        voice="cedar",
        speed=1.0,
        instructions="Different instructions.",
    )
    assert a == b
    assert a != c
    assert a != d
    assert a != e
    assert len(a) == 64
