import logging

from sqlalchemy import text

from app.core.database import engine, Base
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

logger = logging.getLogger(__name__)


def _add_archived_column_if_missing(sync_conn):
    """Add archived column to decks table if it doesn't exist."""
    try:
        sync_conn.execute(text("ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT 0"))
        logger.info("Added archived column to decks table")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            pass  # Column already exists
        else:
            logger.debug("archived column migration skipped: %s", e)


async def init_db() -> None:
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(bind=sync_conn))
        await conn.run_sync(_add_archived_column_if_missing)
    logger.info("Database tables created successfully")


async def drop_db() -> None:
    """Drop all database tables. Use with caution."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.info("Database tables dropped")
