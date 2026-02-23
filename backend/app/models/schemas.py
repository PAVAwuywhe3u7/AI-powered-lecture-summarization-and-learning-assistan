from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExtractCaptionsRequest(BaseModel):
    youtube_url: str = Field(min_length=5)
    language: str | None = None


class VideoMetaResponse(BaseModel):
    video_id: str
    title: str
    thumbnail_url: str
    channel_title: str = ""


class ExtractCaptionsResponse(BaseModel):
    video_id: str
    transcript: str
    title: str
    thumbnail_url: str
    channel_title: str = ""
    used_title_fallback: bool = False


class StructuredSummary(BaseModel):
    overview_paragraphs: list[str] = Field(default_factory=list)
    key_definitions: list[str] = Field(default_factory=list)
    core_concepts: list[str] = Field(default_factory=list)
    important_examples: list[str] = Field(default_factory=list)
    exam_revision_points: list[str] = Field(default_factory=list)


class SummarizeRequest(BaseModel):
    transcript: str = Field(min_length=10)
    session_id: str | None = None


class SummarizeResponse(BaseModel):
    session_id: str
    summary: StructuredSummary


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None
    summary: StructuredSummary | None = None
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    session_id: str
    answer: str


class SolverChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = Field(default_factory=list)
    image_data_url: str | None = None


class SolverChatResponse(BaseModel):
    answer: str


class MCQItem(BaseModel):
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str


class MCQRequest(BaseModel):
    session_id: str | None = None
    summary: StructuredSummary | None = None


class MCQResponse(BaseModel):
    session_id: str
    mcqs: list[MCQItem] = Field(min_length=5, max_length=5)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: str | None = Field(default=None, max_length=80)
    department: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class AuthUser(BaseModel):
    id: str
    email: str
    name: str
    picture: str = ""
    role: str = ""
    department: str = ""
    created_at: str | None = None
    last_login_at: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: AuthUser
