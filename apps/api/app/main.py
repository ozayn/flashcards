from pathlib import Path

# Load .env first (before other imports that may read env)
for env_path in [
    Path(__file__).resolve().parent.parent / ".env",  # apps/api/.env
    Path(__file__).resolve().parent / ".env",          # apps/api/app/.env
]:
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass
        break

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import generation, health, decks, users, flashcards, reviews, categories
from app.core.database import engine, Base
from app.core.init_db import init_db
from app.core.auth import require_admin_key
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

app = FastAPI(
    title="MemoNext API",
    description="MemoNext — Turn information into memory. AI Flashcard Learning Platform API",
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
app.include_router(categories.router)
app.include_router(decks.router)
app.include_router(users.router)
app.include_router(flashcards.router)
app.include_router(generation.router)
app.include_router(reviews.router)


@app.get("/")
async def root():
    return {"message": "Flashcard API is running"}


@app.get("/protected-ping", dependencies=[Depends(require_admin_key)])
async def protected_ping():
    """Test route: requires X-Admin-Api-Key header. Returns 200 if valid."""
    return {"message": "pong", "protected": True}


@app.on_event("startup")
async def startup():
    try:
        await init_db()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(
            f"Database setup skipped (connect to PostgreSQL to enable): {e}"
        )
