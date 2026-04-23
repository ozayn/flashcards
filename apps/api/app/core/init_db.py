import logging

from sqlalchemy import text
from app.core.database import engine, Base, DATABASE_URL
from app.models import (  # noqa: F401 - register models
    User,
    UserActivity,
    Deck,
    Flashcard,
    FlashcardBookmark,
    Review,
    Category,
    GenerationJobMetric,
)

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


def _add_column_if_missing(sync_conn, table: str, column: str, sql: str, pg_if_not_exists: str | None = None) -> None:
    """Add column if it doesn't exist. Handles both SQLite and PostgreSQL."""
    if _IS_SQLITE:
        if _column_exists(sync_conn, table, column):
            return
        sync_conn.execute(text(sql))
        logger.info("Added %s column to %s", column, table)
    else:
        # PostgreSQL: use ADD COLUMN IF NOT EXISTS (PG 9.6+) for idempotency
        stmt = pg_if_not_exists if pg_if_not_exists else sql
        sync_conn.execute(text(stmt))
        logger.info("Ensured %s column exists on %s", column, table)


async def init_db() -> None:
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(bind=sync_conn))

    # Startup migrations
    # These migrations are idempotent and safe to run on every startup.
    # Works with both SQLite (dev) and PostgreSQL (prod).

    # Ensure categories table exists before adding category_id to decks
    async with engine.begin() as conn:
        def _ensure_categories_table(sync_conn):
            if _IS_SQLITE:
                r = sync_conn.execute(text(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='categories'"
                )).fetchone()
            else:
                r = sync_conn.execute(text("""
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'categories'
                """)).fetchone()
            if r is None:
                sync_conn.execute(text("""
                    CREATE TABLE categories (
                        id TEXT PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """ if _IS_SQLITE else """
                    CREATE TABLE categories (
                        id UUID PRIMARY KEY,
                        name VARCHAR(100) NOT NULL,
                        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                logger.info("Created categories table")
        await conn.run_sync(_ensure_categories_table)

    # Backfill categories with NULL user_id: assign to first user so they are not orphaned
    async with engine.begin() as conn:
        def _backfill_category_user_id(sync_conn):
            has_null = sync_conn.execute(text(
                "SELECT 1 FROM categories WHERE user_id IS NULL LIMIT 1"
            )).fetchone()
            if has_null is None:
                return
            first_user = sync_conn.execute(text(
                "SELECT id FROM users LIMIT 1"
            )).fetchone()
            if first_user is None:
                return
            sync_conn.execute(text(
                "UPDATE categories SET user_id = :uid WHERE user_id IS NULL"
            ), {"uid": first_user[0]})
            logger.info("Backfilled categories with NULL user_id to first user")
        await conn.run_sync(_backfill_category_user_id)

    async with engine.begin() as conn:
        def _migrate_decks(sync_conn):
            _add_column_if_missing(
                sync_conn, "decks", "archived",
                "ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT 0" if _IS_SQLITE
                else "ALTER TABLE decks ADD COLUMN archived BOOLEAN DEFAULT false",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false"
            )
            _add_column_if_missing(
                sync_conn, "decks", "source_title",
                "ALTER TABLE decks ADD COLUMN source_title TEXT",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_title TEXT"
            )
            _add_column_if_missing(
                sync_conn, "decks", "source_topic",
                "ALTER TABLE decks ADD COLUMN source_topic TEXT",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_topic VARCHAR(512)"
            )
            _add_column_if_missing(
                sync_conn, "decks", "generation_status",
                "ALTER TABLE decks ADD COLUMN generation_status VARCHAR(32) DEFAULT 'completed'",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS generation_status VARCHAR(32) DEFAULT 'completed'"
            )
            _add_column_if_missing(
                sync_conn, "decks", "generated_by_ai",
                "ALTER TABLE decks ADD COLUMN generated_by_ai BOOLEAN DEFAULT 0" if _IS_SQLITE
                else "ALTER TABLE decks ADD COLUMN generated_by_ai BOOLEAN DEFAULT false",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS generated_by_ai BOOLEAN DEFAULT false"
            )
            _add_column_if_missing(
                sync_conn, "decks", "category_id",
                "ALTER TABLE decks ADD COLUMN category_id TEXT REFERENCES categories(id)"
                if _IS_SQLITE
                else "ALTER TABLE decks ADD COLUMN category_id UUID REFERENCES categories(id) ON DELETE SET NULL",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL"
            )
            _add_column_if_missing(
                sync_conn, "decks", "category_assigned_at",
                "ALTER TABLE decks ADD COLUMN category_assigned_at TIMESTAMP",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS category_assigned_at TIMESTAMP"
            )
            _add_column_if_missing(
                sync_conn, "decks", "is_public",
                "ALTER TABLE decks ADD COLUMN is_public BOOLEAN DEFAULT 0" if _IS_SQLITE
                else "ALTER TABLE decks ADD COLUMN is_public BOOLEAN DEFAULT false",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false"
            )
            _add_column_if_missing(
                sync_conn, "decks", "source_segments",
                "ALTER TABLE decks ADD COLUMN source_segments TEXT",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_segments TEXT"
            )
            _add_column_if_missing(
                sync_conn, "decks", "source_metadata",
                "ALTER TABLE decks ADD COLUMN source_metadata TEXT",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_metadata TEXT"
            )
            _add_column_if_missing(
                sync_conn, "decks", "source_summary",
                "ALTER TABLE decks ADD COLUMN source_summary TEXT",
                pg_if_not_exists="ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_summary TEXT"
            )
            _add_column_if_missing(
                sync_conn, "decks", "study_status",
                "ALTER TABLE decks ADD COLUMN study_status VARCHAR(32) DEFAULT 'not_started'",
                pg_if_not_exists=(
                    "ALTER TABLE decks ADD COLUMN IF NOT EXISTS study_status "
                    "VARCHAR(32) DEFAULT 'not_started'"
                ),
            )
            _add_column_if_missing(
                sync_conn, "decks", "category_position",
                "ALTER TABLE decks ADD COLUMN category_position INTEGER",
                pg_if_not_exists=(
                    "ALTER TABLE decks ADD COLUMN IF NOT EXISTS category_position INTEGER"
                ),
            )
        await conn.run_sync(_migrate_decks)
    logger.info("Applied decks column migrations")

    async with engine.begin() as conn:
        def _migrate_flashcards_answer_example(sync_conn):
            _add_column_if_missing(
                sync_conn,
                "flashcards",
                "answer_example",
                "ALTER TABLE flashcards ADD COLUMN answer_example TEXT",
                pg_if_not_exists=(
                    "ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS answer_example TEXT"
                ),
            )

        await conn.run_sync(_migrate_flashcards_answer_example)
    logger.info("Applied flashcards answer_example column migration")

    # Make source_type nullable for PostgreSQL (allows NULL for existing/legacy rows)
    if not _IS_SQLITE:
        async with engine.begin() as conn:
            def _migrate_source_type_nullable(sync_conn):
                try:
                    sync_conn.execute(text(
                        "ALTER TABLE decks ALTER COLUMN source_type DROP NOT NULL"
                    ))
                    logger.info("Made source_type nullable")
                except Exception as e:
                    if "does not exist" not in str(e).lower() and "already" not in str(e).lower():
                        logger.warning("Could not make source_type nullable: %s", e)
            await conn.run_sync(_migrate_source_type_nullable)

    async with engine.begin() as conn:
        def _migrate_think_delay_enabled(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "think_delay_enabled",
                "ALTER TABLE users ADD COLUMN think_delay_enabled BOOLEAN DEFAULT 1" if _IS_SQLITE
                else "ALTER TABLE users ADD COLUMN think_delay_enabled BOOLEAN DEFAULT true",
                pg_if_not_exists="ALTER TABLE users ADD COLUMN IF NOT EXISTS think_delay_enabled BOOLEAN DEFAULT true"
            )
        await conn.run_sync(_migrate_think_delay_enabled)
    logger.info("Applied think_delay_enabled column migration")

    async with engine.begin() as conn:
        def _migrate_think_delay_ms(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "think_delay_ms",
                "ALTER TABLE users ADD COLUMN think_delay_ms INTEGER DEFAULT 1500",
                pg_if_not_exists="ALTER TABLE users ADD COLUMN IF NOT EXISTS think_delay_ms INTEGER DEFAULT 1500"
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
                "ALTER TABLE users ADD COLUMN card_style TEXT DEFAULT 'paper'",
                pg_if_not_exists="ALTER TABLE users ADD COLUMN IF NOT EXISTS card_style TEXT DEFAULT 'paper'"
            )
        await conn.run_sync(_migrate_card_style)
    logger.info("Applied card_style column migration")

    async with engine.begin() as conn:
        def _migrate_english_tts(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "english_tts",
                "ALTER TABLE users ADD COLUMN english_tts TEXT DEFAULT 'default'",
                pg_if_not_exists="ALTER TABLE users ADD COLUMN IF NOT EXISTS english_tts VARCHAR(16) DEFAULT 'default'",
            )
        await conn.run_sync(_migrate_english_tts)
    logger.info("Applied english_tts column migration")

    async with engine.begin() as conn:
        def _migrate_voice_style(sync_conn):
            _add_column_if_missing(
                sync_conn, "users", "voice_style",
                "ALTER TABLE users ADD COLUMN voice_style TEXT DEFAULT 'default'",
                pg_if_not_exists="ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_style VARCHAR(16) DEFAULT 'default'",
            )
        await conn.run_sync(_migrate_voice_style)
    logger.info("Applied voice_style column migration")

    async with engine.begin() as conn:
        def _migrate_google_sub(sync_conn):
            # SQLite rejects "ADD COLUMN ... UNIQUE" (OperationalError: Cannot add a UNIQUE column).
            # Add the column plain, then enforce uniqueness with a unique index (multiple NULLs allowed).
            if _IS_SQLITE:
                if not _column_exists(sync_conn, "users", "google_sub"):
                    sync_conn.execute(text("ALTER TABLE users ADD COLUMN google_sub TEXT"))
                    logger.info("Added google_sub column to users (SQLite)")
                sync_conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub "
                        "ON users(google_sub)"
                    )
                )
                logger.info("Ensured unique index uq_users_google_sub on users.google_sub (SQLite)")
            else:
                _add_column_if_missing(
                    sync_conn,
                    "users",
                    "google_sub",
                    sql="",
                    pg_if_not_exists=(
                        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) UNIQUE"
                    ),
                )
        await conn.run_sync(_migrate_google_sub)
    logger.info("Applied google_sub column migration")

    async with engine.begin() as conn:
        def _migrate_users_picture_url(sync_conn):
            _add_column_if_missing(
                sync_conn,
                "users",
                "picture_url",
                "ALTER TABLE users ADD COLUMN picture_url TEXT",
                pg_if_not_exists=(
                    "ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url VARCHAR(2048)"
                ),
            )

        await conn.run_sync(_migrate_users_picture_url)
    logger.info("Applied users.picture_url column migration")

    # Ensure reviewrating enum has all values (PostgreSQL only; SQLite uses CHECK)
    if not _IS_SQLITE:
        async with engine.begin() as conn:
            def _migrate_review_rating_enum(sync_conn):
                for value in ("again", "hard", "good", "easy"):
                    try:
                        sync_conn.execute(text(
                            f"ALTER TYPE reviewrating ADD VALUE IF NOT EXISTS '{value}'"
                        ))
                        logger.info("Ensured reviewrating enum has '%s'", value)
                    except Exception as e:
                        if "already exists" not in str(e).lower():
                            logger.warning("Could not add reviewrating value '%s': %s", value, e)
            await conn.run_sync(_migrate_review_rating_enum)
        logger.info("Applied reviewrating enum migration")

    # Ensure sourcetype enum exists (PostgreSQL only; required for decks.source_type)
    if not _IS_SQLITE:
        async with engine.begin() as conn:
            def _migrate_sourcetype_enum(sync_conn):
                r = sync_conn.execute(text("""
                    SELECT 1 FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public' AND t.typname = 'sourcetype'
                """)).fetchone()
                if r is None:
                    sync_conn.execute(text("""
                        CREATE TYPE sourcetype AS ENUM (
                            'topic', 'text', 'url', 'wikipedia', 'youtube', 'pdf', 'manual', 'webpage'
                        )
                    """))
                    logger.info("Created sourcetype enum")
                else:
                    for value in ("topic", "text", "url", "wikipedia", "youtube", "pdf", "manual", "webpage"):
                        try:
                            sync_conn.execute(text(
                                f"ALTER TYPE sourcetype ADD VALUE IF NOT EXISTS '{value}'"
                            ))
                        except Exception as e:
                            if "already exists" not in str(e).lower():
                                logger.warning("Could not add sourcetype value '%s': %s", value, e)
            await conn.run_sync(_migrate_sourcetype_enum)
        logger.info("Applied sourcetype enum migration")

    logger.info("Database tables created successfully")


async def drop_db() -> None:
    """Drop all database tables. Use with caution."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    logger.info("Database tables dropped")
