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

## AI Reliability Improvements

To ensure flashcard generation is robust and production-ready, the platform will implement several reliability improvements.

### Structured JSON Generation

All LLM providers must return flashcards in strict JSON format.

Example schema:

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

The backend will validate responses before inserting cards into the database.

### Automatic JSON Validation

Responses will be validated against a schema before processing. Invalid responses will be rejected and logged.

### Automatic Retry on Failure

If JSON validation fails:

1. Retry generation with a stricter prompt
2. Attempt regeneration with the same model
3. Optionally fall back to another LLM provider

### LLM Fallback Routing

If a provider fails or returns invalid output:

- Retry with the same provider
- Optionally route to another provider (OpenAI, local model)

This will be enabled by the LLM router architecture.

### Logging & Debugging

All generation failures should log:

- topic
- model used
- raw LLM response
- validation errors

This will make debugging and improving prompts easier.

---

## Future AI Experiments

Planned experiments enabled by the LLM router:

- A/B testing flashcard quality between models
- Compare explanation clarity
- Evaluate learning retention with different AI-generated cards
- Cost-aware routing (local model vs API model)
- Adaptive model selection based on task difficulty

---

## Local LLM Support (Future)

The platform will eventually support running open-source language models locally instead of relying only on external APIs.

**Purpose:**

- Reduce AI API costs
- Allow offline experimentation
- Enable full control of AI generation
- Support AI research and model comparisons

**Planned architecture:**

```
Frontend
   ↓
FastAPI Backend
   ↓
LLM Router
   ↓
Providers:
   - Groq (current production)
   - OpenAI (future)
   - Local models via Ollama (future)
```

**Possible local models:**

- Llama 3
- Mistral
- Phi-3
- Gemma

**Possible hosting setups:**

1. Development machine using Ollama
2. Dedicated GPU server (RunPod, Lambda Labs, Vast.ai)
3. Self-hosted AI infrastructure

The LLM router already implemented in the backend allows switching providers via:

```
LLM_PROVIDER=groq
LLM_PROVIDER=openai
LLM_PROVIDER=local
```

This will make experimentation and model benchmarking possible.

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
