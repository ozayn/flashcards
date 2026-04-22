import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class Plan(str, enum.Enum):
    free = "free"
    pro = "pro"


class SourceType(str, enum.Enum):
    topic = "topic"
    text = "text"
    url = "url"
    wikipedia = "wikipedia"
    youtube = "youtube"
    pdf = "pdf"
    manual = "manual"
    webpage = "webpage"  # legacy alias for url


class DeckStudyStatus(str, enum.Enum):
    """User-set workflow marker for a deck (not spaced-repetition progress)."""

    not_started = "not_started"
    in_progress = "in_progress"
    studied = "studied"


class GenerationStatus(str, enum.Enum):
    """Persisted on Deck.generation_status. UI treats completed as ready."""

    queued = "queued"
    generating = "generating"
    completed = "completed"
    failed = "failed"


class ReviewRating(str, enum.Enum):
    again = "again"
    hard = "hard"
    good = "good"
    easy = "easy"


class Difficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"
