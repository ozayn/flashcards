#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
python app/utils/test_flashcard_validator.py
