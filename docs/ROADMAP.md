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

## Current Priorities

## LLM Infrastructure Setup (Priority)

**Goal:** Ensure the application can reliably generate flashcards by supporting multiple LLM providers and switching between them.

### 1. Multi-Provider LLM Support

Implement support for multiple providers:

- Groq
- OpenRouter
- OpenAI
- Anthropic (optional future)
- TogetherAI (optional future)

The system should allow switching providers via `.env`:

```
LLM_PROVIDER=groq
LLM_PROVIDER=openrouter
LLM_PROVIDER=openai
```

### 2. Provider Test Scripts

Create and maintain standalone test scripts for each provider.

**Location:** `tests/llm_providers/`

**Scripts:**

- `test_groq.py`
- `test_openrouter.py`
- `test_openai.py`
- `test_anthropic.py` (optional)
- `test_together.py` (optional)

Each test should:

- load API key from `.env`
- send a structured flashcard prompt
- print latency
- print token usage if available
- print returned JSON

### 3. Provider Fallback Routing

Implement automatic provider fallback.

**Flow:**

1. Try primary provider (Groq)
2. If request fails or times out → retry with OpenRouter
3. If OpenRouter fails → fallback to OpenAI

Log which provider handled the request.

### 4. LLM Cost Monitoring

Add optional cost tracking:

`.env`:

```
LLM_COST_TRACKING=1
```

Track:

- tokens used
- provider used
- estimated cost per request

### 5. Reliability Improvements (Future Task)

After provider setup is complete:

- Improve concept extraction reliability
- Improve entity extraction for topics like:
  - "famous scientists"
  - "well-known street photographers"
- Add caching for generated decks

---

## Core Learning Pipeline

The platform is built around a central learning pipeline that converts raw knowledge into structured learning material.

**High-level architecture:**

```
Knowledge Sources
    ↓
Content Extraction
    ↓
Concept Extraction
    ↓
Flashcard Generation
    ↓
Structured Learning
```

The system is designed to transform unstructured information (articles, videos, notes, textbooks) into organized learning material.

**Examples of knowledge sources:**

- Topics entered by the user
- Articles and webpages
- Wikipedia pages
- YouTube lectures
- PDFs and documents
- Personal notes

The platform extracts concepts from these sources and converts them into flashcards, decks, and eventually structured courses.

**This pipeline enables several powerful capabilities:**

- Generate flashcards from any content source
- Automatically organize knowledge into decks and collections
- Build structured courses from long documents
- Adapt flashcards to the user's background and learning goals
- Experiment with different AI models for knowledge extraction

This architecture allows the platform to evolve from a flashcard generator into a **knowledge-to-learning system**.

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

## Phase 2 — Knowledge Ingestion

Convert external knowledge sources into flashcards. This phase defines how the platform ingests content from multiple sources.

### Supported Sources

- **Topic** — User types a topic; system generates flashcards
- **Raw text / notes** — User pastes notes, lecture text, or study material
- **URLs** — User pastes a URL (Wikipedia, article, blog post)
- **Wikipedia** — User enters a concept; system fetches Wikipedia content automatically
- **YouTube transcripts** — User pastes a YouTube URL; system retrieves transcript
- **PDFs** — User uploads a PDF document
- **Future** — Markdown, text files, lecture slides

### Pipeline

```
Input Source
    ↓
Content Extraction
    ↓
Text Cleaning
    ↓
Concept Extraction
    ↓
Flashcard Generation
    ↓
Deck Creation
```

### Backend Architecture

New module: `apps/api/app/content_sources/`

Loaders:

- `url_loader.py`
- `text_loader.py`
- `wikipedia_loader.py`
- `youtube_loader.py`
- `pdf_loader.py`

Each loader returns:

```json
{
  "text": "... cleaned content ..."
}
```

This text is passed into the existing concept extraction pipeline.

### API Endpoints

- `POST /generate-from-url`
- `POST /generate-from-text`
- `POST /generate-from-wikipedia`
- `POST /generate-from-youtube`
- `POST /generate-from-pdf`

### UI

Generation page with input modes: Topic, URL, Paste Notes, Wikipedia, YouTube, PDF Upload.

User selects source → system generates deck.

### URL / Webpage

User pastes a URL. Pipeline: fetch page content → extract readable text → summarize key concepts → generate flashcards.

### Notes / Text

User pastes notes. Pipeline: chunk text → extract concepts → generate flashcards.

### Wikipedia Topic

User enters a concept (e.g. "Neural Networks"). System fetches Wikipedia content and generates flashcards.

### YouTube → Flashcards

User pastes a YouTube URL. System retrieves transcript via `youtube-transcript-api`, cleans and chunks it, extracts concepts, generates flashcards.

**Implementation:** `apps/api/app/content_sources/youtube_loader.py`

**Logic:** Extract video ID → retrieve transcript → concatenate segments → return cleaned text.

**API:** `POST /generate-from-youtube` — Request: `{ "url": "https://www.youtube.com/watch?v=XXXX" }` — Response: `{ "deck_title": "Video Title", "flashcards": [...] }`

