#!/usr/bin/env python3
"""
Benchmark LLM providers for MemoNext.
Compares latency, response length, and success across Groq, OpenAI, OpenRouter, Gemini, Ollama.
Run: python tests/llm_providers/benchmark_models.py
"""
import os
import sys
import time
from pathlib import Path
from typing import Optional

# Load .env from apps/api if present
for p in [Path(__file__).resolve().parents[2] / "apps" / "api" / ".env"]:
    if p.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(p)
        except ImportError:
            pass
        break

TEST_PROMPT = "Return a JSON object with one flashcard about Jupiter (Roman god)."
MESSAGES = [
    {"role": "system", "content": "Return only valid JSON, no other text."},
    {"role": "user", "content": TEST_PROMPT},
]


def _run_groq() -> tuple[Optional[float], Optional[int], str, str]:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return None, None, "SKIPPED (no key)", ""
    model = os.environ.get("GROQ_MODEL", "").strip() or "llama-3.1-8b-instant"
    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        start = time.time()
        response = client.chat.completions.create(
            model=model,
            messages=MESSAGES,
            temperature=0.3,
        )
        latency = round(time.time() - start, 2)
        choice = response.choices[0] if response.choices else None
        text = ""
        if choice and getattr(choice, "message", None):
            text = (choice.message.content or "").strip()
        return latency, len(text), "OK" if text else "FAILED (empty)", model
    except Exception as e:
        return None, None, f"FAILED ({e!s})", model


def _run_openai() -> tuple[Optional[float], Optional[int], str, str]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None, None, "SKIPPED (no key)", ""
    model = os.environ.get("OPENAI_MODEL", "").strip() or "gpt-4o-mini"
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        start = time.time()
        response = client.chat.completions.create(
            model=model,
            messages=MESSAGES,
            temperature=0.3,
        )
        latency = round(time.time() - start, 2)
        choice = response.choices[0] if response.choices else None
        text = ""
        if choice and getattr(choice, "message", None):
            text = (choice.message.content or "").strip()
        return latency, len(text), "OK" if text else "FAILED (empty)", model
    except Exception as e:
        return None, None, f"FAILED ({e!s})", model


def _run_openrouter() -> tuple[Optional[float], Optional[int], str, str]:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        return None, None, "SKIPPED (no key)", ""
    model = os.environ.get("OPENROUTER_MODEL", "").strip() or "openai/gpt-3.5-turbo"
    try:
        import requests
        payload = {"model": model, "messages": MESSAGES, "temperature": 0.3}
        start = time.time()
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
        latency = round(time.time() - start, 2)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        choice = choices[0] if choices else None
        message = choice.get("message") if choice else None
        text = (message.get("content") or "").strip() if message else ""
        return latency, len(text), "OK" if text else "FAILED (empty)", model
    except Exception as e:
        return None, None, f"FAILED ({e!s})", model


def _run_gemini() -> tuple[Optional[float], Optional[int], str, str]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None, None, "SKIPPED (no key)", ""
    model = os.environ.get("GEMINI_MODEL", "").strip() or "gemini-2.5-flash"
    try:
        import requests
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": TEST_PROMPT}]}],
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 500},
        }
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
            return None, None, f"FAILED ({resp.status_code})", model
        data = resp.json()
        candidates = data.get("candidates") or []
        text = ""
        if candidates:
            parts = (candidates[0].get("content") or {}).get("parts") or []
            if parts:
                text = (parts[0].get("text") or "").strip()
        return latency, len(text), "OK" if text else "FAILED (empty)", model
    except Exception as e:
        return None, None, f"FAILED ({e!s})", model


def _run_ollama() -> tuple[Optional[float], Optional[int], str, str]:
    base_url = (os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "").strip() or "llama3.2"
    try:
        import requests
        start = time.time()
        resp = requests.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": MESSAGES,
                "stream": False,
                "options": {"temperature": 0.3},
            },
            timeout=120,
        )
        latency = round(time.time() - start, 2)
        resp.raise_for_status()
        data = resp.json()
        message = data.get("message") if isinstance(data.get("message"), dict) else None
        text = (message.get("content") or "").strip() if message else ""
        return latency, len(text), "OK" if text else "FAILED (empty)", model
    except Exception as e:
        return None, None, f"FAILED ({e!s})", model


def main() -> int:
    providers = [
        ("Groq", _run_groq),
        ("OpenAI", _run_openai),
        ("OpenRouter", _run_openrouter),
        ("Gemini", _run_gemini),
        ("Ollama", _run_ollama),
    ]

    print("LLM Benchmark")
    print("-" * 40)

    results = []
    for name, run_fn in providers:
        latency, length, status, model = run_fn()
        results.append((name, model, latency, length, status))

        if status.startswith("SKIPPED"):
            print(f"\n{name}")
            print(f"Status: {status}")
        else:
            print(f"\n{name} ({model})")
            if latency is not None:
                print(f"Latency: {latency}s")
            if length is not None:
                print(f"Response length: {length} chars")
            print(f"Status: {status}")

    print("\n" + "=" * 40)
    print("Summary")
    print("-" * 40)
    print(f"{'Provider':<12} | {'Model':<40} | {'Latency':<8} | Status")
    print("-" * 90)
    for name, model, latency, length, status in results:
        lat_str = f"{latency}s" if latency is not None else "-"
        status_short = status[:60] + "..." if len(status) > 63 else status
        print(f"{name:<12} | {model:<40} | {lat_str:<8} | {status_short}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
