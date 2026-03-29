from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.body_log import BodyLog
from app.models.meal import Meal
from app.models.user import User
from app.schemas.nutrition_dashboard import (
    NutritionDashboardToday,
    NutritionDashboardWindow,
    NutritionRiskWindow,
    NutritionTopFood,
    NutritionTrendPoint,
    NutritionWeightPoint,
)
from app.services.nutrition_service import build_daily_guidance, calculate_day_totals, ensure_user_goal


def _round(value: float) -> float:
    return round(float(value), 2)


def _meals_for_window(db: Session, user_id: int, start_date: date, end_date: date) -> list[Meal]:
    window_start = datetime.combine(start_date, datetime.min.time())
    window_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    stmt = (
        select(Meal)
        .options(selectinload(Meal.items))
        .where(
            Meal.user_id == user_id,
            Meal.eaten_at >= window_start,
            Meal.eaten_at < window_end,
            Meal.status.in_(("analyzed", "confirmed")),
        )
        .order_by(Meal.eaten_at.asc())
    )
    return list(db.scalars(stmt).all())


def get_today_dashboard(db: Session, user: User) -> NutritionDashboardToday:
    today = date.today()
    goal = ensure_user_goal(db, user)
    meals = _meals_for_window(db, user.id, today, today)
    totals = calculate_day_totals(db, user.id, today)
    guidance = build_daily_guidance(goal, totals)
    calorie_target = goal.daily_calorie_target
    remaining = None if calorie_target is None else round(float(calorie_target) - totals["calories"], 2)

    high_risk_meals = [
        meal.meal_type
        for meal in meals
        if (meal.total_sugar_g or 0) >= 35
        or (meal.total_sodium_mg or 0) >= 1000
        or (calorie_target and (meal.total_calories or 0) >= calorie_target * 0.45)
    ]

    return NutritionDashboardToday(
        date=today,
        calorie_target=calorie_target,
        total_calories=totals["calories"],
        remaining_calories=remaining,
        total_protein_g=totals["protein_g"],
        total_carbs_g=totals["carbs_g"],
        total_fat_g=totals["fat_g"],
        total_sugar_g=totals["sugar_g"],
        total_sodium_mg=totals["sodium_mg"],
        total_fiber_g=totals["fiber_g"],
        meals=meals,
        high_risk_meals=high_risk_meals,
        encouragement=str(guidance["encouragement"]),
        suggestions=list(guidance["suggestions"]),
    )


def get_window_dashboard(db: Session, user: User, days: int) -> NutritionDashboardWindow:
    goal = ensure_user_goal(db, user)
    window_end = date.today()
    window_start = window_end - timedelta(days=days - 1)
    meals = _meals_for_window(db, user.id, window_start, window_end)
    body_logs = list(
        db.scalars(
            select(BodyLog)
            .where(BodyLog.user_id == user.id, BodyLog.log_date >= window_start, BodyLog.log_date <= window_end)
            .order_by(BodyLog.log_date.asc())
        ).all()
    )

    day_buckets: dict[date, dict[str, float]] = defaultdict(
        lambda: {"calories": 0.0, "protein_g": 0.0}
    )
    top_food_counter: Counter[str] = Counter()
    risk_window_counter: Counter[str] = Counter()

    for meal in meals:
        meal_day = meal.eaten_at.date()
        day_buckets[meal_day]["calories"] += float(meal.total_calories or 0)
        day_buckets[meal_day]["protein_g"] += float(meal.total_protein_g or 0)
        if (meal.total_sugar_g or 0) >= 35 or (meal.total_calories or 0) >= 700:
            risk_window_counter[meal.meal_type] += 1
        for item in meal.items:
            top_food_counter[item.food_name] += 1

    calorie_points: list[NutritionTrendPoint] = []
    total_calories = 0.0
    total_protein = 0.0
    protein_target_days = 0

    for index in range(days):
        current_day = window_start + timedelta(days=index)
        calories = _round(day_buckets[current_day]["calories"])
        protein = _round(day_buckets[current_day]["protein_g"])
        total_calories += calories
        total_protein += protein
        if goal.daily_protein_g and protein >= float(goal.daily_protein_g) * 0.9:
            protein_target_days += 1
        calorie_points.append(
            NutritionTrendPoint(
                date=current_day,
                label=current_day.strftime("%m/%d"),
                calories=calories,
                protein_g=protein,
            )
        )

    weight_points = [
        NutritionWeightPoint(date=log.log_date, weight_kg=float(log.weight_kg))
        for log in body_logs
        if log.weight_kg is not None
    ]

    top_foods = [NutritionTopFood(food_name=name, count=count) for name, count in top_food_counter.most_common(5)]
    risk_windows = [NutritionRiskWindow(meal_type=meal_type, count=count) for meal_type, count in risk_window_counter.most_common(4)]

    average_calories = _round(total_calories / days) if days else 0.0
    average_protein = _round(total_protein / days) if days else 0.0
    summary_text = (
        f"最近 {days} 天平均熱量約 {average_calories:.0f} kcal，"
        f"蛋白質平均 {average_protein:.1f} g。"
    )
    if top_foods:
        summary_text += f" 最常出現的是 {top_foods[0].food_name}。"
    if risk_windows:
        summary_text += f" 爆卡風險較常落在 {risk_windows[0].meal_type}。"

    return NutritionDashboardWindow(
        window_start=window_start,
        window_end=window_end,
        days=days,
        calorie_points=calorie_points,
        weight_points=weight_points,
        protein_target_days=protein_target_days,
        average_calories=average_calories,
        average_protein_g=average_protein,
        top_foods=top_foods,
        risk_windows=risk_windows,
        summary_text=summary_text,
    )