**Future:** Timestamp linking — flashcards can include timestamp references (e.g. "Backpropagation is explained at 12:34 in the lecture").

**Use cases:** Lecture videos, programming tutorials, history documentaries, language lessons, university classes.

### PDF → Flashcards

User uploads a PDF. System extracts text, cleans and chunks it, extracts concepts, generates flashcards.

**Implementation:** `apps/api/app/content_sources/pdf_loader.py`

**Suggested libraries:** pypdf, pdfminer.six, pymupdf (fitz)

**Logic:** Read PDF → extract text page by page → combine into single document → return cleaned text.

**API:** `POST /generate-from-pdf` — Request: `multipart/form-data` with `file: lecture_notes.pdf` — Response: `{ "deck_title": "Lecture Notes Deck", "flashcards": [...] }`

**Future:** Smart section detection — detect headings or slide titles and group flashcards by section.

**Use cases:** Lecture slides, textbook chapters, research papers, study guides, documentation.

### Future Improvements

- Automatic summarization of long sources
- Source citation inside flashcards (`answer_detailed` may include reference to paragraph source)

### Strategic Advantage

Most flashcard tools require manual input. This feature allows users to transform **any** learning material (Wikipedia, lecture notes, blog posts, documentation, textbook excerpts, YouTube lectures) into flashcards automatically.

---

## Phase 3 — Knowledge Organization

Organize and manage decks generated from multiple sources. Combine collections, metadata, tags, and search.

### Hierarchy

```
Collection
    ↓
Deck
    ↓
Flashcards
```

### Collections

Decks can belong to a **Collection**. Collections group related decks.

**Example:** Collection "Machine Learning" — Decks: Neural Networks (YouTube), Gradient Descent (Wikipedia), ML Interview Questions (Topic).

**Use cases:** Course, subject, project, exam preparation.

**Example collections:** Spanish Learning, Machine Learning, History of Iran, Biology 101.

### Deck Metadata

Each deck stores metadata describing how it was created.

**Fields:** `source_type`, `source_url`, `source_title`, `generation_method`, `created_at`, `generated_by_ai`

**Example:** Deck "Neural Networks" — `source_type`: youtube, `source_url`: https://youtube.com/..., `source_title`: "Neural Networks Lecture – Andrew Ng"

**UI display:** Generated from YouTube, Generated from Wikipedia, Generated from Notes.

### Generation Status

Decks track generation state for long-running sources (PDFs, YouTube, large webpages).

**Values:** `generating`, `completed`, `failed`

**Example UI:** Neural Networks (YouTube) — Generating… | Persian Slang — Ready | ML Basics — Ready

### Deck Sections (Future)

Large decks may be divided into sections based on source structure.

**Example:** Deck "Machine Learning" — Sections: Supervised Learning, Neural Networks, Model Evaluation. Flashcards can optionally belong to a section.

### Tags and Search

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

### Strategic Value

Strong deck organization allows the product to scale beyond simple flashcard generation. Users can generate decks from multiple sources, group them by subject or project, track where content came from, and study material from many sources in one organized place.

---

## Phase 4 — Learning System

Transform the platform into a **structured learning system**. Merge adaptive learning, course building, concept graphs, and personalization.

### Spaced Repetition

- Spaced repetition scheduling
- Daily review queue
- Learning analytics
- AI tutor mode

### Concept Graph Extraction

Instead of generating flashcards directly from text, extract a concept graph first.

**Workflow:**

```
Content (topic, article, lecture notes, long document)
    ↓
AI extracts key concepts and relationships
    ↓
Structured concept graph
    ↓
Flashcards generated per concept
    ↓
Cards grouped by topic and subtopic
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

**Advantages:** Flashcards become structured; decks scale better; learners understand relationships; navigation across topics improves.

### AI Course Builder

Turn the platform into a knowledge-to-learning pipeline.

**Workflow:** User pastes article, book chapter, lecture transcript, or long document → AI produces structured topics, decks per topic, flashcards per concept, difficulty levels.

**Example output:**

```
Machine Learning Course

Module 1 — Linear Models
Module 2 — Optimization
Module 3 — Neural Networks
```

Each module contains flashcards automatically generated.

### Personalization

Generate flashcards that adapt to the user's background and interests.

**User profile attributes:** profession, expertise level, interests, learning goals

These attributes influence LLM prompts to produce more relevant study material.

---

## Phase 5 — Platform Infrastructure

Enable monitoring, debugging, cost tracking, authentication, monetization, and LLM experimentation.

### Authentication & Admin

- Google Authentication
- Admin Dashboard
- AI usage tracking
- Analytics

### Monetization

- Free plan
- Pro plan
- Stripe payments
- AI generation limits for free users
- Unlimited decks for Pro users

### LLM Architecture & Model Routing

Pluggable LLM router for switching providers without changing application logic.

**Architecture:**

```
Frontend
    ↓
FastAPI Backend
    ↓
LLM Router
    ↓
