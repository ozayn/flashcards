# Architecture

## Overview

Flashcard AI is a full-stack monorepo with a Next.js frontend and FastAPI backend.

## Frontend

| Technology | Purpose |
|------------|---------|
| Next.js 14 | App Router, SSR, routing |
| Tailwind CSS | Styling |
| shadcn/ui | Component library |
| TypeScript | Type safety |

## Backend

| Technology | Purpose |
|------------|---------|
| FastAPI | REST API, async support |
| SQLAlchemy | ORM, async sessions |
| Pydantic | Request/response validation |

## Database

| Mode | Driver | Use Case |
|------|--------|----------|
| Development | SQLite (aiosqlite) | Local dev when DATABASE_URL unset |
| Production | PostgreSQL (asyncpg) | Railway, production |

## Deployment

- **Platform**: Railway
- **API**: Dockerfile, PostgreSQL add-on
- **Web**: Dockerfile, standalone output

## LLM Features (Future)

- Flashcard generation from topic/text
- Webpage parsing for deck creation
- Study tutor / AI assistance
