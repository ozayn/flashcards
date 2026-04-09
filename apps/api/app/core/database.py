import os
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# libpq / dashboard copy-paste params that asyncpg does not accept on the URL
_ASYNCPG_UNSUPPORTED_QUERY_KEYS = frozenset({"sslmode", "channel_binding"})


def _strip_asyncpg_unsupported_query_params(url: str) -> str:
    """Remove query keys asyncpg rejects (e.g. Neon/psql-style sslmode, channel_binding)."""
    parsed = urlparse(url)
    if not parsed.query:
        return url
    pairs = parse_qsl(parsed.query, keep_blank_values=True)
    kept = [
        (k, v)
        for k, v in pairs
        if k.lower() not in _ASYNCPG_UNSUPPORTED_QUERY_KEYS
    ]
    new_query = urlencode(kept) if kept else ""
    return urlunparse(parsed._replace(query=new_query))


DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # PostgreSQL: convert postgres:// or postgresql:// to postgresql+asyncpg://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "+asyncpg" in DATABASE_URL:
        DATABASE_URL = _strip_asyncpg_unsupported_query_params(DATABASE_URL)
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("DEBUG", "false").lower() == "true",
    )
else:
    # SQLite: default when DATABASE_URL is not set
    DATABASE_URL = "sqlite+aiosqlite:///./dev.db"
    engine = create_async_engine(
        DATABASE_URL,
        echo=os.getenv("DEBUG", "false").lower() == "true",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_fks(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
