"""
LLM provider router with fallback.
Primary: Groq (multiple API keys in order) → Gemini → OpenRouter → OpenAI
"""
from __future__ import annotations

import json
import logging
import os
import re
import time

from app.llm.cache import get_cached_response, save_cached_response
from app.llm.cost_tracker import log_llm_usage, log_usage_unavailable
from app.llm.direct_outbound import (
    describe_llm_proxy_env_for_logs,
    get_llm_requests_session,
    groq_client,
    openai_client,
)

logger = logging.getLogger(__name__)

_JSON_SYSTEM_PROMPT = "You are a helpful assistant. Return only valid JSON, no other text."


def _llm_response_preview(text: str, max_len: int = 500) -> str:
    if not text:
        return "(empty)"
    t = text.strip().replace("\r", " ")
    if len(t) > max_len:
        return f"{t[:max_len]}… (total_len={len(text)})"
    return f"{t} (len={len(text)})"


MAX_RATE_LIMIT_RETRIES = 2
DEFAULT_RETRY_WAIT = 5.0
MAX_RETRY_WAIT = 30.0

PROVIDER_ORDER = ["groq", "gemini", "openrouter", "openai"]


DEFAULT_MODELS = {
    "groq": "llama-3.1-8b-instant",
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
    "openrouter": "deepseek/deepseek-chat",
}


def _groq_api_keys_ordered() -> list[str]:
    """
    Groq keys: GROQ_API_KEY first (if set), then comma-separated GROQ_API_KEYS entries.
    Trim, drop empties, dedupe while preserving order.
    """
    seen: set[str] = set()
    out: list[str] = []
    primary = (os.getenv("GROQ_API_KEY") or "").strip()
    if primary:
        seen.add(primary)
        out.append(primary)
    raw = os.getenv("GROQ_API_KEYS") or ""
    for part in raw.split(","):
        k = part.strip()
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(k)
    return out


def _groq_http_status(exc: BaseException) -> int | None:
    """Best-effort HTTP status from Groq / httpx / nested exception chain."""
    visited: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in visited:
        visited.add(id(cur))
        sc = getattr(cur, "status_code", None)
        if isinstance(sc, int):
            return sc
        resp = getattr(cur, "response", None)
        if resp is not None:
            rsc = getattr(resp, "status_code", None)
            if isinstance(rsc, int):
                return rsc
        cur = cur.__cause__ or cur.__context__
    return None


def _groq_find_http_response(exc: BaseException) -> object | None:
    """First httpx-like response in the exception chain (for safe debug headers/body)."""
    visited: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in visited:
        visited.add(id(cur))
        resp = getattr(cur, "response", None)
        if resp is not None and getattr(resp, "status_code", None) is not None:
            return resp
        cur = cur.__cause__ or cur.__context__
    return None


def _groq_safe_http_debug(exc: BaseException) -> str:
    """Non-secret HTTP debug string (cf-ray, short body preview)."""
    resp = _groq_find_http_response(exc)
    if resp is None:
        return "no_response_in_chain"
    parts: list[str] = []
    headers = getattr(resp, "headers", None)
    if headers is not None:
        cf = headers.get("cf-ray") or headers.get("CF-Ray")
        if cf:
            parts.append(f"cf-ray={cf}")
        srv = headers.get("server")
        if srv:
            parts.append(f"server={srv}")
    try:
        text = (getattr(resp, "text", None) or "")[:400]
    except Exception:
        text = "(unreadable body)"
    text = text.replace("\r", " ").replace("\n", " ").strip()
    if len(text) > 240:
        text = text[:240] + "…"
    head = "; ".join(parts) if parts else "no_cf_ray"
    return f"{head}; body_preview={text!r}"


def _groq_log_auth_or_edge_failure(exc: Exception) -> None:
    """Extra logging for 401/403 (key vs Cloudflare/egress); safe for logs (no API keys)."""
    st = _groq_http_status(exc)
    if st not in (401, 403):
        return
    dbg = _groq_safe_http_debug(exc)
    logger.warning(
        "LLM Groq: HTTP %s — path=direct https://api.groq.com (httpx trust_env=False; Groq client uses this "
        "http_client only; YouTube/Webshare proxy is separate and not used here). %s. %s",
        st,
        describe_llm_proxy_env_for_logs(),
        dbg,
    )
    if st == 401:
        logger.warning(
            "LLM Groq: HTTP 401 is usually an invalid, expired, or unauthorized API key (account-side)."
        )
    elif st == 403:
        logger.warning(
            "LLM Groq: HTTP 403 with message like 'Access denied… network settings' is commonly Cloudflare "
            "edge blocking or restricting the machine's direct egress IP (sanctions/datacenter/VPN ranges). "
            "If every key fails with the same 403, treat as network-path; try another egress (e.g. local laptop), "
            "or contact Groq with cf-ray above. Bad keys more often return 401."
        )


