"""
Test the FlashcardGenerationResponse schema validation.

Run from project root:
  ./scripts/validator_test.sh

Or from apps/api:
  python app/utils/test_flashcard_validator.py
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

# Auto-use venv if pydantic not installed
try:
    import pydantic  # noqa: F401
except ImportError:
    venv_python = Path(__file__).resolve().parent.parent.parent / ".venv" / "bin" / "python"
    if venv_python.exists():
        subprocess.run([str(venv_python), __file__] + sys.argv[1:])
        sys.exit()
    print("Error: pydantic not installed. Run: cd apps/api && source .venv/bin/activate && pip install pydantic", file=sys.stderr)
    sys.exit(1)

# Load generated_flashcards module directly (avoids app.schemas.__init__ -> models)
_spec = importlib.util.spec_from_file_location(
    "generated_flashcards",
    Path(__file__).resolve().parent.parent / "schemas" / "generated_flashcards.py",
)
_mod = importlib.util.module_from_spec(_spec)
sys.modules["generated_flashcards"] = _mod
_spec.loader.exec_module(_mod)

FlashcardGenerationResponse = _mod.FlashcardGenerationResponse
GeneratedFlashcard = _mod.GeneratedFlashcard


def test_valid_response():
    data = {
        "flashcards": [
            {"question": "Who is Zeus?", "answer_short": "King of the Greek gods.", "answer_detailed": None},
            {"question": "Who is Poseidon?", "answer_short": "God of the sea."},
        ]
    }
    validated = FlashcardGenerationResponse.model_validate(data)
    assert len(validated.flashcards) == 2
    assert validated.flashcards[0].question == "Who is Zeus?"
    assert validated.flashcards[0].answer_short == "King of the Greek gods."
    print("✓ Valid response: OK")


def test_answer_alias():
    """LLM sometimes returns 'answer' instead of 'answer_short'."""
    data = {
        "flashcards": [
            {"question": "Who is Zeus?", "answer": "King of the Greek gods."},
        ]
    }
    validated = FlashcardGenerationResponse.model_validate(data)
    assert validated.flashcards[0].answer_short == "King of the Greek gods."
    print("✓ Answer alias: OK")


def test_invalid_missing_question():
    data = {"flashcards": [{"answer_short": "Something"}]}
    try:
        FlashcardGenerationResponse.model_validate(data)
        assert False, "Should have raised"
    except Exception as e:
        print(f"✓ Invalid (missing question) correctly rejected: {type(e).__name__}")


if __name__ == "__main__":
    test_valid_response()
    test_answer_alias()
    test_invalid_missing_question()
    print("\nAll tests passed.")
