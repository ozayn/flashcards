import logging

from sqlalchemy import text

from app.core.database import engine, Base
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

logger = logging.getLogger(__name__)


def _add_archived_column_if_missing(sync_conn):
    """Add archived column to decks table if it doesn't exist. Raises on error (caller handles)."""
    sync_conn.execute(text("ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT false"))
    logger.info("Added archived column to decks table")


def _add_user_settings_column(sync_conn, col: str, sql: str) -> None:
    """Add a single user settings column. Raises on error (caller handles)."""
    sync_conn.execute(text(sql))
    logger.info("Added %s column to users table", col)


async def init_db() -> None:
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(bind=sync_conn))

    # Run each schema migration in its own transaction so one failure doesn't abort the rest
    try:
        async with engine.begin() as conn:
            await conn.run_sync(_add_archived_column_if_missing)
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            pass
        else:
            logger.warning("archived column migration failed: %s", e)

    user_cols = [
        ("think_delay_enabled", "ALTER TABLE users ADD COLUMN think_delay_enabled BOOLEAN DEFAULT true"),
        ("think_delay_ms", "ALTER TABLE users ADD COLUMN think_delay_ms INTEGER DEFAULT 1500"),
        ("study_card_style", "ALTER TABLE users ADD COLUMN study_card_style TEXT DEFAULT 'classic'"),
    ]
    for col, sql in user_cols:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(
                    lambda c, _col=col, _sql=sql: _add_user_settings_column(c, _col, _sql)
                )
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                pass
            else:
                logger.warning("%s column migration failed: %s", col, e)

    logger.info("Database tables created successfully")


async def drop_db() -> None:
    """Drop all database tables. Use with caution."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.info("Database tables dropped")
