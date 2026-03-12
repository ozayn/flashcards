import logging

from sqlalchemy import text

from app.core.database import engine, Base
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

logger = logging.getLogger(__name__)


def _add_archived_column_if_missing(sync_conn):
    """Add archived column to decks table if it doesn't exist."""
    try:
        # PostgreSQL: use DEFAULT false; SQLite: use DEFAULT 0
        sync_conn.execute(text("ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT false"))
        logger.info("Added archived column to decks table")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            pass  # Column already exists
        else:
            logger.warning("archived column migration failed: %s", e)


def _add_user_settings_columns_if_missing(sync_conn):
    """Add think_delay_enabled, think_delay_ms, study_card_style columns to users table if missing."""
    for col, sql in [
        ("think_delay_enabled", "ALTER TABLE users ADD COLUMN think_delay_enabled BOOLEAN DEFAULT true"),
        ("think_delay_ms", "ALTER TABLE users ADD COLUMN think_delay_ms INTEGER DEFAULT 1500"),
        ("study_card_style", "ALTER TABLE users ADD COLUMN study_card_style TEXT DEFAULT 'classic'"),
    ]:
        try:
            sync_conn.execute(text(sql))
            logger.info("Added %s column to users table", col)
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                pass
            else:
                logger.warning("%s column migration failed: %s", col, e)


async def init_db() -> None:
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(bind=sync_conn))
        await conn.run_sync(_add_archived_column_if_missing)
        await conn.run_sync(_add_user_settings_columns_if_missing)
    logger.info("Database tables created successfully")


async def drop_db() -> None:
    """Drop all database tables. Use with caution."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.info("Database tables dropped")
