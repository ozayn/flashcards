# Project Status Report

**Flashcard AI** — AI-powered flashcard learning platform

*Generated: March 2026*

---

## 1. PROJECT STRUCTURE

### apps/api

```
apps/api/
├── app/
│   ├── api/                    # API routers
│   │   ├── decks.py            # Deck CRUD, deck flashcards
│   │   ├── flashcards.py      # Flashcard CRUD
│   │   ├── generation.py      # AI flashcard generation
│   │   ├── health.py          # Health check
│   │   ├── reviews.py         # Spaced repetition reviews
│   │   └── users.py           # User CRUD
│   ├── core/
│   │   ├── database.py        # Async SQLAlchemy engine
│   │   └── init_db.py         # Table creation, migrations
│   ├── llm/                   # LLM providers
│   │   ├── __init__.py
│   │   ├── groq_provider.py   # Groq (implemented)
│   │   ├── local_provider.py  # Placeholder
│   │   ├── openai_provider.py # Placeholder
│   │   ├── router.py          # LLM router (provider selection)
│   │   └── types.py
│   ├── models/                # SQLAlchemy models
│   │   ├── deck.py
│   │   ├── enums.py
│   │   ├── flashcard.py
│   │   ├── review.py
│   │   └── user.py
│   ├── schemas/               # Pydantic schemas
│   │   ├── deck.py
│   │   ├── flashcard.py
│   │   ├── generated_flashcards.py
│   │   ├── review.py
│   │   └── user.py
│   ├── utils/
│   │   └── test_flashcard_validator.py
│   └── main.py                # FastAPI app entry
├── Dockerfile
├── railway.json
├── requirements.txt
└── .env.example
```

**Important files:**
- `main.py` — FastAPI app, CORS, routers, startup DB init
- `api/*.py` — All API endpoints
- `llm/router.py` — Provider selection via `LLM_PROVIDER`
- `llm/groq_provider.py` — Active Groq integration (llama-3.1-8b-instant)
- `core/init_db.py` — Table creation, archived column migration

### apps/web

```
apps/web/
├── app/
│   ├── about/page.tsx
│   ├── create-deck/page.tsx
│   ├── decks/
│   │   ├── [id]/
│   │   │   ├── add-card/page.tsx
│   │   │   ├── edit-card/[card_id]/page.tsx
│   │   │   └── page.tsx
│   │   └── page.tsx
│   ├── study/
│   │   ├── [deck_id]/page.tsx   # Main study UI
│   │   ├── layout.tsx
│   │   └── page.tsx            # Study landing (deck selector)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Home
├── components/
│   ├── layout/nav.tsx
│   ├── theme-toggle.tsx
│   ├── user-selector.tsx
│   └── ui/                     # shadcn components
│       ├── button.tsx
│       ├── card.tsx
│       └── input.tsx
├── lib/
│   ├── api.ts                  # API client
│   └── utils.ts
├── Dockerfile
├── railway.json
└── package.json
```

**Important files:**
- `app/study/[deck_id]/page.tsx` — Full study UI (flip, swipe, ratings)
- `app/decks/[id]/page.tsx` — Deck detail, AI generate, card list
- `lib/api.ts` — All API calls
- `components/user-selector.tsx` — User switching, create user
- `components/theme-toggle.tsx` — Dark/light mode

### docs

```
docs/
├── ARCHITECTURE.md
├── PRODUCT_ROADMAP.md
├── PROJECT_STATUS.md    # This file
├── ROADMAP.md
└── TODOS.md
```

### infra

```
infra/
├── DEPLOYMENT.md        # Railway deployment guide
├── env.example          # Environment variable reference
├── railway.api.json     # API service config (canonical)
└── railway.web.json     # Web service config (canonical)
```

---

## 2. BACKEND STATUS

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Root message |
| GET | `/health` | Health check (`status`, `service`) |
| GET | `/users` | List all users |
| POST | `/users` | Create user (email, name, role, plan) |
| GET | `/decks` | List decks for user (`user_id`, `archived`) |
| GET | `/decks/{deck_id}` | Get single deck |
| GET | `/decks/{deck_id}/flashcards` | List flashcards (`due_only` for spaced repetition) |
| POST | `/decks` | Create deck |
| PATCH | `/decks/{deck_id}` | Update deck (name, description, archived) |
| DELETE | `/decks/{deck_id}` | Delete deck and its cards |
| GET | `/flashcards/{flashcard_id}` | Get single flashcard |
| POST | `/flashcards` | Create flashcard |
| PATCH | `/flashcards/{flashcard_id}` | Update flashcard |
| DELETE | `/flashcards/{flashcard_id}` | Delete flashcard |
| POST | `/generate-flashcards` | AI-generate flashcards for a deck |
| POST | `/reviews` | Submit spaced repetition review |

