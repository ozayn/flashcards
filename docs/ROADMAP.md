# Project Roadmap

## Completed

- [x] Project scaffolding (Next.js + FastAPI monorepo)
- [x] Database models (Users, Decks, Flashcards, Reviews)
- [x] SQLite support for local development
- [x] User CRUD (create, list)
- [x] Deck CRUD (create, list, get by ID)
- [x] Flashcard creation and listing
- [x] Deck dashboard with API integration
- [x] Deck detail page with flashcards section
- [x] Clickable deck cards linking to detail page
- [x] Development scripts (dev.sh, restart.sh)

## In Progress

- [ ] Add Card page (create flashcards from UI)
- [ ] Study mode implementation

## Planned

- [ ] LLM-powered flashcard generation
- [ ] Webpage parsing for deck creation
- [ ] Spaced repetition (Reviews model)
- [ ] User authentication
- [ ] Study tutor / AI assistance

## LLM Architecture & Model Routing

The platform uses a pluggable LLM router that allows switching between different model providers without changing application logic.

**Purpose:**

- Support experimentation with different AI models
- Allow cost optimization
- Enable future local model support
- Enable A/B testing of learning quality

**Architecture:**

```
Frontend
   ↓
FastAPI Backend
   ↓
LLM Router
   ↓
Providers:
  - Groq
  - OpenAI
  - Local models (future)
```

**Capabilities:**

- Switch providers using environment variable `LLM_PROVIDER`
- Compare model output quality
- Route requests to different models
- Add fallback models for reliability

**Example providers:**

- Groq (current)
- OpenAI (future)
- Local models via Ollama (future)

---

## Future AI Experiments

Planned experiments enabled by the LLM router:

- A/B testing flashcard quality between models
- Compare explanation clarity
- Evaluate learning retention with different AI-generated cards
- Cost-aware routing (local model vs API model)
- Adaptive model selection based on task difficulty

---

## Long-Term Goal

Turn the flashcard platform into an **AI learning laboratory**, where different models can be evaluated for:

- learning efficiency
- explanation quality
- flashcard usefulness
- spaced-repetition optimization

---

## Future Learning Features

### Spaced Repetition Engine
Implement adaptive scheduling of flashcards using a spaced repetition algorithm.

Planned capabilities:

• Card difficulty rating (Again / Hard / Good / Easy)  
• Review scheduling with next_review timestamps  
• Due-card study mode (only show cards due today)  
• Review history tracking per user  
• Adaptive interval calculation (similar to SM-2 / Anki)

Benefits:

• Improves long-term retention
• Enables personalized learning
• Supports learning analytics

---

### Daily Review Queue

Add a system showing how many cards are due each day.

Examples:

• "12 cards due today"
• Review streak tracking
• Daily learning reminders

---

### Learning Analytics

Provide statistics on learning progress.

Possible metrics:

• Retention rate
• Cards mastered
• Average recall difficulty
• Study time per deck

---

### AI Tutor Mode

Integrate LLM assistance for difficult flashcards.

Features:

• Explain a card
• Generate examples
• Provide mnemonics
• Ask follow-up questions

Goal:
Transform the app from a flashcard viewer into an adaptive AI learning platform.

---
