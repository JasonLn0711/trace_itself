from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DailyLogBase(BaseModel):
    log_date: date
    summary: str = Field(..., min_length=1)
    blockers: str | None = None
    next_step: str | None = None
    total_focus_hours: float | None = Field(default=None, ge=0)


class DailyLogCreate(DailyLogBase):
    pass


class DailyLogUpdate(BaseModel):
    log_date: date | None = None
    summary: str | None = Field(default=None, min_length=1)
    blockers: str | None = None
    next_step: str | None = None
    total_focus_hours: float | None = Field(default=None, ge=0)


class DailyLogRead(DailyLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
