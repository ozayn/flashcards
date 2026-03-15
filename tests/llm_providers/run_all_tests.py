#!/usr/bin/env python3
"""
Run all LLM provider tests. Only runs tests for providers with API keys set.
Run: python tests/llm_providers/run_all_tests.py
"""
import os
import subprocess
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent

PROVIDERS = [
    ("Groq", "test_groq.py", "GROQ_API_KEY"),
    ("OpenAI", "test_openai.py", "OPENAI_API_KEY"),
    ("OpenRouter", "test_openrouter.py", "OPENROUTER_API_KEY"),
    ("Gemini", "test_gemini.py", "GEMINI_API_KEY"),
    ("Ollama", "test_ollama.py", "OLLAMA_BASE_URL"),  # Ollama: base URL or default localhost
]


def has_key(name: str, env_var: str) -> bool:
    if name == "Ollama":
        # Ollama works without env var (defaults to localhost)
        return True
    return bool(os.environ.get(env_var, "").strip())


def run_test(script: str) -> bool:
    result = subprocess.run(
        [sys.executable, str(TESTS_DIR / script)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return result.returncode == 0


def main() -> int:
    print("Provider tests")
    print("-" * 40)

    any_failed = False
    for display_name, script, env_var in PROVIDERS:
        if not has_key(display_name, env_var):
            pad = " " * (14 - len(display_name))
            print(f"{display_name}{pad} SKIPPED (no key)")
            continue

        ok = run_test(script)
        pad = " " * (14 - len(display_name))
        status = "OK" if ok else "FAILED"
        print(f"{display_name}{pad} {status}")
        if not ok:
            any_failed = True

    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
