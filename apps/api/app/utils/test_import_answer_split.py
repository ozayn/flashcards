"""Run: cd apps/api && PYTHONPATH=. python app/utils/test_import_answer_split.py"""

from app.utils.import_answer_split import (
    resolve_import_answer_fields,
    split_import_answer_on_example_marker,
)


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def main() -> None:
    main_a, ex = split_import_answer_on_example_marker(
        "A short definition.\n\nExample: The quick brown fox."
    )
    _assert(main_a == "A short definition.", main_a)
    _assert(ex == "The quick brown fox.", ex)

    main_b, ex_b = split_import_answer_on_example_marker("One line\nExamples:\nFirst\nSecond")
    _assert(main_b == "One line", main_b)
    _assert(ex_b == "First\nSecond", ex_b)

    # Same-line "A: ... Example: ..." (no newline before Example) — common re-import shape
    one, one_ex = split_import_answer_on_example_marker(
        "The capital of France is Paris. Example: The Louvre is located there."
    )
    _assert(one == "The capital of France is Paris.", one)
    _assert(one_ex == "The Louvre is located there.", one_ex)

    # Q/A paste: continuation lines after A: include a line-start Example:
    qa, qa_ex = split_import_answer_on_example_marker(
        "The process by which plants convert light to chemical energy.\n"
        "\n"
        "Example:\n"
        "A leaf absorbing sunlight on a sunny day."
    )
    _assert(
        qa == "The process by which plants convert light to chemical energy.",
        qa,
    )
    _assert(qa_ex == "A leaf absorbing sunlight on a sunny day.", qa_ex)

    # Mid-sentence "Example:" without line break or sentence end — do not split
    inline = "See Example: not a heading."
    whole, none_ex = split_import_answer_on_example_marker(inline)
    _assert(whole == inline, whole)
    _assert(none_ex is None, none_ex)

    # Leading Example: only — would empty main; conservative no split
    only_ex, ex2 = split_import_answer_on_example_marker("Example: only this")
    _assert(only_ex == "Example: only this", only_ex)
    _assert(ex2 is None, ex2)

    # Counterexample — word boundary should not match as line-start "Examples?"
    ce = "A lemma.\nCounterexample: a cycle of odd length."
    m_ce, e_ce = split_import_answer_on_example_marker(ce)
    _assert(m_ce == ce.strip(), m_ce)
    _assert(e_ce is None, str(e_ce))

    # Skip false split after "e.g." before "Example:"
    eg = "Many species exist, e.g. canids. Example: the domestic dog."
    eg_m, eg_e = split_import_answer_on_example_marker(eg)
    _assert("canids" in eg_m, eg_m)
    _assert(eg_e is not None and "domestic dog" in eg_e, eg_e)

    # Explicit answer_example from client wins; no split of answer_short
    s, e = resolve_import_answer_fields("Def\nExample: x", "already set")
    _assert(s == "Def\nExample: x", s)
    _assert(e == "already set", e)

    print("import_answer_split: ok")


if __name__ == "__main__":
    main()