def _groq_error_category(exc: Exception) -> str:
    """Short label for logs (no secrets)."""
    st = _groq_http_status(exc)
    if st == 429:
        return "rate_limit"
    if st is not None and st >= 500:
        return f"http_{st}"
    if st is not None:
        return f"http_{st}"
    if isinstance(exc, ValueError):
        return "response_validation"
    msg = str(exc).lower()
    if "rate" in msg and "limit" in msg:
        return "rate_limit"
    if "quota" in msg:
        return "quota"
    if "timeout" in msg:
        return "timeout"
    return type(exc).__name__


def _groq_error_allows_next_key(exc: Exception) -> bool:
    """
    True if trying another Groq API key may help (rate limits, quota, transient upstream, bad key slot).
    False for request/content/model issues where rotating keys will not fix the call.
    """
    if isinstance(exc, ValueError):
        return False

    status = _groq_http_status(exc)
    if status is not None:
        if status == 429:
            return True
        if status >= 500:
            return True
        if status == 408:
            return True
        if status in (401, 403):
            return True
        if status in (400, 404, 413, 422):
            return False
        if 400 <= status < 500:
            return False
        return False

    msg = str(exc).lower()
    if "413" in msg or "payload too large" in msg or "request entity too large" in msg:
        return False
    if "invalid json" in msg or "json decode" in msg:
        return False

    if any(
        k in msg
        for k in (
            "rate limit",
            "429",
            "quota",
            "too many requests",
            "tokens per minute",
            " tpm",
            "capacity",
            "overloaded",
            "temporarily unavailable",
            "unavailable",
            "connection reset",
            "econnreset",
            "timeout",
            "timed out",
        )
    ):
        return True

    return False


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


