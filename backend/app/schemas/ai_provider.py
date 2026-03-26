from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import AIProviderDriver, AIProviderKind


class AIProviderBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    kind: AIProviderKind
    driver: AIProviderDriver
    model_name: str = Field(..., min_length=2, max_length=160)
    base_url: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool = True


class AIProviderCreate(AIProviderBase):
    api_key: str | None = Field(default=None, max_length=512)


class AIProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    kind: AIProviderKind | None = None
    driver: AIProviderDriver | None = None
    model_name: str | None = Field(default=None, min_length=2, max_length=160)
    base_url: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None
    api_key: str | None = Field(default=None, max_length=512)


class AIProviderRead(AIProviderBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    has_api_key: bool
    api_key_hint: str | None = None
    created_at: datetime
    updated_at: datetime
