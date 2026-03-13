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

## Flashcards from Any Source

*Core product capability.*

The system should allow users to generate flashcards from multiple types of inputs, not just a typed topic. This transforms the product from a simple flashcard generator into a learning ingestion tool.

### Supported Sources (Initial Roadmap)

**1. URL / Webpage**

User pastes a URL (e.g. Wikipedia, article, blog post).

Pipeline:

- Fetch page content
- Extract main readable text
- Summarize key concepts
- Generate flashcards

**2. Notes / Text**

User pastes notes, lecture text, or study material.

Pipeline:

- Chunk text
- Extract concepts
- Generate flashcards

**3. Wikipedia Topic**

User enters a concept (e.g. "Neural Networks"). System fetches Wikipedia content automatically and generates flashcards.

**4. YouTube Video**

User pastes a YouTube URL. System retrieves transcript and generates flashcards. See **YouTube → Flashcards** below.

**5. PDF**

User uploads a PDF. System extracts text and generates flashcards. See **PDF → Flashcards** below.

**6. File Upload (Future)**

- Markdown
- Text files
- Lecture slides

Pipeline:

- Parse document
- Extract key sections
- Generate flashcards

### Proposed Pipeline

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

New module:

```
apps/api/app/content_sources/
```

Possible files:

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

This text is then passed into the existing concept extraction pipeline.

### API Additions

- `POST /generate-from-url`
- `POST /generate-from-text`
- `POST /generate-from-wikipedia`
- `POST /generate-from-youtube`
- `POST /generate-from-pdf`

Each endpoint returns generated flashcards.

### UI Changes

Create a new generation page with input modes:

```
Generate Flashcards

[ ] Topic
[ ] URL
[ ] Paste Notes
[ ] Wikipedia
[ ] YouTube
[ ] PDF Upload
```

User selects source → system generates deck.

### Future Improvements

- Automatic summarization of long sources
- Source citation inside flashcards

Example: `answer_detailed` may include reference to paragraph source.

### Strategic Advantage

Most flashcard tools require manual input.

This feature allows users to transform **any** learning material into flashcards automatically.

Examples:

- Wikipedia article
- Lecture notes
- Blog post
- Documentation
- Textbook excerpt

This differentiates the product from traditional flashcard apps.

### YouTube → Flashcards

Users should be able to generate flashcards directly from YouTube educational videos.

**User flow:**

```
User pastes a YouTube URL
    ↓
System retrieves the video transcript
    ↓
Transcript is cleaned and chunked
    ↓
Key learning concepts are extracted
    ↓
Flashcards are generated
```

**Example use cases:**

- Lecture videos
- Programming tutorials
- History documentaries
- Language lessons
- University classes

**Example input:**

```
https://www.youtube.com/watch?v=XXXXX
```

**Example output:**

Deck: "Neural Networks – Lecture"

Flashcards generated from the lecture concepts.

#### Transcript Retrieval

**Preferred approach:** Use the `youtube-transcript-api` Python package.

**Example implementation location:** `apps/api/app/content_sources/youtube_loader.py`

**Example logic:**

1. Extract video ID from URL
2. Retrieve transcript
3. Concatenate transcript segments
4. Return cleaned text

**Example output:**

```json
{
  "text": "Full lecture transcript text..."
}
```

#### Pipeline

```
YouTube URL
    ↓
Transcript Retrieval
    ↓
Text Cleaning
    ↓
Concept Extraction
    ↓
Flashcard Generation
    ↓
Deck Creation
```

#### API Endpoint

`POST /generate-from-youtube`

**Request body example:**

```json
{
  "url": "https://www.youtube.com/watch?v=XXXX"
}
```

**Response:**

```json
{
  "deck_title": "Video Title",
  "flashcards": [...]
}
```

#### Future Improvements

**Timestamp linking**

Flashcards can include timestamp references so users can jump back to the exact moment in the video.

Example: `answer_detailed` may include:

> "Backpropagation is explained at 12:34 in the lecture."

#### Strategic Value

