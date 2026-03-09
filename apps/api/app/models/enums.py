import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class Plan(str, enum.Enum):
    free = "free"
    pro = "pro"


class SourceType(str, enum.Enum):
    topic = "topic"
    webpage = "webpage"
    text = "text"


class ReviewRating(str, enum.Enum):
    hard = "hard"
    medium = "medium"
    easy = "easy"


class Difficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"
