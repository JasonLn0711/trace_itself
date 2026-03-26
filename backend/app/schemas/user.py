from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.enums import UserRole


def normalize_username(value: str) -> str:
    return value.strip().lower()


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    display_name: str | None = Field(default=None, max_length=120)
    role: UserRole = UserRole.MEMBER
    access_group_id: int | None = None
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def normalize_user_name(cls, value: str) -> str:
        return normalize_username(value)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    role: UserRole | None = None
    access_group_id: int | None = None
    is_active: bool | None = None


class UserPasswordReset(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


class UserCapabilitiesRead(BaseModel):
    project_tracer: bool
    asr: bool
    llm: bool


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str | None
    role: UserRole
    access_group_id: int | None
    access_group_name: str | None
    capabilities: UserCapabilitiesRead
    is_active: bool
    failed_login_attempts: int
    locked_until: datetime | None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
