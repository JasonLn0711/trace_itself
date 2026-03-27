from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AsrTranscriptSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_filename: str
    audio_mime_type: str | None
    language: str | None
    duration_seconds: float | None
    file_size_bytes: int
    model_name: str
    excerpt: str
    created_at: datetime
    updated_at: datetime


class AsrTranscriptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_filename: str
    audio_mime_type: str | None
    language: str | None
    duration_seconds: float | None
    file_size_bytes: int
    model_name: str
    transcript_text: str
    created_at: datetime
    updated_at: datetime


class LiveAsrSessionCreate(BaseModel):
    provider_id: int | None = None
    language: str | None = None


class LiveAsrTranscriptEntryRead(BaseModel):
    id: str
    recorded_at: datetime
    text: str


class LiveAsrSessionRead(BaseModel):
    session_id: str
    state: str
    language: str | None
    duration_seconds: float
    level: float
    committed_text: str
    partial_text: str
    preview_text: str
    entries: list[LiveAsrTranscriptEntryRead]
    partial_entry: LiveAsrTranscriptEntryRead | None = None
    model_name: str
    final_ready: bool
