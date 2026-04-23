from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import Plan, UserRole


class GoogleOAuthSyncRequest(BaseModel):
    """Server-to-server: Next.js syncs Google profile after OAuth (protected by shared secret)."""

    google_sub: str = Field(..., min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    name: str = Field(default="Google user", min_length=1, max_length=255)
    picture: Optional[str] = Field(default=None, max_length=2048)


class UserCreate(BaseModel):
    email: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    role: UserRole = Field(default=UserRole.user)
    plan: Plan = Field(default=Plan.free)


class UserUsageLimits(BaseModel):
    """Included on GET /users/{id} when the caller is acting as that user (self-view)."""

    limited_tier: bool
    max_active_decks: int | None
    max_cards_per_deck: int | None
    active_deck_count: int


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    plan: Plan
    created_at: datetime
    picture_url: Optional[str] = None
    usage: Optional[UserUsageLimits] = None

    model_config = {"from_attributes": True}


class UserAdminListItem(BaseModel):
    """Admin users table: base profile plus last activity aggregate."""

    id: str
    email: str
    name: str
    role: UserRole
    plan: Plan
    access_role: Literal["owner", "admin", "user"]
    created_at: datetime
    picture_url: Optional[str] = None
    last_active_at: Optional[datetime] = None


class UserSettingsResponse(BaseModel):
    think_delay_enabled: bool = True
    think_delay_ms: int = Field(default=1500, ge=0, le=30000)
    card_style: str = "paper"
    english_tts: str = "default"
    voice_style: str = "default"

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    think_delay_enabled: Optional[bool] = None
    think_delay_ms: Optional[int] = Field(default=None, ge=0, le=30000)
    card_style: Optional[str] = Field(default=None, pattern="^(paper|minimal|modern|anki)$")
    english_tts: Optional[str] = Field(
        default=None, pattern="^(default|british|american)$"
    )
    voice_style: Optional[str] = Field(
        default=None, pattern="^(default|female|male)$"
    )


class UserProfileNameUpdate(BaseModel):
    """Display name only (email unchanged)."""

    name: str = Field(..., min_length=1, max_length=255)


class UserAdminUpdate(BaseModel):
    """Partial update for admin user management (maps to User.name / User.email)."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> "UserAdminUpdate":
        if self.name is None and self.email is None:
            raise ValueError("At least one of name or email must be provided")
        return self


class UserActivityItem(BaseModel):
    """Single row for the signed-in user's recent activity (not a global feed)."""

    id: str
    event_type: str
    created_at: datetime
    meta: Optional[Dict[str, Any]] = None


class UserDeletePreviewResponse(BaseModel):
    """Admin-only: user identity and owned deck count before delete."""

    id: str
    name: str
    email: str
    deck_count: int
