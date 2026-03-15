#!/usr/bin/env python3
"""
Standalone test for OpenAI API.

Run:
python tests/llm_providers/test_openai.py

Requires:
OPENAI_API_KEY
Optional:
OPENAI_MODEL
"""

import os
import sys
import time
from pathlib import Path

# Load .env
for p in [Path(__file__).resolve().parents[2] / "apps" / "api" / ".env"]:
    if p.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(p)
        except ImportError:
            pass
        break

TEST_PROMPT = "Return STRICT JSON with one flashcard about Jupiter (Roman god)."
DEFAULT_MODEL = "gpt-4o-mini"


def main():
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("Skipped: OPENAI_API_KEY not set", file=sys.stderr)
        return 0

    model = os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_MODEL

    try:
        from openai import OpenAI
    except ImportError:
        print("Error: pip install openai", file=sys.stderr)
        return 1

    client = OpenAI(api_key=api_key)

    try:
        start = time.time()

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": TEST_PROMPT}
            ],
            temperature=float(os.environ.get("LLM_TEMPERATURE", "0.2")),
            max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "300")),
        )

        latency = round(time.time() - start, 2)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    text = resp.choices[0].message.content.strip()

    usage = resp.usage

    print("Provider: OpenAI")
    print(f"Model: {model}")
    print(f"Latency: {latency} seconds")
    print()

    if usage:
        print(f"Prompt tokens: {usage.prompt_tokens}")
        print(f"Completion tokens: {usage.completion_tokens}")
        print(f"Total tokens: {usage.total_tokens}")
        print()

    print("Response:")
    print(text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
