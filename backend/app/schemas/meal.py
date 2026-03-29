from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MealItemInput(BaseModel):
    food_name: str = Field(..., min_length=1, max_length=255)
    canonical_food_id: int | None = None
    estimated_portion_label: str | None = Field(default=None, max_length=100)
    estimated_quantity: float | None = Field(default=None, ge=0, le=100)
    estimated_unit: str | None = Field(default=None, max_length=50)
    calories: float | None = Field(default=None, ge=0, le=5000)
    protein_g: float | None = Field(default=None, ge=0, le=1000)
    carbs_g: float | None = Field(default=None, ge=0, le=1000)
    fat_g: float | None = Field(default=None, ge=0, le=1000)
    sugar_g: float | None = Field(default=None, ge=0, le=1000)
    sodium_mg: float | None = Field(default=None, ge=0, le=20000)
    fiber_g: float | None = Field(default=None, ge=0, le=500)
    confidence: float | None = Field(default=None, ge=0, le=1)
    source_type: str | None = Field(default=None, max_length=30)
    uncertain: bool = False
    notes: str | None = None


class MealBase(BaseModel):
    meal_type: str = Field(..., min_length=2, max_length=20)
    eaten_at: datetime
    image_object_key: str | None = None
    audio_object_key: str | None = None
    transcript_text: str | None = None
    extra_text: str | None = None


class MealCreate(MealBase):
    pass


class MealUpdate(BaseModel):
    meal_type: str | None = Field(default=None, min_length=2, max_length=20)
    eaten_at: datetime | None = None
    image_object_key: str | None = None
    audio_object_key: str | None = None
    transcript_text: str | None = None
    extra_text: str | None = None
    items: list[MealItemInput] | None = None


class MealConfirm(BaseModel):
    transcript_text: str | None = None
    extra_text: str | None = None
    items: list[MealItemInput] = Field(default_factory=list)


class MealItemRead(MealItemInput):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class MealSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meal_type: str
    eaten_at: datetime
    status: str
    total_calories: float | None
    total_protein_g: float | None
    total_carbs_g: float | None
    total_fat_g: float | None
    total_sugar_g: float | None
    total_sodium_mg: float | None
    total_fiber_g: float | None
    ai_summary: str | None
    suggestion_text: str | None
    user_confirmed: bool
    created_at: datetime
    updated_at: datetime


class MealRead(MealSummaryRead):
    image_object_key: str | None
    audio_object_key: str | None
    transcript_text: str | None
    extra_text: str | None
    items: list[MealItemRead]
