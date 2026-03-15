#!/usr/bin/env python3
"""
Standalone test for Google Gemini API.
Run: python tests/llm_providers/test_gemini.py
Requires: GEMINI_API_KEY
Optional: GEMINI_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
"""
import os
import sys
import time
from pathlib import Path

# Load .env from apps/api if present
for p in [Path(__file__).resolve().parents[2] / "apps" / "api" / ".env"]:
    if p.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(p)
        except ImportError:
            pass
        break

TEST_PROMPT = "Return STRICT JSON with one flashcard about Jupiter (Roman god)."
DEFAULT_MODEL = "gemini-2.5-flash"


def main() -> int:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("Skipped: GEMINI_API_KEY not set", file=sys.stderr)
        return 0

    model = os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_MODEL

    try:
        import requests
    except ImportError:
        print("Error: requests not installed. pip install requests", file=sys.stderr)
        return 1

    temperature = float(os.environ.get("LLM_TEMPERATURE", "0.2"))
    max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "300"))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": TEST_PROMPT},
                ],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }

    print("API key loaded:", bool(api_key))
    print("API key length:", len(api_key))

    try:
        start = time.time()
        resp = requests.post(
            url,
            headers=headers,
            json=payload,
            params={"key": api_key},
            timeout=120,
        )
        latency = round(time.time() - start, 2)
        if not resp.ok:
            print("Gemini API error:", resp.text, file=sys.stderr)
            return 1
        data = resp.json()
    except requests.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    text = ""
    candidates = data.get("candidates") or []
    if candidates:
        content = candidates[0].get("content") or {}
        parts = content.get("parts") or []
        if parts:
            text = (parts[0].get("text") or "").strip()
    if not text:
        print("Warning: No content returned from API", file=sys.stderr)

    print("Provider: Gemini")
    print(f"Model: {model}")
    print(f"Latency: {latency} seconds")
    print()

    usage = data.get("usageMetadata") or {}
    if usage:
        print("Prompt tokens:", usage.get("promptTokenCount"))
        print("Completion tokens:", usage.get("candidatesTokenCount"))
        print("Total tokens:", usage.get("totalTokenCount"))
        print()

    print("Response:")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