Educational video content is one of the most common learning formats today.

Allowing users to convert YouTube lectures into flashcards makes the tool extremely useful for:

- Students
- Self-learners
- Programmers
- Language learners

This feature significantly expands the product beyond traditional flashcard generation.

### PDF → Flashcards

Users should be able to upload a PDF document and automatically generate flashcards from its contents.

**Example use cases:**

- Lecture slides
- Textbook chapters
- Research papers
- Study guides
- Documentation

**User flow:**

```
User uploads a PDF
    ↓
System extracts text from the document
    ↓
Text is cleaned and chunked
    ↓
Key concepts are extracted
    ↓
Flashcards are generated
    ↓
A new deck is created
```

#### Content Extraction

Create a new loader module: `apps/api/app/content_sources/pdf_loader.py`

**Suggested libraries:**

- pypdf
- pdfminer.six
- pymupdf (fitz)

**The loader should:**

1. Read the PDF file
2. Extract text page by page
3. Combine text into a single document
4. Return cleaned text

**Example return format:**

```json
{
  "text": "Full extracted PDF text..."
}
```

#### Pipeline

```
PDF Upload
    ↓
Text Extraction
    ↓
Text Cleaning
    ↓
Concept Extraction
    ↓
Flashcard Generation
    ↓
Deck Creation
```

#### API Endpoint

`POST /generate-from-pdf`

**Example request:** `multipart/form-data`

```
file: lecture_notes.pdf
```

**Response:**

```json
{
  "deck_title": "Lecture Notes Deck",
  "flashcards": [...]
}
```

#### Future Improvements

**Smart section detection**

The system can detect headings or slide titles and group flashcards by section.

Example:

```
Deck: Machine Learning

Sections:
• Supervised Learning
• Neural Networks
• Model Evaluation
```

#### Strategic Value

Students often study from PDFs such as lecture slides and textbooks.

Allowing direct PDF ingestion lets users instantly convert large study materials into structured flashcards, significantly reducing manual effort.

---

## Deck Organization and Metadata

As the system supports generating decks from many sources (topics, URLs, notes, Wikipedia, YouTube, PDFs), the product needs a consistent way to organize and track generated decks.

### Collections

Decks can belong to a **Collection**. Collections group related decks together.

**Structure:**

```
Collection
    ↓
Deck
    ↓
Flashcards
```

**Example:**

Collection: **Machine Learning**

Decks:

- Neural Networks (YouTube)
- Gradient Descent (Wikipedia)
- ML Interview Questions (Topic)

Collections allow users to organize decks by:

- Course
- Subject
- Project
- Exam preparation

**Example collections:**

- Spanish Learning
- Machine Learning
- History of Iran
- Biology 101

### Deck Metadata

Each deck should store metadata describing how it was created.

**Suggested fields:**

- `source_type`
- `source_url`
- `source_title`
- `generation_method`
- `created_at`
- `generated_by_ai`

**Example:**

Deck: **Neural Networks**

Metadata:

- `source_type`: youtube
- `source_url`: https://youtube.com/...
- `source_title`: "Neural Networks Lecture – Andrew Ng"

This allows the UI to show:

- Generated from YouTube
- Generated from Wikipedia
- Generated from Notes

### Generation Status

Some sources (PDFs, YouTube transcripts, large webpages) may take longer to process. Decks should track generation state.

**Possible values:**

- `generating`
- `completed`
- `failed`

**Example UI:**

- Neural Networks (YouTube) — Generating…
- Persian Slang — Ready
- ML Basics — Ready

### Sections (Future)

Large decks may be divided into sections based on the source structure.

**Example:**

Deck: **Machine Learning**

Sections:

- Supervised Learning
- Neural Networks
- Model Evaluation

Flashcards can optionally belong to a section.

### Strategic Value

Strong deck organization allows the product to scale beyond simple flashcard generation and become a structured learning system.

Users can:

- Generate decks from multiple sources
- Group them by subject or project
- Track where the content came from
- Study material from many sources in one organized place

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
