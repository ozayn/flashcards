# MemoNext

MemoNext helps you turn information into memory. Generate flashcards instantly from text or topics. Built with Next.js 14 and FastAPI.

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
| POST | `/generate-flashcards` | Generate flashcards via LLM |

## AI Flashcard Generation

The system can automatically generate flashcards using an LLM.

**Pipeline:**

Topic → LLM → JSON → Parse & validate → Database → UI

**Key components:**

- Pluggable LLM router (Groq, OpenAI, local)
- Structured JSON outputs (question, answer_short, answer_detailed, difficulty)
- Manual parsing with fallbacks for simplified formats
- FastAPI generation endpoint

## LLM Providers

Flashcard generation uses a pluggable LLM router.

Supported providers:

- **groq** (default)
- **openai** (future)
- **local** (future)

Set provider via environment variable:

```
LLM_PROVIDER=groq
```

**Expected LLM JSON format:**

The LLM must return JSON in this format:

```json
{
  "flashcards": [
    {
      "question": "...",
      "answer_short": "...",
      "answer_detailed": "...",
      "difficulty": "easy"
    }
  ]
}
```

- `question` (required): The flashcard question.
- `answer_short` (required): A short direct answer.
- `answer_detailed` (optional): A brief explanation of the concept.
- `difficulty` (optional): `"easy"`, `"medium"`, or `"hard"`. Defaults to `"medium"` if missing or invalid.

The parser also accepts the simplified format `{"front": "...", "back": "..."}` (mapped to question/answer_short).

**Endpoint:**

`POST /generate-flashcards`

**Example request:**

```json
{
  "deck_id": "...",
  "topic": "Greek mythology",
  "num_cards": 10
}
```

The endpoint generates flashcards using the LLM and inserts them into the deck.

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Home |
| `/decks` | Deck list (API-backed, clickable cards) |
| `/decks/[id]` | Deck details + flashcards + Generate button |
| `/study` | Study session (placeholder) |
| `/create-deck` | Create new deck |

## Development Commands

Prepare the development environment (first time or after clone):

```bash
./scripts/setup.sh
```

Start the development environment:

```bash
./scripts/dev.sh
```

Restart the environment:

```bash
./scripts/restart.sh
```

Run Groq test:

```bash
./scripts/groq_test.sh
```

Run flashcard validator test:

```bash
./scripts/validator_test.sh
```

Update `.env.example` from `.env` (redacts keys, tokens, secrets, passwords):

```bash
./scripts/update_env_example.sh              # uses apps/api/.env
./scripts/update_env_example.sh apps/web     # uses apps/web/.env
```

### Running Manually

```bash
# Backend
cd apps/api && uvicorn main:app --reload --port 8080

# Frontend
cd apps/web && npm run dev
```

- Backend: http://localhost:8080
- Frontend: http://localhost:3000

### Environment Variables

**Backend:** `DATABASE_URL` (optional, defaults to SQLite), `LLM_PROVIDER` (groq/openai/local, default: groq), `GROQ_API_KEY` (for Groq AI generation)  
**Frontend:** `NEXT_PUBLIC_API_URL` (e.g. http://localhost:8080)

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

- Study mode (flip cards, track progress)
- Webpage parsing for deck creation
- Spaced repetition (Reviews model)
- User authentication
