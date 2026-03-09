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
