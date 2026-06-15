from typing import Literal

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=256)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class UserPublic(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None


class UserUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    email: str | None = Field(default=None, min_length=5, max_length=255)
    avatar_url: str | None = Field(default=None, max_length=2_000_000)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class MessageResponse(BaseModel):
    status: str
    detail: str


ErrorLogStatus = Literal["new", "in_progress", "resolved"]


class ErrorLogStatusUpdate(BaseModel):
    status: ErrorLogStatus


EventStatus = Literal[
    "proposed",
    "voting",
    "discussion",
    "accepted",
    "rejected",
    "completed",
]


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    external_url: str | None = Field(default=None, max_length=500)
    description: str = Field(min_length=10, max_length=5000)
    image_url: str | None = Field(default=None, max_length=2_000_000)


class EventStatusUpdate(BaseModel):
    status: EventStatus
    hidden: bool | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class AdminPostCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    text: str | None = Field(default=None, max_length=5000)
    body: str | None = Field(default=None, max_length=5000)
