"""
LLM provider router with fallback.
Primary: Groq → Gemini → OpenRouter → OpenAI
"""
from __future__ import annotations

import json
import logging
import os
import re

import requests

from app.llm.cache import get_cached_response, save_cached_response
from app.llm.cost_tracker import log_llm_usage, log_usage_unavailable

logger = logging.getLogger(__name__)

PROVIDER_ORDER = ["groq", "gemini", "openrouter", "openai"]


DEFAULT_MODELS = {
    "groq": "llama-3.1-8b-instant",
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
    "openrouter": "deepseek/deepseek-chat",
}


def _get_provider_order() -> list[str]:
    """Return provider order. If LLM_PROVIDER is set, try that first. OpenAI is opt-in via OPENAI_ENABLED."""
    base = list(PROVIDER_ORDER)

    # OpenAI is opt-in; disabled by default (avoids quota errors when account has no credits)
    if (os.getenv("OPENAI_ENABLED") or "0").strip() != "1":
        if "openai" in base:
            logger.info("OpenAI provider disabled via OPENAI_ENABLED")
            base = [p for p in base if p != "openai"]

    preferred = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if not preferred:
        return base
    if preferred not in base:
        return base
    order = [p for p in base if p != preferred]
    return [preferred] + order


def _generate_groq(prompt: str, temperature: float, max_tokens: int) -> str:
    api_key = (os.getenv("GROQ_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GROQ_API_KEY not configured")
    model = (os.getenv("GROQ_MODEL") or "").strip() or DEFAULT_MODELS["groq"]
    from groq import Groq
    client = Groq(api_key=api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Return only valid JSON, no other text."},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "stop": ["\n\n\n"],
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = client.chat.completions.create(**kwargs)
    choice = response.choices[0] if response.choices else None
    text = ""
    if choice and getattr(choice, "message", None):
        text = (choice.message.content or "").strip()
    if not text:
        raise ValueError("Empty response from Groq")
    try:
        usage = getattr(response, "usage", None)
        if usage is not None:
            inp = getattr(usage, "prompt_tokens", None) or 0
            out = getattr(usage, "completion_tokens", None) or 0
            if inp or out:
                log_llm_usage("groq", model, inp, out)
            else:
                log_usage_unavailable("groq")
        else:
            log_usage_unavailable("groq")
    except Exception:
        pass
    return text


def _generate_openrouter(prompt: str, temperature: float, max_tokens: int) -> str:
    api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY not configured")
    model = (os.getenv("OPENROUTER_MODEL") or "").strip() or DEFAULT_MODELS["openrouter"]
    import requests
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Return only valid JSON, no other text."},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "stop": ["\n\n\n"],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    choice = choices[0] if choices else None
    message = choice.get("message") if choice else None
    text = (message.get("content") or "").strip() if message else ""
    if not text:
        raise ValueError("Empty response from OpenRouter")
    try:
        usage = data.get("usage")
        if usage is not None:
            inp = usage.get("prompt_tokens", 0) or 0
            out = usage.get("completion_tokens", 0) or 0
            if inp or out:
                log_llm_usage("openrouter", model, inp, out)
            else:
                log_usage_unavailable("openrouter")
        else:
            log_usage_unavailable("openrouter")
    except Exception:
        pass
    return text


def _generate_gemini(prompt: str, temperature: float, max_tokens: int) -> str:
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    model = (os.getenv("GEMINI_MODEL") or "").strip() or DEFAULT_MODELS["gemini"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
            "stopSequences": ["\n\n\n"],
        },
    }
    resp = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json=payload,
        params={"key": api_key},
        timeout=120,
    )
    if not resp.ok:
        raise RuntimeError(f"Gemini API error: {resp.text}")
    data = resp.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Empty response from Gemini")
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    if not parts:
        raise ValueError("Empty response from Gemini")
    text = (parts[0].get("text") or "").strip()
    if not text:
        raise ValueError("Empty response from Gemini")
    try:
        usage = data.get("usageMetadata") or {}
        if usage:
            inp = usage.get("promptTokenCount") or 0
            out = usage.get("candidatesTokenCount") or 0
            if inp or out:
                log_llm_usage("gemini", model, inp, out)
            else:
                log_usage_unavailable("gemini")
        else:
            log_usage_unavailable("gemini")
    except Exception:
        pass
    return text


