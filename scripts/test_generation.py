#!/usr/bin/env python3
"""
Test flashcard generation on various prompts.
Tests: formula vs non-formula, person, vocab, political exclusion, etc.
Requires: API running at http://localhost:8080
"""
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API = "http://localhost:8080"


def fetch_json(url: str, method: str = "GET", body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def get_user_id() -> str:
    users = fetch_json(f"{API}/users")
    if not users or not isinstance(users, list):
        raise RuntimeError("No users found")
    return users[0]["id"]


def create_deck(user_id: str, name: str) -> str:
    deck = fetch_json(
        f"{API}/decks",
        method="POST",
        body={"user_id": user_id, "name": name, "source_type": "manual"},
    )
    return deck["id"]


def generate_flashcards(deck_id: str, topic: str, num_cards: int = 3) -> dict:
    return fetch_json(
        f"{API}/generate-flashcards",
        method="POST",
        body={"deck_id": deck_id, "topic": topic, "num_cards": num_cards, "language": "en"},
    )


def get_flashcards(deck_id: str) -> list:
    return fetch_json(f"{API}/decks/{deck_id}/flashcards?due_only=false")


def main():
    print("=" * 60)
    print("Flashcard Generation Test")
    print("=" * 60)

    try:
        user_id = get_user_id()
        print(f"Using user_id: {user_id[:8]}...")
    except Exception as e:
        print(f"ERROR: Could not get user: {e}")
        sys.exit(1)

    tests = [
        ("Formula: calculus equations", "calculus equations", True),   # expect LaTeX
        ("Non-formula: cognitive biases", "cognitive biases", False),  # no LaTeX
        ("Non-formula: logical fallacies", "logical fallacies", False),  # fallacy excluded
        ("Person: Who is Hafez?", "Who is Hafez?", False),
        ("Political: Bonapartism", "Bonapartism", False),
        ("Vocab: Spanish to English vocabulary", "Spanish to English vocabulary", False),
        ("Simple: famous street photographers", "famous street photographers", False),
    ]

    results = []
    for name, topic, expect_formula in tests:
        print(f"\n--- {name} ---")
        print(f"Topic: {topic}")
        deck_id = create_deck(user_id, f"Test: {topic[:30]}")
        try:
            gen = generate_flashcards(deck_id, topic, num_cards=3)
            created = gen.get("created", 0)
            print(f"Created: {created} cards")

            if created > 0:
                cards = get_flashcards(deck_id)
                has_latex = any("$$" in (c.get("answer_short") or "") for c in cards)
                has_single_dollar = any(
                    "$" in (c.get("answer_short") or "") and "$$" not in (c.get("answer_short") or "")
                    for c in cards
                )
                print(f"Has $$ LaTeX: {has_latex}")
                if has_single_dollar:
                    print("WARNING: Single $ found (should be $$ for formula topics)")

                if expect_formula and not has_latex:
                    results.append((name, "WARN", f"Expected LaTeX for formula topic, got {created} cards"))
                elif not expect_formula and has_latex:
                    results.append((name, "WARN", f"Unexpected LaTeX for non-formula topic"))
                else:
                    results.append((name, "PASS", f"{created} cards, LaTeX={has_latex} (expected={expect_formula})"))

                # Show first card
                if cards:
                    q = cards[0].get("question", "")[:80]
                    a = (cards[0].get("answer_short") or "")[:120]
                    print(f"Sample Q: {q}...")
                    print(f"Sample A: {a}...")
            else:
                results.append((name, "FAIL", "No cards created"))
        except HTTPError as e:
            body = e.read().decode() if e.fp else ""
            results.append((name, "FAIL", f"HTTP {e.code}: {body[:200]}"))
            print(f"FAIL: HTTP {e.code}")
        except Exception as e:
            results.append((name, "ERROR", str(e)))
            print(f"ERROR: {e}")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, status, msg in results:
        print(f"  {status}: {name}")
        print(f"       {msg}")


if __name__ == "__main__":
    main()
