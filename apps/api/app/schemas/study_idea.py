from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

StudyIdeaStatus = Literal["idea", "ready", "archived"]


class StudyIdeaCreate(BaseModel):
    user_id: str
    title: str = Field(..., min_length=1, max_length=500)
    body: Optional[str] = None
    url: Optional[str] = Field(None, max_length=2048)
    status: StudyIdeaStatus = "idea"

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, v) -> str:
        if v is None:
            return "idea"
        s = str(v).strip().lower()
        if s not in ("idea", "ready", "archived"):
            raise ValueError("Invalid status")
        return s

    @field_validator("url", mode="before")
    @classmethod
    def _empty_url(cls, v) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v


class StudyIdeaUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    body: Optional[str] = None
    url: Optional[str] = Field(None, max_length=2048)
    status: Optional[StudyIdeaStatus] = None

    @field_validator("url", mode="before")
    @classmethod
    def _empty_url(cls, v) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v


class StudyIdeaResponse(BaseModel):
    id: str
    user_id: str
    title: str
    body: Optional[str] = None
    url: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
