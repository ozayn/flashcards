"""Entry point when running uvicorn from project root. Use: uvicorn main:app"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "apps" / "api"))
from app.main import app
