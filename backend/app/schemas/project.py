from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import PriorityLevel, ProjectStatus


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    priority: PriorityLevel = PriorityLevel.MEDIUM
    status: ProjectStatus = ProjectStatus.ACTIVE
    start_date: date | None = None
    target_date: date | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: PriorityLevel | None = None
    status: ProjectStatus | None = None
    start_date: date | None = None
    target_date: date | None = None


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
