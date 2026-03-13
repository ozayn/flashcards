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


class GenerationStatus(str, enum.Enum):
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
