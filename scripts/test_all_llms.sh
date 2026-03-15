#!/bin/bash
# Run LLM provider status test using API venv
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
PYTHON="$PROJECT_ROOT/apps/api/.venv313/bin/python"
if [ ! -f "$PYTHON" ]; then
  PYTHON="$PROJECT_ROOT/apps/api/.venv/bin/python"
fi
"$PYTHON" tests/test_all_llms.py
