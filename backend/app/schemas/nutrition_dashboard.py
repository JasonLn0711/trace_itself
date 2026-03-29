from datetime import date

from pydantic import BaseModel

from app.schemas.meal import MealSummaryRead


class NutritionDashboardToday(BaseModel):
    date: date
    calorie_target: int | None
    total_calories: float
    remaining_calories: float | None
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    total_sugar_g: float
    total_sodium_mg: float
    total_fiber_g: float
    meals: list[MealSummaryRead]
    high_risk_meals: list[str]
    encouragement: str
    suggestions: list[str]


class NutritionTrendPoint(BaseModel):
    date: date
    label: str
    calories: float
    protein_g: float


class NutritionWeightPoint(BaseModel):
    date: date
    weight_kg: float


class NutritionTopFood(BaseModel):
    food_name: str
    count: int


class NutritionRiskWindow(BaseModel):
    meal_type: str
    count: int


class NutritionDashboardWindow(BaseModel):
    window_start: date
    window_end: date
    days: int
    calorie_points: list[NutritionTrendPoint]
    weight_points: list[NutritionWeightPoint]
    protein_target_days: int
    average_calories: float
    average_protein_g: float
    top_foods: list[NutritionTopFood]
    risk_windows: list[NutritionRiskWindow]
    summary_text: str
