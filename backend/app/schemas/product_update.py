from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import ProductUpdateType


class ProductUpdateBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=160)
    summary: str = Field(..., min_length=3, max_length=600)
    details: str | None = Field(default=None, max_length=4000)
    area: str = Field(..., min_length=2, max_length=80)
    change_type: ProductUpdateType = ProductUpdateType.UPDATE
    changed_at: datetime
    is_pinned: bool = False


class ProductUpdateCreate(ProductUpdateBase):
    pass


class ProductUpdateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    summary: str | None = Field(default=None, min_length=3, max_length=600)
    details: str | None = Field(default=None, max_length=4000)
    area: str | None = Field(default=None, min_length=2, max_length=80)
    change_type: ProductUpdateType | None = None
    changed_at: datetime | None = None
    is_pinned: bool | None = None


class ProductUpdateRead(ProductUpdateBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_user_id: int | None
    author_display_name: str | None = None
    created_at: datetime
    updated_at: datetime
