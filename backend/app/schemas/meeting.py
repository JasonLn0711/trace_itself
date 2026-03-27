from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MeetingRecordSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int | None
    project_name: str | None
    title: str
    audio_filename: str
    audio_mime_type: str | None
    file_size_bytes: int
    language: str | None
    duration_seconds: float | None
    summary_text: str
    action_items_text: str
    asr_model_name: str
    llm_model_name: str
    created_at: datetime
    updated_at: datetime


class MeetingRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int | None
    project_name: str | None
    title: str
    audio_filename: str
    audio_mime_type: str | None
    file_size_bytes: int
    language: str | None
    duration_seconds: float | None
    transcript_text: str
    minutes_text: str
    summary_text: str
    action_items_text: str
    asr_model_name: str
    llm_model_name: str
    created_at: datetime
    updated_at: datetime
