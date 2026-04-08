"""Conservative split of import answer text on Example:/Examples: markers."""

import re

# Line starts (after optional indent) with "Example:" or "Examples:" as a whole word
# (\b avoids matching e.g. "Counterexample:").
_EXAMPLE_LINE = re.compile(
    r"^[\t\f\v ]*\bExamples?\s*:\s*",
    re.IGNORECASE | re.MULTILINE,
)

# After sentence-ending punctuation, optional whitespace, then Examples? (same line or wrapped).
_EXAMPLE_AFTER_SENTENCE = re.compile(
    r"(?<=[.!?…])(\s+)(\bExamples?\s*:\s*)",
    re.IGNORECASE,
)

def split_import_answer_on_example_marker(raw: str) -> tuple[str, str | None]:
    """If raw has a clear Examples? section, return (main, example_body).

    Tries, in order:
    1) Line-leading ``Example:`` / ``Examples:`` (own line, after optional indent).
    2) Same-line marker only after ``.`` ``!`` ``?`` or ``…``, e.g. ``...text. Example: ...``.

    Otherwise return (stripped raw, None). Never returns an empty main when splitting.

    Skips ambiguous cases such as ``3. Example:`` (digit before the period) and lines
    ending in ``for`` immediately before ``example:`` (``for example:``).
    """
    if raw is None:
        return "", None
    text = raw.replace("\r\n", "\n").replace("\r", "\n")

    m = _EXAMPLE_LINE.search(text)
    if m:
        before = text[: m.start()].rstrip()
        after = text[m.end() :].lstrip()
        if before.strip() and after.strip():
            return before.strip(), after.strip()

    for m2 in _EXAMPLE_AFTER_SENTENCE.finditer(text):
        gap_start = m2.start()
        prefix = text[:gap_start].rstrip()
        if not prefix.strip():
            continue
        if re.search(r"\bfor\s*$", prefix.rstrip(), re.IGNORECASE):
            continue
        if re.search(r"\d\.\s*$", prefix):
            continue
        if re.search(r"\b(?:e\.g\.|i\.e\.)\s*$", prefix, re.IGNORECASE):
            continue
        after = text[m2.end() :].lstrip()
        if after.strip():
            return prefix.strip(), after.strip()

    return text.strip(), None


def resolve_import_answer_fields(
    answer_short: str,
    answer_example: str | None,
) -> tuple[str, str | None]:
    """Apply Example-marker split only when the client did not already send an example."""
    if answer_example is not None and answer_example.strip() != "":
        return answer_short.strip(), answer_example.strip()
    return split_import_answer_on_example_marker(answer_short)
