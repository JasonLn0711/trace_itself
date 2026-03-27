from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AuditEventPageViewCreate(BaseModel):
    path: str = Field(..., min_length=1, max_length=255)

    @field_validator("path")
    @classmethod
    def normalize_path(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Path is required.")
        if not normalized.startswith("/"):
            normalized = f"/{normalized.lstrip('/')}"
        return normalized[:255]


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    username: str | None
    display_name: str | None
    event_type: str
    path: str | None
    description: str | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
