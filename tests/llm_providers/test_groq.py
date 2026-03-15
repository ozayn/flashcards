#!/usr/bin/env python3
"""
Standalone test for Groq API.
Run: python tests/llm_providers/test_groq.py
Requires: GROQ_API_KEY
Optional: GROQ_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS
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

TEST_PROMPT = "Return a JSON object with one flashcard about Jupiter (Roman god)."
DEFAULT_MODEL = "llama-3.1-8b-instant"


def main() -> int:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        print("Error: GROQ_API_KEY not set in environment", file=sys.stderr)
        return 1

    model = os.environ.get("GROQ_MODEL", "").strip() or DEFAULT_MODEL
    temp = float(os.environ.get("LLM_TEMPERATURE", "0.3"))
    max_tokens = os.environ.get("LLM_MAX_TOKENS")
    max_tokens = int(max_tokens) if max_tokens and max_tokens.strip() else None

    try:
        from groq import Groq
    except ImportError:
        print("Error: groq not installed. pip install groq", file=sys.stderr)
        return 1

    try:
        client = Groq(api_key=api_key)
        kwargs = {
            "model": model,
            "messages": [
                {"role": "system", "content": "Return only valid JSON, no other text."},
                {"role": "user", "content": TEST_PROMPT},
            ],
            "temperature": temp,
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        start = time.time()
        response = client.chat.completions.create(**kwargs)
        latency = round(time.time() - start, 2)

        choice = response.choices[0] if response.choices else None
        text = ""
        if choice and getattr(choice, "message", None):
            text = (choice.message.content or "").strip()
        if not text:
            print("Warning: No content returned from API", file=sys.stderr)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print("Provider: Groq")
    print(f"Model: {model}")
    print(f"Latency: {latency} seconds")
    print()
    print("Response:")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