Providers: Groq, OpenAI, Local models (future)
```

**Capabilities:**

- Switch providers via `LLM_PROVIDER` environment variable
- Compare model output quality
- Route requests to different models
- Fallback models for reliability

**Providers:** Groq (current), OpenAI (future), Local models via Ollama (future)

### AI Reliability

**Structured JSON:** All providers return flashcards in strict JSON format. Backend validates before inserting.

**JSON validation:** Responses validated against schema. Invalid responses rejected and logged.

**Automatic retry:** On validation failure — retry with stricter prompt, attempt regeneration, optionally fall back to another provider.

**Fallback routing:** If provider fails — retry same provider, optionally route to OpenAI or local model.

**Logging:** All failures log topic, model used, raw LLM response, validation errors.

### Future AI Experiments

- A/B testing flashcard quality between models
- Compare explanation clarity
- Evaluate learning retention with different AI-generated cards
- Cost-aware routing (local vs API model)
- Adaptive model selection based on task difficulty

### Local LLM Support (Future)

Run open-source models locally instead of relying only on external APIs.

**Purpose:** Reduce costs, offline experimentation, full control, AI research.

**Possible models:** Llama 3, Mistral, Phi-3, Gemma

**Hosting:** Development machine (Ollama), dedicated GPU server (RunPod, Lambda Labs, Vast.ai), self-hosted infrastructure.

**Switch via:** `LLM_PROVIDER=groq`, `openai`, or `local`.

---

## Future Work — LLM Generation Improvements

These improvements aim to improve flashcard quality, reduce hallucinations, and better adapt flashcard generation to different topic types.

These items are future improvements and should not block current development.

### 1. Topic Type Detection

Currently, concept extraction treats all topics the same. Some topics require extracting specific entities (for example people, places, works) instead of abstract concepts.

Example:

Topic: "well-known street photographers"

Desired extraction:

Henri Cartier-Bresson  
Garry Winogrand  
Vivian Maier  
Robert Frank  
Diane Arbus  

Instead of abstract terms such as:

street photography  
urban scenes  
candid photography  

Planned solution:

Introduce a lightweight topic classifier before concept extraction.

Example topic types:

people_list  
historical_events  
scientific_concepts  
vocabulary  
works (books, films, artworks)  
general_topic  

Example heuristic implementation:

```
PERSON_LIST_HINTS = [
    "photographers",
    "scientists",
    "authors",
    "philosophers",
    "artists",
    "mathematicians",
    "leaders"
]

def topic_is_people_list(topic: str) -> bool:
    topic_lower = topic.lower()
    return any(word in topic_lower for word in PERSON_LIST_HINTS)
```

Concept extraction prompts can then adapt based on topic type.

---

### 2. Adaptive Concept Extraction Prompts

Instead of a single extraction prompt, prompts should adapt to topic type.

Examples:

People list topics  
Extract 5–10 notable individuals related to the topic. Return their names only.

Historical topics  
Extract key historical events, figures, or documents.

Scientific topics  
Extract key theories, concepts, or methods.

This improves flashcard specificity and relevance.

---

### 3. Reduce Hallucinated Facts

Some generated flashcards may contain incorrect or invented facts.

Future improvements may include:

lower temperature during flashcard generation  
grounding entity-based topics with reliable sources  
optional Wikipedia verification for entity topics

---

### 4. Improve Question Structure

Flashcards should emphasize active recall.

Preferred question patterns:

Who was X?  
What is X known for?  
When did X occur?  
What did X introduce?  

Avoid abstract prompts such as:

Why is X important?  
Explain X  

Goal: concise questions that test one fact per card.

---

### 5. Source-Grounded Flashcards

Future capability: generate flashcards directly from structured sources such as:

URLs  
articles  
PDFs  
Wikipedia pages  

Pipeline:

source text  
↓  
entity extraction  
↓  
fact extraction  
↓  
flashcard generation  

---

### Priority

These improvements should be implemented after the following core features are stable:

authentication  
guest mode  
deck management  
study interface  
LLM routing

---

## LLM Self-Refinement (Generator–Critic Flashcards)

### Overview

Introduce a two-stage LLM pipeline where one model generates flashcards and another model reviews and improves them.

### Purpose

Improve flashcard quality by:

- removing duplicate cards
- clarifying vague questions
- ensuring answers are correct
- enforcing the exact number of cards
- improving learning effectiveness

### Workflow

**Stage 1 — Generator**

The primary model (e.g., Groq or DeepSeek) generates N flashcards.

**Stage 2 — Critic**

A second model (e.g., Gemini or Claude) evaluates the generated cards and returns:

- corrected cards
- duplicate removals
- improved phrasing
- missing cards if fewer than requested

**Example flow:**

```
User request
   ↓
Generator LLM
   ↓
Flashcards produced
   ↓
Critic LLM review
   ↓
Improved flashcards returned
```

### Benefits

- higher quality cards
- fewer duplicates
- more consistent formatting
- better learning outcomes

### Implementation ideas

- Add optional flag: `enable_flashcard_review`
- Use a second LLM provider for review
- Cache both generation and review outputs
- Run critic only when card count or quality is questionable

### Status

Planned (future improvement).
