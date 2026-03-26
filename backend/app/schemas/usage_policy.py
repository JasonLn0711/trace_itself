from datetime import datetime

from pydantic import BaseModel, Field


class UsagePolicyRead(BaseModel):
    id: int
    llm_runs_per_24h: int
    max_audio_seconds_per_request: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UsagePolicyUpdate(BaseModel):
    llm_runs_per_24h: int = Field(..., ge=1, le=1000)
    max_audio_seconds_per_request: int = Field(..., ge=60, le=24 * 60 * 60)


class UsageSummaryRead(BaseModel):
    llm_runs_last_24h: int
    llm_runs_remaining: int
    audio_seconds_last_24h: float
    window_hours: int = 24


class UsagePolicySnapshotRead(BaseModel):
    policy: UsagePolicyRead
    usage: UsageSummaryRead
