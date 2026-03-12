# System Architecture

This document explains the architecture of the AI flashcard platform so that new developers can understand how the system works.

---

## Overview

This platform is an AI-powered flashcard generation system designed to convert knowledge sources into structured learning material.

The system consists of the following main components:

- Frontend application (Next.js)
- Backend API (FastAPI)
- PostgreSQL database
- LLM router for AI generation
- External AI providers (Groq currently, OpenAI and local models planned)

The platform workflow is:

```
User → Frontend → Backend API → LLM Provider → Database → Frontend
```

---

## Repository Structure

The project uses a monorepo structure that separates the frontend, backend, and documentation.

```
flashcards/
│
├─ apps/
│   ├─ api/        # FastAPI backend
│   └─ web/        # Next.js frontend
│
├─ docs/           # Project documentation
│   ├─ ROADMAP.md
│   ├─ PRODUCT_STRATEGY.md
│   ├─ PROJECT_STATUS.md
│   └─ SYSTEM_ARCHITECTURE.md
│
├─ infra/          # Deployment and infrastructure configuration
│
└─ README.md
```

**apps/api** — Contains the FastAPI backend, API endpoints, database models, and AI generation logic.

**apps/web** — Contains the Next.js frontend application including the deck UI, study interface, and flashcard management pages.

**docs** — Contains product documentation, roadmap, architecture documentation, and strategy notes.

**infra** — Contains infrastructure configuration for deployment and environment setup.

This structure allows the frontend and backend to evolve independently while sharing documentation and deployment configuration.

---

## High-Level Architecture

```
User
↓
Frontend (Next.js)
↓
Backend API (FastAPI)
↓
LLM Router
↓
AI Providers
- Groq
- OpenAI (future)
- Local models via Ollama (future)

Backend also connects to:

PostgreSQL Database
```

The frontend communicates with the backend through HTTP API requests.

---

## Frontend Architecture

The frontend is built with Next.js and React.

**Responsibilities:**

- user interface
- deck browsing
- flashcard creation
- flashcard study interface
- AI flashcard generation
- communication with backend APIs

**Key pages include:**

- Deck dashboard
- Deck detail page
- Add card page
- Study page
- AI generation interface

**UX features implemented:**

- card flip interaction
- swipe gestures on mobile
- keyboard shortcuts
- dark mode
- responsive mobile layout

---

## Backend Architecture

The backend is implemented using FastAPI.

**Responsibilities:**

- REST API endpoints
- database access
- flashcard creation and management
- AI generation orchestration
- review tracking for spaced repetition

The backend coordinates communication between:

- the frontend
- the database
- the LLM providers

---

## Database Architecture

The platform uses PostgreSQL in production and SQLite for local development.

**Main models include:**

**Users**

- id
- email
- name
- role
- plan
- created_at

**Decks**

- id
- user_id
- name
- description
- source_type
- source_url
- source_text
- created_at

**Flashcards**

- id
- deck_id
- question
- answer_short
- answer_detailed
- difficulty

**Reviews**

- id
- user_id
- flashcard_id
- rating
- next_review
- interval
- ease_factor

These models enable spaced repetition and personalized learning.

---

## AI Generation Pipeline

Flashcard generation workflow:

```
User provides input
- topic
- notes
- URL
- document text
↓
Frontend sends request to backend
↓
Backend selects LLM provider using LLM router
↓
AI generates flashcards in structured JSON
↓
Backend validates JSON output
↓
Flashcards saved to database
↓
Frontend displays flashcards
```

---

## LLM Router

The backend includes a routing layer that allows switching between different AI providers.

**Supported providers:**

- Groq (current production)
- OpenAI (future)
- Local models via Ollama (future)

**Provider selection** is controlled by environment variable:

```
LLM_PROVIDER=groq
```

**Benefits:**

- easy experimentation
- fallback models
- cost optimization
- model comparison

---

## Future AI Pipeline

Future versions will include concept extraction and knowledge graphs.

**Workflow:**

```
Knowledge input
↓
Concept extraction
↓
Knowledge graph
↓
Flashcard generation
↓
Structured decks
```

This will allow flashcards to be grouped by topic and concept hierarchy.

---

## Deployment Architecture

The platform is deployed on Railway.

**Services include:**

- Web service (Next.js frontend)
- API service (FastAPI backend)
- PostgreSQL database

**Environment variables include:**

- DATABASE_URL
- NEXT_PUBLIC_API_URL
- GROQ_API_KEY
- LLM_PROVIDER

Frontend communicates with API over HTTPS.

---

## Future Infrastructure

Planned improvements include:

- Google authentication
- Admin dashboard
- AI usage tracking
- analytics
- PDF and webpage ingestion
- AI course builder pipeline
- local LLM support
