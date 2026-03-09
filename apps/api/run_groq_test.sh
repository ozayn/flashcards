#!/bin/bash
cd "$(dirname "$0")"
source .venv/bin/activate
python app/utils/groq_test.py
