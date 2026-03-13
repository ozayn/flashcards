# Website Flow & Authentication Strategy

This document defines the user experience flow, logged-out behavior, and Google authentication integration for the flashcard application.

The goal is to:

- allow users to experience value immediately
- avoid forcing login too early
- enable saving and organizing decks after authentication

---

## 1. Product Modes

The application supports two modes:

### 1. Exploration Mode (Logged Out)

Users can:

- generate flashcards
- view flashcards
- study a generated deck

Users cannot:

- save decks permanently
- organize decks
- create categories

This allows users to try the product without friction.

---

### 2. Workspace Mode (Logged In)

Users can:

- save decks
- organize decks into categories
- create decks
- generate flashcards
- study decks
- manage cards

---

## 2. Primary User Journey

Ideal flow for new users:

```
Landing page
    ↓
User enters topic or text
    ↓
Generate flashcards
    ↓
Preview deck
    ↓
Study flashcards
    ↓
User wants to save deck
    ↓
Prompt: "Continue with Google to save this deck"
```

This sequence follows the principle:

**Value first → login later**

---

## 3. Landing Page (Logged Out)

Main call to action:

**"Create flashcards instantly from a topic or text"**

Interface:

- Topic/Text input field

Example placeholder:

- "Paste text or enter a topic"

Buttons:

- **Generate Flashcards**

Navigation:

- Logo
- About
- Sign In

---

## 4. Flashcard Generation (Guest Mode)

Users can generate flashcards without authentication.

Generated deck is stored temporarily using either:

- **localStorage**
- or **temporary backend record** linked to a guest session

Example:

- `guest_session_id`

Temporary decks may expire after a defined time.

---

## 5. Save Deck Prompt

When a guest user attempts to save a deck:

Show prompt:

**"Sign in to save this deck and access it later."**

Buttons:

- **Continue with Google**

After login:

- Attach the temporary deck to the newly created user account.

---

## 6. Logged-In Navigation

Once authenticated, navigation changes.

Navbar:

- Logo
- Dashboard
- Create Deck
- Study
- Account

---

## 7. Dashboard

The dashboard shows:

- user's decks
- recent decks
- categories
- create new deck button

---

## 8. Deck Page

Each deck allows users to:

- generate additional cards
- add cards manually
- edit cards
- study deck
- delete deck

---

## 9. Study Page

Flashcard interface includes:

- flip card
- next card
- difficulty rating
- finish session

---

## 10. Google Authentication Flow

Authentication will use Google OAuth.

Flow:

```
User clicks "Continue with Google"
    ↓
Redirect to Google authentication
    ↓
Google returns authentication token
    ↓
Backend verifies token
    ↓
User account created or retrieved
    ↓
Session created
```

User database fields:

- `id`
- `email`
- `name`
- `google_id`
- `created_at`

---

## 11. Guest Session Handling

Guest users receive a temporary session identifier.

Example:

- `guest_session_id`

Temporary decks are associated with this identifier.

After authentication:

- **guest decks → migrated to user account**

---

## 12. Frontend Implementation

Recommended authentication library:

**NextAuth**

Responsibilities:

- Google OAuth integration
- session management
- frontend authentication state

---

## 13. Backend Responsibilities

FastAPI backend will:

- verify Google tokens
- create user records
- attach decks to user accounts
- manage session tokens

---

## 14. UX Design Principle

Authentication should never block the first experience.

Users should always be able to:

- generate flashcards
- preview results

Login should only be required when users attempt to:

- save decks
- organize decks
- access personal dashboard

---

## 15. Future Improvements

Possible enhancements:

- additional login providers (GitHub, Apple)
- guest session expiration policy
- analytics for guest-to-user conversion
- onboarding tutorial for first-time users
