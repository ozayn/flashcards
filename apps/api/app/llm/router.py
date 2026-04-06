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

import requests

from app.core.gen_job_context import (
    llm_prep_stats_record_success,
)
from app.core.gen_job_context import generation_job_id as _generation_job_id_ctx
from app.core.gen_lifecycle_audit import generation_lifecycle_audit
from app.llm.cache import get_cached_response, save_cached_response
from app.llm.provider_route import apply_provider_routing
from app.llm.cost_tracker import log_llm_usage, log_usage_unavailable
from app.llm.direct_outbound import (
    describe_groq_outbound_for_logs,
    describe_llm_proxy_env_for_logs,
    get_llm_requests_session,
    groq_client,
    openai_client,
)

logger = logging.getLogger(__name__)

_JSON_SYSTEM_PROMPT = "You are a helpful assistant. Return only valid JSON, no other text."


def _life_prefix() -> str:
    j = _generation_job_id_ctx.get()
    return f"[gen_job={j}] " if j else ""


def _classify_llm_failure(exc: Exception, provider: str) -> str:
    """Short result token for lifecycle logs (no secrets)."""
    if _is_rate_limit_error(exc):
        return "rate_limit"
    if isinstance(exc, ValueError):
        return "validation"
    if isinstance(exc, requests.Timeout):
        return "timeout"
    if isinstance(exc, requests.ConnectionError):
        return "connection"
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        sc = exc.response.status_code
        if sc >= 500:
            return "http_5xx"
        if sc == 408:
            return "timeout"
        return f"http_{sc}"
    msg = str(exc).lower()
    if "timeout" in msg or "timed out" in msg:
        return "timeout"
    if "connection" in msg or "econnreset" in msg:
        return "connection"
    return type(exc).__name__


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


def _gemini_api_keys_ordered() -> list[str]:
    """
    Gemini keys: GEMINI_API_KEY first (if set), then comma-separated GEMINI_API_KEYS entries.
    Trim, drop empties, dedupe while preserving order.
    """
    seen: set[str] = set()
    out: list[str] = []
    primary = (os.getenv("GEMINI_API_KEY") or "").strip()
    if primary:
        seen.add(primary)
        out.append(primary)
    raw = os.getenv("GEMINI_API_KEYS") or ""
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
        "LLM Groq: HTTP %s — %s (Groq-only httpx client; YouTube/Webshare uses separate config unless "
        "GROQ_PROXY_URL matches). %s. %s",
        st,
        describe_groq_outbound_for_logs(),
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
            "edge blocking or restricting the client egress IP (sanctions/datacenter/VPN ranges). "
            "If GROQ_PROXY_URL is unset, try routing Groq through a residential proxy (same URL style as "
            "YOUTUBE_PROXY_URL). If every key fails the same way, treat as network-path; bad keys more often return 401."
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


def _gemini_http_status(exc: BaseException) -> int | None:
    """HTTP status from requests.HTTPError or nested exception chain."""
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        return exc.response.status_code
    visited: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in visited:
        visited.add(id(cur))
        if isinstance(cur, requests.HTTPError) and cur.response is not None:
            return cur.response.status_code
        resp = getattr(cur, "response", None)
        if resp is not None:
            rsc = getattr(resp, "status_code", None)
            if isinstance(rsc, int):
                return rsc
        cur = cur.__cause__ or cur.__context__
    return None


def _gemini_error_category(exc: Exception) -> str:
    """Short label for logs (no secrets)."""
    st = _gemini_http_status(exc)
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
    if "quota" in msg or "resource exhausted" in msg:
        return "quota"
    if "timeout" in msg or isinstance(exc, requests.Timeout):
        return "timeout"
    if isinstance(exc, requests.ConnectionError):
        return "connection_error"
    return type(exc).__name__


