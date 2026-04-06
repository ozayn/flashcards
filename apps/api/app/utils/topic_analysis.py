"""Analyze topic for flashcard generation: language detection and vocabulary/slang hints."""
from __future__ import annotations

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


def _is_mostly_latin(text: str) -> bool:
    """Return True if the text is mostly Latin/ASCII characters."""
    if not text:
        return False
    latin = sum(1 for c in text if c.isascii() and (c.isalpha() or c.isspace()))
    return latin / len(text) >= 0.8


def detect_language(topic: str) -> str | None:
    """Detect the language of the topic. Returns ISO 639-1 code or None if detection fails."""
    topic = (topic or "").strip()
    if not topic:
        return None
    try:
        from langdetect import DetectorFactory, detect
        DetectorFactory.seed = 0  # Deterministic results
        return detect(topic)
    except Exception:
        pass
    # Fallback: if topic is mostly Latin characters, assume English
    if len(topic) >= 2 and _is_mostly_latin(topic):
        return "en"
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


TRANSLATION_VOCAB_HINTS = (
    "translate", "translation", "to english", "to spanish", "to french", "to german",
    "to persian", "to arabic", "english to", "spanish to", "french to", "german to",
    "persian vocabulary", "spanish vocabulary", "french vocabulary", "german vocabulary",
    "arabic vocabulary", "english vocabulary",
)


def is_translation_vocab_topic(topic: str) -> bool:
    """Return True if the topic suggests translation flashcards (word in L1 → translation in L2)."""
    if not topic:
        return False
    lower = topic.lower().strip()
    if not any(kw in lower for kw in VOCAB_KEYWORDS):
        return False
    return any(h in lower for h in TRANSLATION_VOCAB_HINTS)


LOANWORD_VOCAB_HINTS = (
    "loanword", "loanwords", "loan word", "borrowed", "borrowed words",
    "french loanwords", "french loanwords in persian", "french origin",
    "persian loanwords", "words of french origin",
)


def is_loanword_vocab_topic(topic: str) -> bool:
    """Return True if the topic suggests loanword flashcards (e.g. Persian word → French origin)."""
    if not topic:
        return False
    lower = topic.lower().strip()
    if not any(kw in lower for kw in VOCAB_KEYWORDS):
        return False
    return any(h in lower for h in LOANWORD_VOCAB_HINTS)


# RTL language codes - when detected, keep output in that language
RTL_LANGS = {"ar", "fa", "he", "ur"}

# Language names for explicit instructions (avoids LLM guessing wrong language)
LANG_NAMES: dict[str, str] = {
    "en": "English",
    "fa": "Persian",
    "ar": "Arabic",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "he": "Hebrew",
    "ur": "Urdu",
}


def build_language_instruction(topic: str, language_hint: str | None = None) -> str:
    """Build explicit language instruction for the LLM.
    If language_hint is provided (e.g. 'en'), use it. Otherwise detect from topic."""
    lang = language_hint or detect_language(topic)
    if not lang:
        return "Generate flashcards in the same language as the topic."
    lang = lang.lower()[:2]
    lang_name = LANG_NAMES.get(lang, lang)
    if lang == "en":
        return (
            "CRITICAL: Generate ALL questions and answers in English ONLY. "
            "Do not use German, Persian, Arabic, Farsi, or any other language."
        )
    if lang in RTL_LANGS:
        return (
            f"Generate ALL flashcards in {lang_name}. "
            "Use RTL text naturally. Do not translate into English."
        )
    return f"Generate ALL flashcards in {lang_name}."


def is_language_learning_request(topic: str) -> bool:
    """Return True if topic explicitly asks for language learning (translation, loanwords). Allow bilingual output."""
    return is_translation_vocab_topic(topic) or is_loanword_vocab_topic(topic)


def _resolve_monolingual_output_code(topic: str, text: str, language_hint: str | None) -> str:
    """ISO 639-1 for flashcard output when not a translation/vocab-special topic."""
    text_str = (text or "").strip()
    topic_str = (topic or "").strip()
    source = text_str if len(text_str) > 20 else (topic_str or text_str)
    lang = (language_hint or (detect_language(source) if source else None)) or "en"
    return lang.lower()[:2]


def resolve_generation_language_code(topic: str, text: str, language_hint: str | None) -> str:
    """ISO 639-1 (or 'bilingual') matching build_language_rule — for logging."""
    if is_language_learning_request(topic or ""):
        return "bilingual"
    return _resolve_monolingual_output_code(topic, text, language_hint)


def build_language_rule(topic: str, text: str, language_hint: str | None) -> str:
    """Build language rule for TOP of prompt. Single source of truth for output language.
    Place immediately after JSON_HEADER. Language detection: text (>20 chars) over topic."""
    if is_language_learning_request(topic or ""):
        return ""  # Bilingual allowed; vocab-specific instructions handle it
    code = _resolve_monolingual_output_code(topic, text, language_hint)
    lang_name = LANG_NAMES.get(code, code)
    return f"""
LANGUAGE REQUIREMENT (HIGHEST PRIORITY):
- ALL output (questions AND answers) MUST be in {lang_name}
- DO NOT use English unless explicitly requested
- DO NOT mix languages
- If the topic is {lang_name} → output MUST be {lang_name}
- If you output in the wrong language, the response is INVALID
"""


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
