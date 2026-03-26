from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import MilestoneStatus


class MilestoneBase(BaseModel):
    project_id: int
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    status: MilestoneStatus = MilestoneStatus.PLANNED
    progress: int = Field(default=0, ge=0, le=100)


class MilestoneCreate(MilestoneBase):
    pass


class MilestoneUpdate(BaseModel):
    project_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    status: MilestoneStatus | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


class MilestoneRead(MilestoneBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
