#!/usr/bin/env python3
"""
Test all configured LLM providers and report their status.

Run from project root:
  ./scripts/test_all_llms.sh

Or with API venv Python:
  apps/api/.venv313/bin/python tests/test_all_llms.py
"""
import os
import sys
import time
from pathlib import Path

# Load .env from apps/api
_env_path = Path(__file__).resolve().parent.parent / "apps" / "api" / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        pass

try:
    import requests
except ImportError:
    print("Error: requests not installed. Run: pip install requests", file=sys.stderr)
    print("Or use the API venv: apps/api/.venv313/bin/python tests/test_all_llms.py", file=sys.stderr)
    sys.exit(1)

TEST_PROMPT = "Return STRICT JSON with one flashcard about Jupiter (Roman god)."
DEFAULT_MODELS = {
    "groq": "llama-3.1-8b-instant",
    "gemini": "gemini-2.5-flash",
    "openrouter": "deepseek/deepseek-chat",
    "openai": "gpt-4o-mini",
}


def _get_temp() -> float:
    return float(os.environ.get("LLM_TEMPERATURE", "0.2"))


def _get_max_tokens() -> int:
    return int(os.environ.get("LLM_MAX_TOKENS", "2000"))


def _call_groq() -> tuple[str, float, str]:
    """Returns (model, latency, status)."""
    api_key = (os.environ.get("GROQ_API_KEY") or "").strip()
    if not api_key:
        return "", 0, "SKIPPED (no API key)"
    model = (os.environ.get("GROQ_MODEL") or "").strip() or DEFAULT_MODELS["groq"]
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return only valid JSON, no other text."},
            {"role": "user", "content": TEST_PROMPT},
        ],
        "temperature": _get_temp(),
        "max_tokens": _get_max_tokens(),
    }
    try:
        start = time.time()
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
        latency = round(time.time() - start, 2)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        text = ""
        if choices:
            msg = choices[0].get("message") or {}
            text = (msg.get("content") or "").strip()
        if not text:
            return model, latency, "ERROR (empty response)"
        return model, latency, "OK"
    except requests.Timeout:
        return model, 0, "ERROR (timeout)"
    except Exception as e:
        return model, 0, f"ERROR ({str(e)[:40]})"


def _call_gemini() -> tuple[str, float, str]:
    """Returns (model, latency, status)."""
    api_key = (os.environ.get("GEMINI_API_KEY") or "").strip()
    if not api_key:
        return "", 0, "SKIPPED (no API key)"
    model = (os.environ.get("GEMINI_MODEL") or "").strip() or DEFAULT_MODELS["gemini"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": TEST_PROMPT}]}],
        "generationConfig": {
            "temperature": _get_temp(),
            "maxOutputTokens": _get_max_tokens(),
        },
    }
    try:
        start = time.time()
        resp = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json=payload,
            params={"key": api_key},
            timeout=60,
        )
        latency = round(time.time() - start, 2)
        if not resp.ok:
            return model, latency, f"ERROR ({resp.status_code})"
        data = resp.json()
        candidates = data.get("candidates") or []
        if not candidates:
            return model, latency, "ERROR (empty response)"
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = (parts[0].get("text") or "").strip() if parts else ""
        if not text:
            return model, latency, "ERROR (empty response)"
        return model, latency, "OK"
    except requests.Timeout:
        return model, 0, "ERROR (timeout)"
    except Exception as e:
        return model, 0, f"ERROR ({str(e)[:40]})"


def _call_openrouter() -> tuple[str, float, str]:
    """Returns (model, latency, status)."""
    api_key = (os.environ.get("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        return "", 0, "SKIPPED (no API key)"
    model = (os.environ.get("OPENROUTER_MODEL") or "").strip() or DEFAULT_MODELS["openrouter"]
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return only valid JSON, no other text."},
            {"role": "user", "content": TEST_PROMPT},
        ],
        "temperature": _get_temp(),
        "max_tokens": _get_max_tokens(),
    }
    try:
        start = time.time()
        resp = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost",
                "X-Title": "MemoNext",
            },
            json=payload,
            timeout=60,
        )
        latency = round(time.time() - start, 2)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        text = ""
        if choices:
            msg = choices[0].get("message") or {}
            text = (msg.get("content") or "").strip()
        if not text:
            return model, latency, "ERROR (empty response)"
        return model, latency, "OK"
    except requests.Timeout:
        return model, 0, "ERROR (timeout)"
    except Exception as e:
        return model, 0, f"ERROR ({str(e)[:40]})"


def _call_openai() -> tuple[str, float, str]:
    """Returns (model, latency, status)."""
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return "", 0, "SKIPPED (no API key)"
    model = (os.environ.get("OPENAI_MODEL") or "").strip() or DEFAULT_MODELS["openai"]
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return only valid JSON, no other text."},
            {"role": "user", "content": TEST_PROMPT},
        ],
        "temperature": _get_temp(),
        "max_tokens": _get_max_tokens(),
    }
    try:
        start = time.time()
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
        latency = round(time.time() - start, 2)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        text = ""
        if choices:
            msg = choices[0].get("message") or {}
            text = (msg.get("content") or "").strip()
        if not text:
            return model, latency, "ERROR (empty response)"
        return model, latency, "OK"
    except requests.Timeout:
        return model, 0, "ERROR (timeout)"
    except Exception as e:
        return model, 0, f"ERROR ({str(e)[:40]})"


def _format_line(name: str, model: str, latency: float, status: str) -> str:
    """Format: Groq .......... OK (0.18s)"""
    dots = "." * max(0, 14 - len(name))
    if status == "OK":
        return f"{name} {dots} {status} ({latency}s)"
    if "SKIPPED" in status:
        return f"{name} {dots} {status}"
    if latency:
        return f"{name} {dots} {status} ({latency}s)"
    return f"{name} {dots} {status}"


def main() -> int:
    print("LLM Provider Status")
    print("-" * 50)

    providers = [
        ("Groq", _call_groq),
        ("Gemini", _call_gemini),
        ("OpenRouter", _call_openrouter),
    ]

    # OpenAI only if explicitly enabled
    if (os.environ.get("OPENAI_ENABLED") or "0").strip() == "1":
        providers.append(("OpenAI", _call_openai))
    else:
        providers.append(("OpenAI", lambda: ("", 0, "SKIPPED (disabled)")))

    any_failed = False
    for name, fn in providers:
        model, latency, status = fn()
        print(_format_line(name, model, latency, status))
        if status not in ("OK", "SKIPPED (no API key)", "SKIPPED (disabled)"):
            any_failed = True

    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
