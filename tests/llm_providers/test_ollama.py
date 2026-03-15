#!/usr/bin/env python3
"""
Standalone test for Ollama (local models).
Run: python tests/llm_providers/test_ollama.py
Requires: OLLAMA_BASE_URL (defaults to http://localhost:11434)
Optional: OLLAMA_MODEL, LLM_TEMPERATURE
No API key needed for local Ollama.
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
DEFAULT_MODEL = "llama3.2"
DEFAULT_BASE_URL = "http://localhost:11434"


def main() -> int:
    base_url = (os.environ.get("OLLAMA_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    url = f"{base_url}/api/chat"
    model = os.environ.get("OLLAMA_MODEL", "").strip() or DEFAULT_MODEL
    temp = float(os.environ.get("LLM_TEMPERATURE", "0.3"))

    try:
        import requests
    except ImportError:
        print("Error: requests not installed. pip install requests", file=sys.stderr)
        return 1

    try:
        start = time.time()
        resp = requests.post(
            url,
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "Return only valid JSON, no other text."},
                    {"role": "user", "content": TEST_PROMPT},
                ],
                "stream": False,
                "options": {"temperature": temp},
            },
            timeout=120,
        )
        latency = round(time.time() - start, 2)
        resp.raise_for_status()
        data = resp.json()
        message = data.get("message") if isinstance(data.get("message"), dict) else None
        text = (message.get("content") or "").strip() if message else ""
        if not text:
            print("Warning: No content returned from API", file=sys.stderr)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print("Provider: Ollama")
    print(f"Model: {model}")
    print(f"Base URL: {base_url}")
    print(f"Latency: {latency} seconds")
    print()
    print("Response:")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
