"""
LLM response cache using SQLite.
Reduces API calls by returning cached responses for identical prompts.
"""
from __future__ import annotations

import hashlib
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# data/llm_cache.db relative to api app root
_API_ROOT = Path(__file__).resolve().parent.parent.parent
CACHE_DB = _API_ROOT / "data" / "llm_cache.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS llm_cache (
    prompt_hash TEXT PRIMARY KEY,
    response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


def hash_prompt(prompt: str) -> str:
    """Return SHA256 hash of prompt for cache key."""
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def _get_connection() -> sqlite3.Connection:
    """Open connection and ensure table exists."""
    CACHE_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(CACHE_DB))
    conn.execute(_SCHEMA)
    return conn


def get_cached_response(prompt: str) -> str | None:
    """
    Return cached response if exists, else None.
    Never raises; returns None on any error.
    """
    try:
        key = hash_prompt(prompt)
        conn = _get_connection()
        try:
            row = conn.execute(
                "SELECT response FROM llm_cache WHERE prompt_hash = ?",
                (key,),
            ).fetchone()
            return row[0] if row else None
        finally:
            conn.close()
    except Exception as e:
        logger.warning("LLM cache read failed: %s", e)
        return None


def save_cached_response(prompt: str, response: str) -> None:
    """
    Store response in cache.
    Never raises; logs and continues on error.
    """
    try:
        key = hash_prompt(prompt)
        conn = _get_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO llm_cache (prompt_hash, response) VALUES (?, ?)",
                (key, response),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        logger.warning("LLM cache write failed: %s", e)
