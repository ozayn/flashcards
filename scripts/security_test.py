#!/usr/bin/env python3
"""
Text Input Security Test Script
Runs API-level tests from the security checklist.
Requires: API running at http://localhost:8080, a valid user_id.
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
    with urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def get_user_id() -> str:
    users = fetch_json(f"{API}/users")
    if not users or not isinstance(users, list):
        raise RuntimeError("No users found")
    return users[0]["id"]


def create_deck(user_id: str, name: str = "Security Test Deck") -> str:
    deck = fetch_json(
        f"{API}/decks",
        method="POST",
        body={"user_id": user_id, "name": name, "source_type": "manual"},
    )
    return deck["id"]


def generate_flashcards(deck_id: str, topic: str | None = None, text: str | None = None) -> dict:
    body: dict = {"deck_id": deck_id, "num_cards": 5, "language": "en"}
    if topic:
        body["topic"] = topic
    if text:
        body["text"] = text
    return fetch_json(f"{API}/generate-flashcards", method="POST", body=body)


def main():
    results = []
    user_id = get_user_id()
    deck_id = create_deck(user_id)

    # --- 1. XSS Script Injection (API accepts, generation may include; frontend must escape) ---
    print("Test 1: XSS Script Injection...")
    try:
        gen = generate_flashcards(
            deck_id,
            text='<script>alert("XSS test")</script>\nRoman gods include Jupiter and Mars.',
        )
        results.append(("1. XSS Script Injection", "PASS", f"Generated {gen.get('created', 0)} cards"))
    except HTTPError as e:
        results.append(("1. XSS Script Injection", "FAIL" if e.code == 500 else "PASS", str(e.code)))
    except Exception as e:
        results.append(("1. XSS Script Injection", "ERROR", str(e)))

    deck_id2 = create_deck(user_id, "Security Test 2")

    # --- 2. HTML Injection (same as above - API accepts, frontend must escape) ---
    print("Test 2: HTML Injection...")
    try:
        gen = generate_flashcards(
            deck_id2,
            text="<h1>Injected Title</h1>\n<b>Jupiter is the king of the gods</b>",
        )
        results.append(("2. HTML Injection", "PASS", f"Generated {gen.get('created', 0)} cards"))
    except HTTPError as e:
        results.append(("2. HTML Injection", "FAIL" if e.code == 500 else "PASS", str(e.code)))
    except Exception as e:
        results.append(("2. HTML Injection", "ERROR", str(e)))

    deck_id3 = create_deck(user_id, "Security Test 3")

    # --- 4. Control Characters ---
    print("Test 4: Control Characters...")
    try:
        # Mars + control chars (0x00-0x1F except \n\t) + "god of war"
        control_chars = "".join(chr(i) for i in range(32) if i not in (9, 10))
        gen = generate_flashcards(
            deck_id3,
            text=f"Mars{control_chars}god of war",
        )
        results.append(("4. Control Characters", "PASS", f"Generated {gen.get('created', 0)} cards"))
    except HTTPError as e:
        results.append(("4. Control Characters", "FAIL" if e.code == 500 else "PASS", str(e.code)))
    except Exception as e:
        results.append(("4. Control Characters", "ERROR", str(e)))

    deck_id4 = create_deck(user_id, "Security Test 4")

    # --- 5. Oversized Input ---
    print("Test 5: Oversized Input...")
    try:
        gen = generate_flashcards(deck_id4, text="x" * 10001)
        results.append(("5. Oversized Input", "FAIL", "Backend should have rejected"))
    except HTTPError as e:
        if e.code == 400:
            results.append(("5. Oversized Input", "PASS", "Backend returned HTTP 400"))
        else:
            results.append(("5. Oversized Input", "FAIL", f"Expected 400, got {e.code}"))
    except Exception as e:
        results.append(("5. Oversized Input", "ERROR", str(e)))

    deck_id5 = create_deck(user_id, "Security Test 5")

    # --- 6. JavaScript URL (API accepts; frontend must not render as link) ---
    print("Test 6: JavaScript URL Injection...")
    try:
        gen = generate_flashcards(
            deck_id5,
            text='<a href="javascript:alert(1)">Click me</a>\nRoman religion involved many gods.',
        )
        results.append(("6. JavaScript URL Injection", "PASS", f"Generated {gen.get('created', 0)} cards"))
    except HTTPError as e:
        results.append(("6. JavaScript URL Injection", "FAIL" if e.code == 500 else "PASS", str(e.code)))
    except Exception as e:
        results.append(("6. JavaScript URL Injection", "ERROR", str(e)))

    deck_id6 = create_deck(user_id, "Security Test 6")

    # --- 7. Unicode / Directional Characters ---
    print("Test 7: Unicode / Directional Characters...")
    try:
        # U+202E is Right-to-Left Override
        gen = generate_flashcards(
            deck_id6,
            text='Mars \u202ealert("hack")\u202c',
        )
        results.append(("7. Unicode / Directional Characters", "PASS", f"Generated {gen.get('created', 0)} cards"))
    except HTTPError as e:
        results.append(("7. Unicode / Directional Characters", "FAIL" if e.code == 500 else "PASS", str(e.code)))
    except Exception as e:
        results.append(("7. Unicode / Directional Characters", "ERROR", str(e)))

    deck_id7 = create_deck(user_id, "Security Test 7")

    # --- 8. SQL-style Injection ---
    print("Test 8: SQL-style Injection...")
    try:
        gen = generate_flashcards(
            deck_id7,
            text="'); DROP TABLE decks; --\nMars was the Roman god of war.",
        )
        results.append(("8. SQL-style Injection", "PASS", f"Generated {gen.get('created', 0)} cards, no DB error"))
    except HTTPError as e:
        results.append(("8. SQL-style Injection", "FAIL" if e.code == 500 else "PASS", str(e.code)))
    except Exception as e:
        results.append(("8. SQL-style Injection", "ERROR", str(e)))

    # --- Summary ---
    print("\n" + "=" * 60)
    print("SECURITY TEST RESULTS")
    print("=" * 60)
    for name, status, detail in results:
        symbol = "✓" if status == "PASS" else ("✗" if status == "FAIL" else "?")
        print(f"  {symbol} {name}: {status} - {detail}")
    passed = sum(1 for _, s, _ in results if s == "PASS")
    print("=" * 60)
    print(f"  {passed}/{len(results)} tests passed")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
