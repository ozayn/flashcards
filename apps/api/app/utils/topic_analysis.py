"""Analyze topic for flashcard generation: language detection and vocabulary/slang hints."""

import re

# Vocabulary/slang keywords (case-insensitive) that suggest definition-style flashcards
VOCAB_KEYWORDS = (
    "vocabulary", "vocab", "slang", "words", "phrases", "expressions",
    "idioms", "definitions", "terms", "meanings", "lexicon",
    "مفردات", "كلمات", "تعابير",  # Arabic
    "vocabulario", "palabras", "expresiones",  # Spanish
    "vocabulaire", "mots", "expressions",  # French
    "Wortschatz", "Wörter", "Ausdrücke",  # German
)


def detect_language(topic: str) -> str | None:
    """Detect the language of the topic. Returns ISO 639-1 code or None if detection fails."""
    topic = (topic or "").strip()
    if not topic or len(topic) < 3:
        return None
    try:
        from langdetect import DetectorFactory, detect
        DetectorFactory.seed = 0  # Deterministic results
        return detect(topic)
    except Exception:
        return None


def is_vocabulary_topic(topic: str) -> bool:
    """Return True if the topic suggests vocabulary/slang/definition-style flashcards."""
    if not topic:
        return False
    lower = topic.lower().strip()
    # Check for vocabulary-related keywords
    for kw in VOCAB_KEYWORDS:
        if kw in lower:
            return True
    # Single word/phrase in quotes often indicates a vocabulary request
    quoted = re.search(r'^["\'](.+)["\']\s*$', topic.strip())
    if quoted and len(quoted.group(1)) < 80:
        return True
    return False


def build_language_instruction(topic: str) -> str:
    """Build the language instruction for the LLM based on detected topic language."""
    lang = detect_language(topic)
    if lang:
        return "The flashcards must be written in the same language as the topic."
    return ""


def build_vocab_instruction(topic: str) -> str:
    """Build vocabulary/definition-style instruction if the topic suggests it."""
    if not is_vocabulary_topic(topic):
        return ""
    return """
For vocabulary/slang topics, use definition-style flashcards:
- Question format: What does "[word/phrase]" mean? (or equivalent in the topic's language)
- Answer: The definition or meaning.
Example: Question: What does "نخ دادن" mean? Answer: To subtly show romantic interest.
"""
