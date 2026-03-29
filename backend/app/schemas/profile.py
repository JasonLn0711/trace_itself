from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_string_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    display_name: str | None
    age: int | None
    sex: str | None
    height_cm: float | None
    current_weight_kg: float | None
    target_weight_kg: float | None
    goal_type: str | None
    activity_level: str | None
    weekly_workouts: int | None
    workout_types: list[str] = Field(default_factory=list)
    location_region: str | None
    dietary_preferences: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    disliked_foods: list[str] = Field(default_factory=list)
    tracking_focus: list[str] = Field(default_factory=list)
    updated_at: datetime


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    age: int | None = Field(default=None, ge=0, le=120)
    sex: str | None = Field(default=None, max_length=20)
    height_cm: float | None = Field(default=None, ge=0, le=300)
    current_weight_kg: float | None = Field(default=None, ge=0, le=500)
    target_weight_kg: float | None = Field(default=None, ge=0, le=500)
    goal_type: str | None = Field(default=None, max_length=30)
    activity_level: str | None = Field(default=None, max_length=30)
    weekly_workouts: int | None = Field(default=None, ge=0, le=21)
    workout_types: list[str] | str | None = None
    location_region: str | None = Field(default=None, max_length=100)
    dietary_preferences: list[str] | str | None = None
    allergies: list[str] | str | None = None
    disliked_foods: list[str] | str | None = None
    tracking_focus: list[str] | str | None = None

    @field_validator(
        "workout_types",
        "dietary_preferences",
        "allergies",
        "disliked_foods",
        "tracking_focus",
        mode="before",
    )
    @classmethod
    def normalize_list_fields(cls, value: object) -> list[str] | None:
        if value is None:
            return None
        return _normalize_string_list(value)


class UserGoalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    daily_calorie_target: int | None
    daily_protein_g: float | None
    daily_carbs_g: float | None
    daily_fat_g: float | None
    daily_sugar_g: float | None
    daily_sodium_mg: float | None
    daily_fiber_g: float | None
    updated_at: datetime


class UserGoalUpdate(BaseModel):
    daily_calorie_target: int | None = Field(default=None, ge=0, le=10000)
    daily_protein_g: float | None = Field(default=None, ge=0, le=1000)
    daily_carbs_g: float | None = Field(default=None, ge=0, le=2000)
    daily_fat_g: float | None = Field(default=None, ge=0, le=1000)
    daily_sugar_g: float | None = Field(default=None, ge=0, le=1000)
    daily_sodium_mg: float | None = Field(default=None, ge=0, le=20000)
    daily_fiber_g: float | None = Field(default=None, ge=0, le=500)
