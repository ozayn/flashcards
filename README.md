# Flashcard AI

AI-powered flashcard learning platform built with Next.js 14 and FastAPI.

## Project Overview

Full-stack monorepo for creating, managing, and studying flashcards. Supports users, decks, and flashcards with a minimal SaaS-style UI.

## Architecture

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14 (App Router), Tailwind, shadcn/ui, TypeScript |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Deployment | Railway |

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Root message |
| GET | `/health` | Health check |
| GET | `/users` | List all users |
| POST | `/users` | Create user |
| GET | `/decks?user_id=` | List decks for user |
| GET | `/decks/{id}` | Get deck by ID |
| GET | `/decks/{id}/flashcards` | List flashcards in deck |
| POST | `/decks` | Create deck |
| POST | `/flashcards` | Create flashcard |

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Home |
| `/decks` | Deck list (API-backed, clickable cards) |
| `/decks/[id]` | Deck details + flashcards section |
| `/study` | Study session (placeholder) |
| `/create-deck` | Create new deck |

## Development

### Running Locally

**One command:**
```bash
./dev.sh       # Start backend + frontend
./restart.sh   # Restart (kill existing, then start)
```

**Manual:**
```bash
# Backend
cd apps/api && uvicorn main:app --reload --port 8000

# Frontend
cd apps/web && npm run dev
```

- Backend: http://localhost:8000
- Frontend: http://localhost:3000

### Environment Variables

**Backend:** `DATABASE_URL` (optional, defaults to SQLite), `OPENAI_API_KEY`  
**Frontend:** `NEXT_PUBLIC_API_URL` (e.g. http://localhost:8000)

## Deployment (Railway)

The app deploys as two Railway services. See [`infra/DEPLOYMENT.md`](infra/DEPLOYMENT.md) for full instructions.

### Quick Setup

1. **Create project** – Connect repo to Railway
2. **Add PostgreSQL** – New → Database → PostgreSQL
3. **Deploy API** – New → GitHub Repo, set Root Directory to `apps/api`, add `DATABASE_URL` from Postgres
4. **Deploy Web** – New → GitHub Repo, set Root Directory to `apps/web`, set `NEXT_PUBLIC_API_URL` to your API URL

### How It Works

| Service | Root Dir | Config | Dockerfile |
|---------|----------|--------|------------|
| API | `apps/api` | `railway.json` | Uses `apps/api/Dockerfile` |
| Web | `apps/web` | `railway.json` | Uses `apps/web/Dockerfile` |

- **API**: FastAPI + uvicorn, health check at `/health`
- **Web**: Next.js standalone build, `NEXT_PUBLIC_API_URL` must be set at build time

### Infrastructure

Configuration lives in `/infra`:

- `infra/railway.api.json` – API service config
- `infra/railway.web.json` – Web service config  
- `infra/env.example` – Environment variable reference
- `infra/DEPLOYMENT.md` – Step-by-step deployment guide

## Future Features

- Add Card page (create flashcards from UI)
- Study mode (flip cards, track progress)
- LLM flashcard generation
- Webpage parsing for deck creation
- Spaced repetition (Reviews model)
- User authentication