def _generate_openai(prompt: str, temperature: float, max_tokens: int) -> str:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    model = (os.getenv("OPENAI_MODEL") or "").strip() or DEFAULT_MODELS["openai"]
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Return only valid JSON, no other text."},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "stop": ["\n\n\n"],
    }
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = client.chat.completions.create(**kwargs)
    choice = response.choices[0] if response.choices else None
    text = ""
    if choice and getattr(choice, "message", None):
        text = (choice.message.content or "").strip()
    if not text:
        raise ValueError("Empty response from OpenAI")
    try:
        usage = getattr(response, "usage", None)
        if usage is not None:
            inp = getattr(usage, "prompt_tokens", None) or 0
            out = getattr(usage, "completion_tokens", None) or 0
            if inp or out:
                log_llm_usage("openai", model, inp, out)
            else:
                log_usage_unavailable("openai")
        else:
            log_usage_unavailable("openai")
    except Exception:
        pass
    return text


_PROVIDER_FNS = {
    "groq": _generate_groq,
    "gemini": _generate_gemini,
    "openrouter": _generate_openrouter,
    "openai": _generate_openai,
}


def _get_model(provider: str) -> str:
    env_vars = {
        "groq": "GROQ_MODEL",
        "gemini": "GEMINI_MODEL",
        "openai": "OPENAI_MODEL",
        "openrouter": "OPENROUTER_MODEL",
    }
    env_var = env_vars.get(provider)
    if env_var:
        val = (os.getenv(env_var) or "").strip()
        if val:
            return val
    return DEFAULT_MODELS.get(provider, "")


def _get_default_temperature() -> float:
    return float(os.getenv("LLM_TEMPERATURE", "0.2"))


def _get_default_max_tokens() -> int:
    """Return max output tokens (min 1200 to avoid JSON truncation). Default 1500."""
    val = int(os.getenv("LLM_MAX_TOKENS", "1500"))
    return max(1200, val)


def _is_valid_json_for_cache(text: str) -> bool:
    """Return True if text parses as valid JSON. Used to avoid caching truncated/malformed responses."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1).strip()
    if not text:
        return False
    try:
        json.loads(text)
        return True
    except json.JSONDecodeError:
        fixed = re.sub(r",\s*([}\]])", r"\1", text)
        try:
            json.loads(fixed)
            return True
        except json.JSONDecodeError:
            return False


def generate_completion(
    prompt: str,
    temperature: float | None = None,
    max_tokens: int | None = None,
    skip_cache: bool = False,
) -> str:
    """
    Generate completion using primary provider with fallback.
    Tries providers in order until one succeeds.
    """
    if not skip_cache:
        try:
            cached = get_cached_response(prompt)
            if cached is not None:
                logger.info("LLM cache hit")
                return cached
        except Exception as e:
            logger.warning("LLM cache check failed: %s", e)

    temp = temperature if temperature is not None else _get_default_temperature()
    max_tok = max_tokens if max_tokens is not None else _get_default_max_tokens()
    order = _get_provider_order()
    last_error = None

    for provider in order:
        fn = _PROVIDER_FNS.get(provider)
        if not fn:
            continue
        model = _get_model(provider)
        logger.info("Using LLM provider: %s", provider)
        logger.info("Model: %s", model)
        try:
            response_text = fn(prompt, temp, max_tok)
            if _is_valid_json_for_cache(response_text):
                try:
                    save_cached_response(prompt, response_text)
                except Exception as e:
                    logger.warning("LLM cache save failed: %s", e)
            else:
                logger.info("Skipping cache: response did not parse as valid JSON")
            logger.info("LLM provider used: %s", provider)
            return response_text
        except Exception as e:
            last_error = e
            logger.warning("LLM provider failed: %s", provider)
            logger.warning("Error: %s", e)
            if provider != order[-1]:
                logger.info("Falling back to next provider...")

    raise RuntimeError("All LLM providers failed") from last_error


def generate_flashcards(prompt: str, provider: str | None = None) -> str:
    """Alias for generate_completion for backward compatibility."""
    return generate_completion(prompt)
