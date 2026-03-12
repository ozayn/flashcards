#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT/apps/api"
if [ -d .venv313 ]; then source .venv313/bin/activate; elif [ -d .venv ]; then source .venv/bin/activate; fi
python app/utils/test_flashcard_validator.py