### Endpoint Details

- **`/health`** — Returns `{"status": "healthy", "service": "flashcard-api"}`. Used by Railway for health checks.
- **`/users`** — No auth. Used for user switching; first user or stored user ID drives deck filtering.
- **`/decks`** — Requires `user_id` query param. `archived=false` by default.
- **`/decks/{deck_id}/flashcards`** — Optional `due_only=true` returns only cards due for review (spaced repetition).
- **`/generate-flashcards`** — Body: `deck_id`, `topic`, `num_cards` (default 10, max 50). Uses LLM router (Groq by default).

---

## 3. DATABASE MODELS

### User

| Field | Type | Description |
|-------|------|--------------|
| id | UUID | Primary key |
| email | String(255) | Unique |
| name | String(255) | |
| role | Enum | `admin`, `user` |
| plan | Enum | `free`, `pro` |
| created_at | DateTime | |

### Deck

| Field | Type | Description |
|-------|------|--------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| name | String(255) | |
| description | String(500) | Optional |
| source_type | Enum | `topic`, `webpage`, `text` |
| source_url | String(2048) | Optional |
| source_text | Text | Optional |
| archived | Boolean | Default false |
| created_at | DateTime | |

### Flashcard

| Field | Type | Description |
|-------|------|--------------|
| id | UUID | Primary key |
| deck_id | UUID | FK → decks |
| question | Text | |
| answer_short | String(1000) | |
| answer_detailed | Text | Optional |
| difficulty | Integer | 0=easy, 1=medium, 2=hard |
| created_at | DateTime | |

### Review

| Field | Type | Description |
|-------|------|--------------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| flashcard_id | UUID | FK → flashcards |
| rating | Enum | `again`, `hard`, `good`, `easy` |
| review_time | DateTime | |
| next_review | DateTime | |

---

## 4. LLM / AI FEATURES

| Component | Status | Notes |
|-----------|--------|-------|
| LLM router | ✅ Implemented | `app/llm/router.py`, selects provider via `LLM_PROVIDER` |
| Groq provider | ✅ Implemented | `llama-3.1-8b-instant`, requires `GROQ_API_KEY` |
| OpenAI provider | ❌ Placeholder | Raises `NotImplementedError` |
| Local provider | ❌ Placeholder | Raises `NotImplementedError` |
| JSON extractor | ✅ Implemented | `_extract_json()` in generation.py, handles markdown code blocks |
| Flashcard generation endpoint | ✅ Implemented | `POST /generate-flashcards` |

### Generation Flow

```
Frontend (deck page)
    ↓ POST /generate-flashcards { deck_id, topic, num_cards }
API generation.py
    ↓ Build prompt
LLM router (LLM_PROVIDER=groq)
    ↓
Groq provider (llama-3.1-8b-instant)
    ↓ Raw JSON string
_extract_json() — strip markdown, parse
    ↓
Validate fields (question, answer_short, answer_detailed, difficulty)
    ↓
Insert into flashcards table (skip duplicates by question)
    ↓
Return { created: N }
```

### JSON Validation

- Accepts `question`/`front`, `answer_short`/`back`/`answer`
- Difficulty: `easy`, `medium`, `hard` (default `medium`)
- Skips cards missing required fields
- Deduplicates by `(deck_id, question)`

---

## 5. FRONTEND STATUS

### Implemented Pages

| Route | Description |
|-------|-------------|
| `/` | Home — links to Browse Decks, Create Deck |
| `/decks` | Deck list — user selector, archived toggle, create deck |
| `/decks/[id]` | Deck detail — name/description edit, Study, Add Card, Generate Flashcards, card list |
| `/decks/[id]/add-card` | Add flashcard form (question, answer_short, answer_detailed, difficulty) |
| `/decks/[id]/edit-card/[card_id]` | Edit flashcard |
| `/create-deck` | Create deck form (name, description) |
| `/study` | Study landing — placeholder, links to deck selection |
| `/study/[deck_id]` | **Main study UI** — flip cards, swipe, ratings, session complete |
| `/about` | Static info on spaced repetition, active recall, AI, adaptive learning |

### Study Page (`/study/[deck_id]`)

- **Interaction:** Tap to flip, swipe left/right to navigate
- **Keyboard:** Space = flip, Arrow keys = prev/next
- **Ratings:** Again, Hard, Good, Easy — submits to `/reviews`
- **Layout:** 2/3 aspect on mobile portrait, 3/2 on desktop/landscape
- **Navigation:** Arrows on sides (landscape), below card (portrait)
- **Session complete:** Shown when last card rated; option to study again or go back
- **Help:** Help icon toggles "Tap to flip • Swipe to go"

