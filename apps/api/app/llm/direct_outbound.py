"""
LLM traffic must not inherit HTTP_PROXY / HTTPS_PROXY / ALL_PROXY from the environment.

Those vars are commonly set for datacenter or residential proxies used for YouTube/webpage
fetches (YOUTUBE_PROXY_URL / WEBSHARE_*). The same proxy often breaks API providers (e.g.
Groq returns 403 "Access denied. Please check your network settings.").

YouTube and webpage code pass explicit proxy dicts; they are unaffected by this module.

Optional: set GROQ_PROXY_URL so Groq API calls use that explicit proxy (same idea as YouTube)
while still using trust_env=False (no accidental HTTP_PROXY inheritance).
"""
from __future__ import annotations

import logging
import os

import httpx
import requests

logger = logging.getLogger(__name__)

_PROXY_ENV_NAMES = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
)

_llm_isolation_logged = False
_llm_requests_session: requests.Session | None = None
_groq_outbound_mode_logged = False


def _active_proxy_env_names() -> list[str]:
    return sorted({n for n in _PROXY_ENV_NAMES if (os.environ.get(n) or "").strip()})


def describe_llm_proxy_env_for_logs() -> str:
    """
    One line for diagnostics: whether standard proxy env vars exist (names only).
    LLM clients still ignore them via trust_env=False; this helps spot accidental env leakage confusion.
    """
    found = _active_proxy_env_names()
    if found:
        return "HTTP(S)_PROXY env present in process (not applied to LLM httpx): " + ", ".join(found)
    return "no HTTP_PROXY/HTTPS_PROXY/ALL_PROXY in process env"


def _groq_proxy_url() -> str | None:
    u = (os.getenv("GROQ_PROXY_URL") or "").strip()
    return u or None


def describe_groq_outbound_for_logs() -> str:
    """Short phrase for error diagnostics (no URLs or credentials)."""
    if _groq_proxy_url():
        return "api.groq.com via GROQ_PROXY_URL (httpx trust_env=False, explicit proxy)"
    return "direct https://api.groq.com (httpx trust_env=False; GROQ_PROXY_URL unset)"


def log_llm_outbound_isolation_once() -> None:
    """Once per process: explain that LLM calls ignore standard proxy env vars."""
    global _llm_isolation_logged
    if _llm_isolation_logged:
        return
    _llm_isolation_logged = True
    found = _active_proxy_env_names()
    groq_mode = (
        "Groq: api.groq.com via GROQ_PROXY_URL (explicit httpx proxy)"
        if _groq_proxy_url()
        else "Groq: direct HTTPS (set GROQ_PROXY_URL to route Groq through a proxy)"
    )
    if found:
        logger.info(
            "LLM outbound: OpenAI uses direct httpx (trust_env=False). %s. "
            "OpenRouter/Gemini use requests (trust_env=False). "
            "Standard proxy env vars are not applied to LLM calls: %s",
            groq_mode,
            ", ".join(found),
        )
    else:
        logger.info(
            "LLM outbound: OpenAI direct httpx (trust_env=False). %s. "
            "OpenRouter/Gemini: requests trust_env=False. No HTTP_PROXY/HTTPS_PROXY/ALL_PROXY set.",
            groq_mode,
        )


def httpx_client_for_groq() -> httpx.Client:
    """httpx client for Groq only: direct HTTPS, or explicit proxy if GROQ_PROXY_URL is set."""
    global _groq_outbound_mode_logged
    log_llm_outbound_isolation_once()
    url = _groq_proxy_url()
    if not _groq_outbound_mode_logged:
        _groq_outbound_mode_logged = True
        if url:
            logger.info(
                "Groq outbound: using explicit proxy from GROQ_PROXY_URL (trust_env=False; URL not logged)"
            )
        else:
            logger.info("Groq outbound: direct HTTPS to api.groq.com (GROQ_PROXY_URL unset)")
    if url:
        return httpx.Client(trust_env=False, proxy=url)
    return httpx.Client(trust_env=False)


def httpx_client_for_llm() -> httpx.Client:
    log_llm_outbound_isolation_once()
    return httpx.Client(trust_env=False)


def get_llm_requests_session() -> requests.Session:
    global _llm_requests_session
    log_llm_outbound_isolation_once()
    if _llm_requests_session is None:
        s = requests.Session()
        s.trust_env = False
        _llm_requests_session = s
    return _llm_requests_session


def groq_client(api_key: str):
    from groq import Groq

    return Groq(api_key=api_key, http_client=httpx_client_for_groq())


def openai_client(api_key: str):
    from openai import OpenAI

    return OpenAI(api_key=api_key, http_client=httpx_client_for_llm())
