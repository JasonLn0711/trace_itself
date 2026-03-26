from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AsrTranscriptSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    original_filename: str
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
    language: str | None
    duration_seconds: float | None
    file_size_bytes: int
    model_name: str
    transcript_text: str
    created_at: datetime
    updated_at: datetime
