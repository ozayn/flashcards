from pydantic import BaseModel, Field

from app.models.enums import ReviewRating


class ReviewCreate(BaseModel):
    flashcard_id: str = Field(..., description="Flashcard ID")
    rating: ReviewRating = Field(..., description="User rating: again, hard, good, easy")
    user_id: str = Field(..., description="User ID")


class ReviewResponse(BaseModel):
    id: str
    flashcard_id: str
    rating: ReviewRating
    review_time: str
    next_review: str

    class Config:
        from_attributes = True
