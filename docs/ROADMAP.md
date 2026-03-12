# Project Roadmap

## Product Vision

An AI-powered flashcard creation platform that converts knowledge from any source into structured learning material.

The product focuses on:

- AI-generated flashcards
- knowledge extraction
- structured learning
- personalization
- experimentation with different LLMs

It is not primarily a gamified study app, but a **knowledge generation and learning platform**.

---

## Phase 1 — Core Platform (MVP)

Establish the foundational product.

**Completed:**

- Project scaffolding (Next.js + FastAPI monorepo)
- Database models (Users, Decks, Flashcards, Reviews)
- Deck CRUD
- Flashcard CRUD
- Study interface (flip, swipe, ratings)
- AI flashcard generation
- Dark mode
- Mobile-friendly UI
- Production deployment

---

## Phase 2 — Knowledge Organization

Help users manage large knowledge bases.

**Features:**

- Tags for flashcards
- Deck folders / collections
- Deck categorization
- Search across decks
- Filter cards by tag or category

**Example structure:**

```
Machine Learning
  ├ Regression
  ├ Neural Networks
  └ Optimization
```

---

## Phase 3 — Flashcards From Anything

Generate flashcards from multiple types of input.

**Supported inputs:**

- topic
- raw text / notes
- URLs
- Wikipedia pages
- PDFs
- lecture transcripts
- YouTube videos (future)

**Workflow:**

```
User provides content
↓
System extracts concepts
↓
AI generates flashcards
↓
User edits cards
↓
Cards saved to deck
```

**Source tracking:**

- source_type
- source_url
- source_text

---

## Phase 4 — Personalization

Generate flashcards that adapt to the user's background and interests.

**User profile attributes:**

- profession
- expertise level
- interests
- learning goals

These attributes influence LLM prompts to produce more relevant study material.

---

## Phase 5 — Platform Infrastructure

Enable monitoring, debugging, and cost tracking.

**Purpose:**

- Monitoring platform growth
- Debugging
- Cost tracking

**Features:**

- Google Authentication
- Admin Dashboard
- AI usage tracking
- Analytics

---

## Phase 6 — Monetization

Introduce plans and payments.

**Features:**

- Free plan
- Pro plan
- Stripe payments
- AI generation limits for free users
- Unlimited decks for Pro users

---

## Phase 7 — Advanced Learning

Transform the app into an adaptive learning system.

**Features:**

- Spaced repetition
- Daily review queue
- Learning analytics
- AI tutor mode

---

## Phase 8 — AI Experiments

Technical architecture for LLM experimentation.

### LLM Architecture & Model Routing

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

### AI Reliability Improvements

To ensure flashcard generation is robust and production-ready, the platform will implement several reliability improvements.

**Structured JSON Generation**

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

**Automatic JSON Validation**

Responses will be validated against a schema before processing. Invalid responses will be rejected and logged.

**Automatic Retry on Failure**

If JSON validation fails:

1. Retry generation with a stricter prompt
2. Attempt regeneration with the same model
3. Optionally fall back to another LLM provider

**LLM Fallback Routing**

If a provider fails or returns invalid output:

- Retry with the same provider
- Optionally route to another provider (OpenAI, local model)

**Logging & Debugging**

All generation failures should log: topic, model used, raw LLM response, validation errors.

### Future AI Experiments

Planned experiments enabled by the LLM router:

- A/B testing flashcard quality between models
- Compare explanation clarity
- Evaluate learning retention with different AI-generated cards
- Cost-aware routing (local model vs API model)
- Adaptive model selection based on task difficulty

### Local LLM Support (Future)

The platform will eventually support running open-source language models locally instead of relying only on external APIs.

**Purpose:**

- Reduce AI API costs
- Allow offline experimentation
- Enable full control of AI generation
- Support AI research and model comparisons

**Possible local models:**

- Llama 3
- Mistral
- Phi-3
- Gemma

**Possible hosting setups:**

1. Development machine using Ollama
2. Dedicated GPU server (RunPod, Lambda Labs, Vast.ai)
3. Self-hosted AI infrastructure

The LLM router allows switching providers via `LLM_PROVIDER=groq`, `openai`, or `local`.

### Knowledge Graph Flashcard Generation

Instead of generating flashcards directly from text, the system will first extract a concept graph representing relationships between ideas.

**Workflow:**

```
User provides input content
• topic
• article
• lecture notes
• long document
↓
AI extracts key concepts and relationships.
↓
A structured concept graph is created.
↓
Flashcards are generated per concept.
↓
Cards are grouped by topic and subtopic.
```

**Example:**

```
Machine Learning
- Supervised Learning
    - Linear Regression
    - Logistic Regression
- Unsupervised Learning
    - Clustering
    - PCA
```

Each concept then produces flashcards such as:

**Q:** What is linear regression?  
**A:** A statistical model used to predict continuous values using a linear relationship.

**Advantages:**

- Flashcards become structured instead of random
- Decks scale better for large topics
- Learners understand relationships between ideas
- Navigation across topics becomes easier

This feature enables hierarchical decks and topic-based studying.

---

## Phase 9 — AI Course Builder

Allow users to paste any knowledge source and generate a structured learning course.

**Goal:**

Turn the platform into a knowledge-to-learning pipeline.

**Example workflow:**

User pastes:

- article
- book chapter
- lecture transcript
- long document

AI produces:

- structured topics
- decks per topic
- flashcards per concept
- difficulty levels

**Example output:**

```
Machine Learning Course

Module 1 — Linear Models
Module 2 — Optimization
Module 3 — Neural Networks
```

Each module contains flashcards automatically generated.
