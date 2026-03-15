#!/usr/bin/env python3
"""
Standalone test for Together AI API.
Run: python tests/llm_providers/test_together.py
Requires: TOGETHER_API_KEY
Optional: TOGETHER_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
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

TEST_PROMPT = """Return STRICT JSON with this structure:

{
  "cards": [
    {
      "question": "...",
      "answer_short": "...",
      "answer_detailed": "..."
    }
  ]
}

Create one flashcard about Jupiter, king of the Roman gods."""
DEFAULT_MODEL = "meta-llama/Llama-3.1-8B-Instruct-Turbo"


def main() -> int:
    api_key = os.environ.get("TOGETHER_API_KEY", "").strip()
    if not api_key:
        print("Skipped: TOGETHER_API_KEY not set", file=sys.stderr)
        return 0

    model = os.environ.get("TOGETHER_MODEL", "").strip() or DEFAULT_MODEL

    try:
        import requests
    except ImportError:
        print("Error: requests not installed. pip install requests", file=sys.stderr)
        return 1

    temperature = float(os.environ.get("LLM_TEMPERATURE", "0.2"))
    max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "300"))

    url = "https://api.together.xyz/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "MemoNext",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": TEST_PROMPT},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    try:
        start = time.time()
        resp = requests.post(url, headers=headers, json=payload, timeout=120)
        latency = round(time.time() - start, 2)

        if not resp.ok:
            err_str = resp.text or ""
            if "read-only mode" in err_str:
                print("Provider: Together")
                print(f"Model: {model}")
                print(f"Latency: {latency} seconds")
                print("Status: Read-only (no billing credits)")
                return 0

        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    choices = data.get("choices") or []
    choice = choices[0] if choices else None
    message = choice.get("message") if choice else None
    text = (message.get("content") or "").strip() if message else ""
    if not text:
        print("Warning: No content returned from API", file=sys.stderr)

    print("Provider: Together")
    print(f"Model: {model}")
    print(f"Latency: {latency} seconds")
    print()

    usage = data.get("usage") or {}
    if usage:
        prompt_tok = usage.get("prompt_tokens", 0)
        completion_tok = usage.get("completion_tokens", 0)
        total_tok = usage.get("total_tokens") or (prompt_tok + completion_tok)
        print(f"Prompt tokens: {prompt_tok}")
        print(f"Completion tokens: {completion_tok}")
        print(f"Total tokens: {total_tok}")
        print()

    print("Response:")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