def _generate_groq_with_key(
    prompt: str, temperature: float, max_tokens: int, api_key: str
) -> str:
    model = (os.getenv("GROQ_MODEL") or "").strip() or DEFAULT_MODELS["groq"]
    client = groq_client(api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": _JSON_SYSTEM_PROMPT},
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


def _generate_groq(prompt: str, temperature: float, max_tokens: int) -> str:
    keys = _groq_api_keys_ordered()
    if not keys:
        raise ValueError("GROQ_API_KEY not configured")
    n = len(keys)
    for idx, api_key in enumerate(keys):
        logger.info("LLM Groq: trying API key %d of %d", idx + 1, n)
        try:
            return _generate_groq_with_key(prompt, temperature, max_tokens, api_key)
        except Exception as e:
            _groq_log_auth_or_edge_failure(e)
            allow_next = _groq_error_allows_next_key(e)
            if idx + 1 < n and allow_next:
                logger.warning(
                    "LLM Groq: key %d of %d failed (%s); trying next Groq key",
                    idx + 1,
                    n,
                    _groq_error_category(e),
                )
                continue
            if idx + 1 >= n and allow_next:
                logger.warning(
                    "LLM Groq: all %d key(s) exhausted (%s); falling back to next LLM provider",
                    n,
                    _groq_error_category(e),
                )
            raise


def _generate_openrouter(prompt: str, temperature: float, max_tokens: int) -> str:
    api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY not configured")
    model = (os.getenv("OPENROUTER_MODEL") or "").strip() or DEFAULT_MODELS["openrouter"]
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _JSON_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
        "stop": ["\n\n\n"],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    resp = get_llm_requests_session().post(
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
    from app.llm.json_truncation import analyze_llm_json_response, finish_reason_is_max_tokens

    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    model = (os.getenv("GEMINI_MODEL") or "").strip() or DEFAULT_MODELS["gemini"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    json_mode = (os.getenv("GEMINI_JSON_OUTPUT", "1") or "1").strip() not in ("0", "false", "no")
    cap = max(512, int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS_CAP", "8192")))
    retry_floor = max(1024, int(os.getenv("GEMINI_TRUNCATION_RETRY_MIN_TOKENS", "4096")))
    use_triple_nl_stop = (os.getenv("GEMINI_USE_TRIPLE_NEWLINE_STOP", "0") or "0").strip() in (
        "1",
        "true",
        "yes",
    )

    def generation_config(mtok: int, with_json_mime: bool) -> dict:
        mtok_clamped = min(max(1, mtok), cap)
        cfg: dict = {
            "temperature": temperature,
            "maxOutputTokens": mtok_clamped,
        }
        # Default OFF: "\n\n\n" often appears in pretty-printed JSON (blank lines between cards) and
        # cuts the response mid-object (~hundreds of chars). Groq uses this stop; Gemini JSON must not.
        if use_triple_nl_stop:
            cfg["stopSequences"] = ["\n\n\n"]
        if with_json_mime and json_mode:
            cfg["responseMimeType"] = "application/json"
        return cfg

    def post_payload(payload: dict) -> dict:
        sess = get_llm_requests_session()
        resp = sess.post(
            url,
            headers={"Content-Type": "application/json"},
            json=payload,
            params={"key": api_key},
            timeout=120,
        )
        if not resp.ok:
            if json_mode and resp.status_code == 400:
                logger.warning(
                    "Gemini returned 400 with JSON MIME mode; retrying without responseMimeType. snippet=%s",
                    (resp.text or "")[:300],
                )
                gc = generation_config(min(max_tokens, cap), False)
                payload["generationConfig"] = gc
                resp = sess.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json=payload,
                    params={"key": api_key},
                    timeout=120,
                )
            if not resp.ok:
                raise RuntimeError(f"Gemini API error: {resp.text}")
        return resp.json()

    def parse_response(data: dict) -> tuple[str, str | None, dict]:
        candidates = data.get("candidates") or []
        if not candidates:
            fb = data.get("promptFeedback") or data.get("error")
            logger.warning("Gemini returned no candidates: %s", fb or data)
            raise ValueError("Empty response from Gemini")
        cand0 = candidates[0]
        finish = cand0.get("finishReason") or cand0.get("finish_reason")
        content = cand0.get("content") or {}
        parts = content.get("parts") or []
        if not parts:
            raise ValueError("Empty response from Gemini")
        text = "".join((p.get("text") or "") for p in parts).strip()
        if not text:
            raise ValueError("Empty response from Gemini")
        usage = data.get("usageMetadata") or {}
        return text, str(finish) if finish is not None else None, usage

    payload_base = {
        "systemInstruction": {"parts": [{"text": _JSON_SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
    }

    budget1 = min(max_tokens, cap)
    payload = {
        **payload_base,
        "generationConfig": generation_config(budget1, True),
    }
    data = post_payload(payload)
    text, finish, usage = parse_response(data)

    try:
        inp = usage.get("promptTokenCount") or 0
        out = usage.get("candidatesTokenCount") or 0
        if inp or out:
            log_llm_usage("gemini", model, inp, out)
        else:
            log_usage_unavailable("gemini")
    except Exception:
        pass

    trunc, trunc_reason = analyze_llm_json_response(text)
    max_tok_hit = finish_reason_is_max_tokens(finish)
    first_json_ok = False
    try:
        json.loads(text.strip())
        first_json_ok = True
    except json.JSONDecodeError:
        pass
    fu = str(finish).upper() if finish else ""
    if max_tok_hit:
        logger.warning(
            "Gemini finishReason indicates output limit (%s). response_chars=%d maxOutputTokens=%d "
            "candidateTokens=%s trunc_analysis=%s/%s",
            finish,
            len(text),
            budget1,
            usage.get("candidatesTokenCount"),
            trunc,
            trunc_reason,
        )
    elif fu and fu not in ("STOP", "FINISHREASON_STOP", "STOP_REASON_STOP"):
        logger.warning(
            "Gemini finishReason=%s (may affect JSON). response_chars=%d trunc_analysis=%s/%s",
            finish,
            len(text),
            trunc,
            trunc_reason,
        )
    else:
        logger.info(
            "Gemini finishReason=%s response_chars=%d maxOutputTokens=%d candidateTokens=%s trunc_analysis=%s/%s",
            finish,
            len(text),
            budget1,
            usage.get("candidatesTokenCount"),
            trunc,
            trunc_reason,
        )

    retry_worthy = json_mode and not first_json_ok and (max_tok_hit or trunc)
    if retry_worthy:
        # Never shrink output budget on retry (retry_floor could be below budget1).
        budget2 = min(max(budget1 * 2, retry_floor, budget1 + 512), cap)
        suffix = (
            "\n\nYour previous reply may have been cut off. Return ONE complete, valid JSON object only. "
            "Keep each question and answer_short brief so the full JSON closes; omit answer_detailed or use null."
        )
        payload_retry = {
            "systemInstruction": {"parts": [{"text": _JSON_SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt + suffix}],
                }
            ],
            "generationConfig": generation_config(budget2, True),
        }
        logger.warning(
            "Gemini truncation retry: max_tok_finish=%s likely_truncated=%s reason=%s "
            "first_chars=%d first_budget=%d retry_maxOutputTokens=%d",
            max_tok_hit,
            trunc,
            trunc_reason,
            len(text),
            budget1,
            budget2,
        )
        try:
            data2 = post_payload(payload_retry)
            text2, finish2, usage2 = parse_response(data2)
            try:
                inp2 = usage2.get("promptTokenCount") or 0
                out2 = usage2.get("candidatesTokenCount") or 0
                if inp2 or out2:
                    log_llm_usage("gemini", model, inp2, out2)
                else:
                    log_usage_unavailable("gemini")
            except Exception:
                pass
            trunc2, trunc2_reason = analyze_llm_json_response(text2)
            max2 = finish_reason_is_max_tokens(finish2)
            logger.info(
                "Gemini retry finishReason=%s response_chars=%d maxOutputTokens=%d candidateTokens=%s "
                "trunc_analysis=%s/%s max_tok_finish=%s",
                finish2,
                len(text2),
                budget2,
                usage2.get("candidatesTokenCount"),
                trunc2,
                trunc2_reason,
                max2,
            )
            return text2
        except Exception as e:
            logger.warning("Gemini truncation retry failed, using first response: %s", e)

    return text


def _generate_openai(prompt: str, temperature: float, max_tokens: int) -> str:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    model = (os.getenv("OPENAI_MODEL") or "").strip() or DEFAULT_MODELS["openai"]
    client = openai_client(api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": _JSON_SYSTEM_PROMPT},
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


class RateLimitError(Exception):
    """Raised when a provider returns a rate-limit (429) error."""

    def __init__(self, provider: str, retry_after: float | None = None, original: Exception | None = None):
        self.provider = provider
        self.retry_after = retry_after
        self.original = original
        super().__init__(f"Rate limit exceeded for {provider}")


def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "rate_limit" in msg or "rate limit" in msg or "tokens per minute" in msg


def _extract_retry_after(exc: Exception) -> float | None:
    """Try to extract a retry-after duration from error headers or message."""
    msg = str(exc)
    match = re.search(r"(?:retry.after|try again in)[:\s]*(\d+(?:\.\d+)?)\s*s", msg, re.IGNORECASE)
    if match:
        return min(float(match.group(1)), MAX_RETRY_WAIT)
    match = re.search(r"Please retry after (\d+(?:\.\d+)?)", msg)
    if match:
        return min(float(match.group(1)), MAX_RETRY_WAIT)
    if hasattr(exc, "response"):
        resp = getattr(exc, "response", None)
        if resp is not None and hasattr(resp, "headers"):
            ra = resp.headers.get("retry-after")
            if ra:
                try:
                    return min(float(ra), MAX_RETRY_WAIT)
                except ValueError:
                    pass
    return None


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
    """Return max output tokens (floor 1500; default 2048) to reduce multi-card JSON truncation."""
    val = int(os.getenv("LLM_MAX_TOKENS", "2048"))
    return max(1500, val)


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
    logger.info("LLM provider order (fallback chain): %s", order)

    for pi, provider in enumerate(order):
        fn = _PROVIDER_FNS.get(provider)
        if not fn:
            continue
        model = _get_model(provider)
        logger.info("Using LLM provider: %s (%s)", provider, model)

        retries_left = MAX_RATE_LIMIT_RETRIES
        while True:
            try:
                response_text = fn(prompt, temp, max_tok)
                cache_ok = _is_valid_json_for_cache(response_text)
                logger.info(
                    "LLM ok provider=%s model=%s max_output_tokens=%d response_bytes=%d cache_json_ok=%s",
                    provider,
                    model,
                    max_tok,
                    len(response_text or ""),
                    cache_ok,
                )
                if cache_ok:
                    try:
                        save_cached_response(prompt, response_text)
                    except Exception as e:
                        logger.warning("LLM cache save failed: %s", e)
                else:
                    prev_len = 3200 if provider == "gemini" else 1200
                    logger.warning(
                        "LLM response not strict JSON for cache (generation may still parse). "
                        "provider=%s raw_len=%d preview=%s",
                        provider,
                        len(response_text or ""),
                        _llm_response_preview(response_text or "", prev_len),
                    )
                logger.info("LLM provider used: %s", provider)
                return response_text
            except Exception as e:
                if _is_rate_limit_error(e) and retries_left > 0:
                    wait = _extract_retry_after(e) or DEFAULT_RETRY_WAIT
                    retries_left -= 1
                    logger.warning(
                        "Rate limit hit on %s, waiting %.1fs before retry (%d retries left)",
                        provider, wait, retries_left,
                    )
                    time.sleep(wait)
                    continue

                last_error = e
                if _is_rate_limit_error(e):
                    nxt = [p for p in order[pi + 1 :] if p in _PROVIDER_FNS]
                    logger.warning(
                        "Rate limit on %s after %d retries; next provider(s): %s",
                        provider,
                        MAX_RATE_LIMIT_RETRIES,
                        nxt or "(none)",
                    )
                else:
                    logger.warning("LLM provider failed: %s — %s", provider, e)
                break

    raise RateLimitError("all", original=last_error) if (
        last_error and _is_rate_limit_error(last_error)
    ) else RuntimeError("All LLM providers failed") from last_error


def generate_flashcards(prompt: str, provider: str | None = None) -> str:
    """Alias for generate_completion for backward compatibility."""
    return generate_completion(prompt)
