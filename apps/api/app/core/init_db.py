import logging

from sqlalchemy import text
from app.core.database import engine, Base, DATABASE_URL
from app.models import User, Deck, Flashcard, Review  # noqa: F401 - register models

logger = logging.getLogger(__name__)

_IS_SQLITE = "sqlite" in (DATABASE_URL or "")


def _column_exists(sync_conn, table: str, column: str) -> bool:
    """Check if a column exists. Works for SQLite and PostgreSQL."""
    if _IS_SQLITE:
        r = sync_conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        return any(row[1] == column for row in r)
    r = sync_conn.execute(text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).fetchone()
    return r is not None


def _add_column_if_missing(sync_conn, table: str, column: str, sql: str) -> None:
    """Add column if it doesn't exist. Handles both SQLite and PostgreSQL."""
    if _column_exists(sync_conn, table, column):
        return
    sync_conn.execute(text(sql))
    logger.info("Added %s column to %s", column, table)


async def init_db() -> None:
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(bind=sync_conn))

    # Startup migrations
    # These migrations are idempotent and safe to run on every startup.
    # Works with both SQLite (dev) and PostgreSQL (prod).

    async with engine.begin() as conn:
        def _migrate_decks(sync_conn):
            _add_column_if_missing(
                sync_conn, "decks", "archived",
                "ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT 0" if _IS_SQLITE
                else "ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT false"
            )
        await conn.run_sync(_migrate_decks)
    logger.info("Applied archived column migration")

    async with engine.begin() as conn:
        def _migrate_think_delay_enabled(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "think_delay_enabled",
                "ALTER TABLE users ADD COLUMN think_delay_enabled BOOLEAN DEFAULT 1" if _IS_SQLITE
                else "ALTER TABLE users ADD COLUMN think_delay_enabled BOOLEAN DEFAULT true"
            )
        await conn.run_sync(_migrate_think_delay_enabled)
    logger.info("Applied think_delay_enabled column migration")

    async with engine.begin() as conn:
        def _migrate_think_delay_ms(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "think_delay_ms",
                "ALTER TABLE users ADD COLUMN think_delay_ms INTEGER DEFAULT 1500"
            )
        await conn.run_sync(_migrate_think_delay_ms)
    logger.info("Applied think_delay_ms column migration")

    # Rename study_card_style -> card_style if old column exists (idempotent)
    def _rename_study_card_style_if_exists(sync_conn):
        if _column_exists(sync_conn, "users", "study_card_style"):
            sync_conn.execute(text("ALTER TABLE users RENAME COLUMN study_card_style TO card_style"))
            sync_conn.execute(text("UPDATE users SET card_style = 'paper' WHERE card_style = 'classic'"))
            logger.info("Renamed study_card_style to card_style")

    async with engine.begin() as conn:
        await conn.run_sync(_rename_study_card_style_if_exists)

    # Add card_style if missing (e.g. fresh DB or after rename)
    async with engine.begin() as conn:
        def _migrate_card_style(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "card_style",
                "ALTER TABLE users ADD COLUMN card_style TEXT DEFAULT 'paper'"
            )
        await conn.run_sync(_migrate_card_style)
    logger.info("Applied card_style column migration")

    logger.info("Database tables created successfully")


async def drop_db() -> None:
    """Drop all database tables. Use with caution."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.info("Database tables dropped")
