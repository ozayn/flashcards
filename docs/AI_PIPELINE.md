# AI Pipeline

This document describes how AI flashcard generation works in the system and how it may evolve in the future.

---

## Overview

The AI pipeline is responsible for converting knowledge sources into flashcards.

The system uses a modular architecture that allows switching between different language model providers.

**Current provider:**

- Groq

**Future providers:**

- OpenAI
- Local models via Ollama

The pipeline ensures that flashcards are generated in a structured JSON format and validated before being saved to the database.

---

## Flashcard Generation Flow

The current pipeline follows these steps:

```
User Input
(topic / notes / URL / text)
↓
Frontend sends request
↓
Backend API receives request
↓
LLM Router selects provider
↓
AI generates flashcards
↓
JSON validation
↓
Flashcards stored in database
↓
Frontend displays flashcards
```

---

## LLM Router

The backend contains a routing layer that abstracts AI providers.

**Provider selection** is controlled through an environment variable:

```
LLM_PROVIDER=groq
```

**Supported providers:**

- groq
- openai (future)
- local (future)

**Benefits of the router architecture:**

- experiment with different models
- compare flashcard quality
- fallback providers if generation fails
- optimize AI costs

---

## Prompt Strategy

Flashcard generation prompts instruct the model to return structured JSON.

**Example structure:**

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

**Prompt design goals:**

- clear instructions
- structured responses
- predictable outputs

---

## JSON Validation

All AI responses must be validated before being used.

**Validation steps:**

1. Parse response as JSON
2. Check schema
3. Verify flashcards array exists
4. Validate required fields

Invalid responses are rejected.

---

## Retry Strategy

If generation fails:

1. Retry generation with the same model
2. Use stricter prompt instructions
3. Optionally switch to another provider

This improves reliability.

---

## Logging

Generation failures should log:

- input topic
- provider used
- raw model response
- validation errors

This helps debugging and improving prompts.

---

## Future AI Pipeline

Future versions will introduce additional stages.

```
Concept extraction
↓
Knowledge graph construction
↓
Flashcard generation per concept
↓
Hierarchical decks
```

This will produce structured flashcard systems instead of flat lists.

---

## Future AI Features

Planned improvements:

- flashcards from URLs
- flashcards from PDFs
- lecture transcript parsing
- YouTube transcript ingestion
- AI course builder
- concept graph flashcards

---

## AI Course Builder (Future)

Long-form content will generate structured learning modules.

**Example:**

User provides article or lecture.

AI extracts topics:

```
Module 1
Module 2
Module 3
```

Each module generates flashcards automatically.

This transforms the system from a flashcard generator into a knowledge-to-learning pipeline.