def _gemini_error_allows_next_key(exc: Exception) -> bool:
    """
    True if trying another Gemini API key may help (rate limits, quota, transient upstream).
    False for request/content/model issues where rotating keys will not fix the call.
    """
    if isinstance(exc, ValueError):
        return False

    status = _gemini_http_status(exc)
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

    if isinstance(exc, requests.Timeout):
        return True
    if isinstance(exc, requests.ConnectionError):
        return True

    if any(
        k in msg
        for k in (
            "rate limit",
            "429",
            "quota",
            "resource exhausted",
            "too many requests",
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
        logger.info(
            "%sllm_key provider=groq idx=%d/%d phase=try",
            _life_prefix(),
            idx + 1,
            n,
        )
        try:
            return _generate_groq_with_key(prompt, temperature, max_tokens, api_key)
        except Exception as e:
            _groq_log_auth_or_edge_failure(e)
            allow_next = _groq_error_allows_next_key(e)
            cat = _groq_error_category(e)
            if idx + 1 < n and allow_next:
                logger.warning(
                    "%sllm_key provider=groq idx=%d/%d result=%s next=key",
                    _life_prefix(),
                    idx + 1,
                    n,
                    cat,
                )
                continue
            if idx + 1 >= n and allow_next:
                logger.warning(
                    "%sllm_key provider=groq result=%s next=provider keys_exhausted=%d",
                    _life_prefix(),
                    cat,
                    n,
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


def _generate_gemini_with_key(prompt: str, temperature: float, max_tokens: int, api_key: str) -> str:
    from app.llm.json_truncation import analyze_llm_json_response, finish_reason_is_max_tokens

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
                resp.raise_for_status()
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


def _generate_gemini(prompt: str, temperature: float, max_tokens: int) -> str:
    keys = _gemini_api_keys_ordered()
    if not keys:
        raise ValueError("No Gemini API keys configured (set GEMINI_API_KEY and/or GEMINI_API_KEYS)")
    n = len(keys)
    for idx, api_key in enumerate(keys):
        logger.info(
            "%sllm_key provider=gemini idx=%d/%d phase=try",
            _life_prefix(),
            idx + 1,
            n,
        )
        try:
            return _generate_gemini_with_key(prompt, temperature, max_tokens, api_key)
        except Exception as e:
            allow_next = _gemini_error_allows_next_key(e)
            cat = _gemini_error_category(e)
            if idx + 1 < n and allow_next:
                logger.warning(
                    "%sllm_key provider=gemini idx=%d/%d result=%s next=key",
                    _life_prefix(),
                    idx + 1,
                    n,
                    cat,
                )
                continue
            if idx + 1 >= n and allow_next:
                logger.warning(
                    "%sllm_key provider=gemini result=%s next=provider keys_exhausted=%d",
                    _life_prefix(),
                    cat,
                    n,
                )
            raise


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
    *,
    llm_routing: dict | None = None,
) -> str:
    """
    Generate completion using primary provider with fallback.
    Tries providers in order until one succeeds.
    Optional llm_routing (text job hints: chunked_mode, text_len, source_type, num_cards,
    youtube_route_reason) may reorder Groq vs Gemini (see provider_route.apply_provider_routing).
    """
    if not skip_cache:
        try:
            cached = get_cached_response(prompt)
            if cached is not None:
                llm_prep_stats_record_success("cache", 0)
                logger.info("%sllm_try provider=cache result=success", _life_prefix())
                generation_lifecycle_audit(
                    f"{_life_prefix().strip()} llm_try provider=cache result=success "
                    f"note=cache_hit_skips_live_chain"
                )
                return cached
        except Exception as e:
            logger.warning("%sllm_cache_check_failed err=%s", _life_prefix(), e)

    temp = temperature if temperature is not None else _get_default_temperature()
    max_tok = max_tokens if max_tokens is not None else _get_default_max_tokens()
    base_order = _get_provider_order()
    order, route_label, route_reason = apply_provider_routing(base_order, llm_routing)
    chain_s = ",".join(order)
    chain_providers = [p for p in order if p in _PROVIDER_FNS]
    chain_first = chain_providers[0] if chain_providers else None
    logger.debug(
        "%sllm_route provider_route=%s route_reason=%s chain=%s",
        _life_prefix(),
        route_label,
        route_reason,
        chain_s,
    )
    generation_lifecycle_audit(
        f"{_life_prefix().strip()} llm_chain provider_route={route_label} route_reason={route_reason} "
        f"chain={chain_s} first_provider={chain_first or 'none'}"
    )
    last_error = None
    chain_total = len(chain_providers)
    attempt_idx = 0

    for pi, provider in enumerate(order):
        fn = _PROVIDER_FNS.get(provider)
        if not fn:
            continue
        attempt_idx += 1
        model = _get_model(provider)
        next_on_fail_list = [p for p in order[pi + 1 :] if p in _PROVIDER_FNS]
        next_on_fail = next_on_fail_list[0] if next_on_fail_list else "none"
        logger.info(
            "%sllm_try provider=%s chain_step=%d/%d model=%s phase=start",
            _life_prefix(),
            provider,
            attempt_idx,
            max(chain_total, 1),
            model,
        )
        generation_lifecycle_audit(
            f"{_life_prefix().strip()} llm_try start provider={provider} "
            f"chain_step={attempt_idx}/{max(chain_total, 1)} next_on_fail={next_on_fail}"
        )

        retries_left = MAX_RATE_LIMIT_RETRIES
        while True:
            try:
                response_text = fn(prompt, temp, max_tok)
                cache_ok = _is_valid_json_for_cache(response_text)
                llm_prep_stats_record_success(provider, attempt_idx - 1)
                logger.info(
                    "%sllm_try provider=%s chain_step=%d result=success bytes=%d cache_json_ok=%s",
                    _life_prefix(),
                    provider,
                    attempt_idx,
                    len(response_text or ""),
                    cache_ok,
                )
                used_fb = chain_first is not None and provider != chain_first
                generation_lifecycle_audit(
                    f"{_life_prefix().strip()} llm_try result=success provider={provider} "
                    f"chain_step={attempt_idx}/{max(chain_total, 1)} first_in_chain={chain_first or 'none'} "
                    f"used_fallback={str(used_fb).lower()}"
                )
                if cache_ok:
                    try:
                        save_cached_response(prompt, response_text)
                    except Exception as e:
                        logger.warning("%sllm_cache_save_failed err=%s", _life_prefix(), e)
                else:
                    prev_len = 3200 if provider == "gemini" else 1200
                    logger.debug(
                        "%sllm_non_json_cache provider=%s raw_len=%d preview=%s",
                        _life_prefix(),
                        provider,
                        len(response_text or ""),
                        _llm_response_preview(response_text or "", prev_len),
                    )
                return response_text
            except Exception as e:
                if _is_rate_limit_error(e) and retries_left > 0:
                    wait = _extract_retry_after(e) or DEFAULT_RETRY_WAIT
                    retries_left -= 1
                    logger.warning(
                        "%sllm_try provider=%s chain_step=%d result=rate_limit retry_in_s=%.1f retries_left=%d",
                        _life_prefix(),
                        provider,
                        attempt_idx,
                        wait,
                        retries_left,
                    )
                    generation_lifecycle_audit(
                        f"{_life_prefix().strip()} llm_try provider={provider} "
                        f"chain_step={attempt_idx}/{max(chain_total, 1)} result=rate_limit_retry "
                        f"retry_in_s={wait:.1f} retries_left={retries_left} next_same_provider=true"
                    )
                    time.sleep(wait)
                    continue

                last_error = e
                cat = _classify_llm_failure(e, provider)
                nxt = [p for p in order[pi + 1 :] if p in _PROVIDER_FNS]
                if nxt:
                    logger.warning(
                        "%sllm_try provider=%s chain_step=%d result=%s next_provider=%s",
                        _life_prefix(),
                        provider,
                        attempt_idx,
                        cat,
                        nxt[0],
                    )
                    generation_lifecycle_audit(
                        f"{_life_prefix().strip()} llm_try result={cat} provider={provider} "
                        f"chain_step={attempt_idx}/{max(chain_total, 1)} next_provider={nxt[0]}"
                    )
                else:
                    logger.warning(
                        "%sllm_try provider=%s chain_step=%d result=%s next_provider=none",
                        _life_prefix(),
                        provider,
                        attempt_idx,
                        cat,
                    )
                    generation_lifecycle_audit(
                        f"{_life_prefix().strip()} llm_try result={cat} provider={provider} "
                        f"chain_step={attempt_idx}/{max(chain_total, 1)} next_provider=none"
                    )
                break

    raise RateLimitError("all", original=last_error) if (
        last_error and _is_rate_limit_error(last_error)
    ) else RuntimeError("All LLM providers failed") from last_error


def generate_flashcards(prompt: str, provider: str | None = None) -> str:
    """Alias for generate_completion for backward compatibility."""
    return generate_completion(prompt)
