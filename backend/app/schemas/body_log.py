from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class BodyLogBase(BaseModel):
    log_date: date
    weight_kg: float | None = Field(default=None, ge=0, le=500)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = None


class BodyLogCreate(BodyLogBase):
    pass


class BodyLogUpdate(BaseModel):
    log_date: date | None = None
    weight_kg: float | None = Field(default=None, ge=0, le=500)
    body_fat_pct: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = None


class BodyLogRead(BodyLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
