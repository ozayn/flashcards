"""
LLM traffic must not inherit HTTP_PROXY / HTTPS_PROXY / ALL_PROXY from the environment.

Those vars are commonly set for datacenter or residential proxies used for YouTube/webpage
fetches (YOUTUBE_PROXY_URL / WEBSHARE_*). The same proxy often breaks API providers (e.g.
Groq returns 403 "Access denied. Please check your network settings.").

YouTube and webpage code pass explicit proxy dicts; they are unaffected by this module.
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


def _active_proxy_env_names() -> list[str]:
    return sorted({n for n in _PROXY_ENV_NAMES if (os.environ.get(n) or "").strip()})


def log_llm_outbound_isolation_once() -> None:
    """Once per process: explain that LLM calls ignore standard proxy env vars."""
    global _llm_isolation_logged
    if _llm_isolation_logged:
        return
    _llm_isolation_logged = True
    found = _active_proxy_env_names()
    if found:
        logger.info(
            "LLM outbound: direct HTTPS (Groq/OpenAI use httpx trust_env=False; "
            "OpenRouter/Gemini use requests with trust_env=False). "
            "Standard proxy env vars are not applied to LLM calls: %s",
            ", ".join(found),
        )
    else:
        logger.info(
            "LLM outbound: direct HTTPS (httpx/requests trust_env=False for LLM; "
            "no HTTP_PROXY/HTTPS_PROXY/ALL_PROXY set)"
        )


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

    return Groq(api_key=api_key, http_client=httpx_client_for_llm())


def openai_client(api_key: str):
    from openai import OpenAI

    return OpenAI(api_key=api_key, http_client=httpx_client_for_llm())
