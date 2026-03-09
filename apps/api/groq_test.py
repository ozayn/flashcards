#!/usr/bin/env python3
"""
Test utility for Groq API.

Run from apps/api:
  python groq_test.py

Requires GROQ_API_KEY in environment.
"""
import sys

# Ensure app is importable when run from apps/api
sys.path.insert(0, ".")

from app.utils.groq_test import main

if __name__ == "__main__":
    main()
