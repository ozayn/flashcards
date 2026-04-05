"""
Test utility for Groq API.

Run from project root:
  ./scripts/groq_test.sh

Or from apps/api:
  python app/utils/groq_test.py

Requires GROQ_API_KEY in environment or apps/api/.env.
"""
import os
import subprocess
import sys
from pathlib import Path

# Auto-use venv if groq not installed (e.g. running without "source .venv/bin/activate")
try:
    import groq  # noqa: F401
except ImportError:
    venv_python = Path(__file__).resolve().parent.parent.parent / ".venv" / "bin" / "python"
    if venv_python.exists():
        subprocess.run([str(venv_python), __file__] + sys.argv[1:])
        sys.exit()

# Load .env from apps/api/app/ or apps/api/
def _load_env():
    for env_path in [
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
    ]:
        if env_path.exists():
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, _, val = line.partition("=")
                        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
            break


_load_env()


def main():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("Error: GROQ_API_KEY not set in environment", file=sys.stderr)
        sys.exit(1)

    try:
        from app.llm.direct_outbound import groq_client
    except ImportError:
        print(
            "Error: cannot import app package — run from apps/api, e.g.:\n"
            "  cd apps/api && python -m app.utils.groq_test\n"
            "Or use: ./scripts/groq_test.sh",
            file=sys.stderr,
        )
        sys.exit(1)

    client = groq_client(api_key)

    prompt = "Generate 2 flashcards about Greek mythology as JSON."
    print(f"Prompt: {prompt}\n")

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant. Return only valid JSON, no other text.",
            },
            {"role": "user", "content": prompt},
        ],
        model="llama-3.1-8b-instant",
    )

    response = chat_completion.choices[0].message.content
    print("Response:")
    print(response)


if __name__ == "__main__":
    main()
