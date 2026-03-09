from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import generation, health, decks, users, flashcards, reviews

# Load .env from apps/api/ or apps/api/app/
for env_path in [
    Path(__file__).resolve().parent / ".env",
    Path(__file__).resolve().parent.parent / ".env",
]:
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass
        break
from app.core.database import engine, Base
from app.core.init_db import init_db
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

app = FastAPI(
    title="Flashcard API",
    description="AI Flashcard Learning Platform API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(decks.router)
app.include_router(users.router)
app.include_router(flashcards.router)
app.include_router(generation.router)
app.include_router(reviews.router)


@app.get("/")
async def root():
    return {"message": "Flashcard API is running"}


@app.on_event("startup")
async def startup():
    try:
        await init_db()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(
            f"Database setup skipped (connect to PostgreSQL to enable): {e}"
        )