### Other Frontend Features

- **User switching:** `UserSelector` in nav — dropdown, create user, localStorage
- **Dark mode:** `ThemeToggle` — localStorage + system preference
- **Mobile:** Responsive layout, hamburger nav, touch gestures
- **Error handling:** API errors shown (e.g. "Unable to load decks" with configured API URL)

---

## 6. CURRENT DATA FLOW

### Creating a Deck

1. User selects/creates user via `UserSelector`
2. Navigate to `/create-deck`
3. Submit form → `POST /decks` with `user_id`, `name`, `description`
4. Redirect to `/decks`

### Viewing a Deck

1. `/decks` → `GET /decks?user_id=...` → list
2. Click deck → `/decks/[id]` → `GET /decks/{id}`, `GET /decks/{id}/flashcards`

### Adding a Flashcard

1. From deck page → `/decks/[id]/add-card`
2. Submit form → `POST /flashcards` with `deck_id`, `question`, `answer_short`, etc.
3. Redirect to deck page

### AI Generating Flashcards

1. On deck page, click "Generate Flashcards"
2. `POST /generate-flashcards` with `deck_id`, `topic` (deck name), `num_cards: 10`
3. API calls Groq, parses JSON, inserts cards
4. Frontend refetches flashcards

### Studying Cards

1. From deck page → "Study" → `/study/[deck_id]`
2. `GET /decks/[deck_id]/flashcards` (no `due_only` — all cards for now)
3. User flips, rates (Again/Hard/Good/Easy)
4. Each rating → `POST /reviews` with `flashcard_id`, `rating`, `user_id`
5. On last card → session complete screen

---

## 7. DEPLOYMENT STATUS

### Railway Services

| Service | Root | Port | Description |
|---------|------|------|-------------|
| **API** | `apps/api` | 8000 | FastAPI, uvicorn |
| **Web** | `apps/web` | 3000 | Next.js standalone |
| **PostgreSQL** | — | — | Database (add via Railway) |

### Configuration

- **API:** `apps/api/railway.json` — Dockerfile build, healthcheck `/health`
- **Web:** `apps/web/railway.json` — Dockerfile build, `node server.js`
- **Dockerfiles:** Python 3.12 (API), Node 20 (Web)

### Environment Variables

| Service | Variable | Purpose |
|---------|----------|---------|
| API | `DATABASE_URL` | PostgreSQL connection |
| API | `LLM_PROVIDER` | `groq` (default), `openai`, `local` |
| API | `GROQ_API_KEY` | Required for Groq |
| API | `OPENAI_API_KEY` | For future OpenAI provider |
| Web | `NEXT_PUBLIC_API_URL` | API URL (build-time) |

**Note:** `NEXT_PUBLIC_API_URL` must be set before web build. See `infra/DEPLOYMENT.md` for troubleshooting.

---

## 8. FEATURES IMPLEMENTED

- [x] Deck creation
- [x] Deck CRUD (create, list, get, update, delete, archive)
- [x] Flashcard CRUD
- [x] Add Card page
- [x] Edit Card page
- [x] AI flashcard generation (Groq)
- [x] Study UI (flip, swipe, keyboard)
- [x] Spaced repetition ratings (Again/Hard/Good/Easy)
- [x] Review submission and `next_review` scheduling
- [x] User switching (dropdown + create user)
- [x] Dark mode
- [x] Mobile layout
- [x] Gesture navigation (swipe)
- [x] Session complete screen
- [x] Production deployment (Railway, Docker)

---

## 9. MISSING FEATURES

- [ ] **Spaced repetition in study** — Study page fetches all cards; `due_only` exists in API but is not used
- [ ] **Authentication** — No login; user selection is via dropdown only
- [ ] **OpenAI provider** — Placeholder only
- [ ] **Local provider** — Placeholder (e.g. Ollama)
- [ ] **AI tutor mode** — Not implemented
- [ ] **Deck import** — No import from URL, file, or Anki
- [ ] **Analytics** — No usage or learning stats
- [ ] **Token usage tracking** — LLM token usage not logged
- [ ] **Delete deck** — API supports it; no UI button

---

## 10. DEVELOPMENT STAGE SUMMARY

**MVP with working AI flashcard generation, study interface, and production deployment.**

The app supports end-to-end flows: create users and decks, add or AI-generate flashcards, and study with flip/swipe/ratings. Spaced repetition is partially implemented (reviews and scheduling in the backend; study UI still shows all cards). Deployment is configured for Railway with PostgreSQL and Docker. The LLM stack is pluggable (Groq active; OpenAI and local are placeholders). Next steps could include wiring `due_only` into the study flow, adding authentication, and implementing token usage tracking.
