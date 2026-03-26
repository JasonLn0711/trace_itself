from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AccessGroupBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    can_use_project_tracer: bool = True
    can_use_asr: bool = False
    can_use_llm: bool = False


class AccessGroupCreate(AccessGroupBase):
    pass


class AccessGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    can_use_project_tracer: bool | None = None
    can_use_asr: bool | None = None
    can_use_llm: bool | None = None


class AccessGroupRead(AccessGroupBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    member_count: int = 0
    created_at: datetime
    updated_at: datetime
