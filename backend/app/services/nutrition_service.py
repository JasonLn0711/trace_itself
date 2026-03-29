import re
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.food_catalog import FoodCatalog
from app.models.meal import Meal
from app.models.user import User
from app.models.user_goal import UserGoal

_CHINESE_NUMBER_MAP = {
    "半": 0.5,
    "一": 1,
    "二": 2,
    "兩": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}

_QUANTITY_PATTERN = re.compile(r"(半|[一二兩三四五六七八九十]|\d+(?:\.\d+)?)\s*(碗|杯|份|片|個|顆|條|塊|盤|匙)")

_PROTEIN_HINTS = "豆腐、雞胸、茶葉蛋或無糖豆漿"
_LIGHT_MEAL_HINTS = "燙青菜、豆腐、茶葉蛋或無糖茶"


def _as_float(value: object | None) -> float:
    if value is None:
        return 0.0
    return round(float(value), 2)


def _round_or_none(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _normalize_text(value: str | None) -> str:
    return (value or "").strip().lower()


def _activity_factor(level: str | None) -> float:
    normalized = _normalize_text(level)
    if normalized in {"高度", "high"}:
        return 1.725
    if normalized in {"中度", "moderate"}:
        return 1.55
    if normalized in {"輕度", "light"}:
        return 1.375
    return 1.2


def _goal_adjustment(goal_type: str | None) -> tuple[int, float]:
    normalized = _normalize_text(goal_type)
    if normalized in {"減脂", "fat_loss", "lose"}:
        return -350, 1.8
    if normalized in {"增肌", "muscle_gain", "gain"}:
        return 250, 2.0
    if normalized in {"維持", "maintain"}:
        return 0, 1.6
    return -100, 1.5


def _parse_quantity_token(token: str) -> float | None:
    stripped = token.strip()
    if not stripped:
        return None
    if stripped in _CHINESE_NUMBER_MAP:
        return _CHINESE_NUMBER_MAP[stripped]
    try:
        return float(stripped)
    except ValueError:
        return None


def _default_unit(serving_reference: str | None) -> str | None:
    if not serving_reference:
        return None
    lowered = serving_reference.lower()
    if "bowl" in lowered:
        return "碗"
    if "cup" in lowered:
        return "杯"
    if "piece" in lowered:
        return "個"
    if "plate" in lowered:
        return "盤"
    if "egg" in lowered:
        return "顆"
    if "fillet" in lowered:
        return "片"
    return "份"


def _extract_quantity(text: str, alias: str, serving_reference: str | None) -> tuple[float, str | None]:
    window_index = text.find(alias)
    if window_index >= 0:
        start = max(0, window_index - 10)
        end = min(len(text), window_index + len(alias) + 10)
        window = text[start:end]
    else:
        window = text

    match = _QUANTITY_PATTERN.search(window) or _QUANTITY_PATTERN.search(text)
    if match:
        quantity = _parse_quantity_token(match.group(1))
        if quantity is not None:
            return quantity, match.group(2)

    if "半碗" in window or "半碗" in text:
        return 0.5, "碗"
    if "半杯" in window or "半杯" in text:
        return 0.5, "杯"
    if "半份" in window or "半份" in text:
        return 0.5, "份"

    return 1.0, _default_unit(serving_reference)


def _sweetness_adjustment(text: str) -> tuple[str | None, float]:
    if "無糖" in text:
        return "無糖", 0.05
    if "微糖" in text:
        return "微糖", 0.35
    if "少糖" in text:
        return "少糖", 0.25
    if "半糖" in text:
        return "半糖", 0.5
    return None, 1.0


def calculate_goal_targets(user: User) -> dict[str, float | int | None]:
    weight = _as_float(user.current_weight_kg) or _as_float(user.target_weight_kg) or 70
    height = _as_float(user.height_cm) or 170
    age = user.age or 30
    normalized_sex = _normalize_text(user.sex)
    sex_adjustment = 5 if normalized_sex in {"male", "男", "m"} else -161 if normalized_sex in {"female", "女", "f"} else 0
    base_metabolism = (10 * weight) + (6.25 * height) - (5 * age) + sex_adjustment
    adjusted_calories = base_metabolism * _activity_factor(user.activity_level)
    calorie_delta, protein_factor = _goal_adjustment(user.goal_type)
    calorie_target = max(1200, round(adjusted_calories + calorie_delta))
    protein_g = round(weight * protein_factor, 1)
    fat_g = round(max(45, weight * 0.8), 1)
    carbs_g = round(max(80, (calorie_target - (protein_g * 4) - (fat_g * 9)) / 4), 1)
    sugar_g = 50.0
    sodium_mg = 2000.0
    fiber_g = 30.0 if normalized_sex in {"male", "男", "m"} else 25.0
    return {
        "daily_calorie_target": calorie_target,
        "daily_protein_g": protein_g,
        "daily_carbs_g": carbs_g,
        "daily_fat_g": fat_g,
        "daily_sugar_g": sugar_g,
        "daily_sodium_mg": sodium_mg,
        "daily_fiber_g": fiber_g,
    }


def ensure_user_goal(db: Session, user: User) -> UserGoal:
    goal = db.scalar(select(UserGoal).where(UserGoal.user_id == user.id))
    recommended = calculate_goal_targets(user)

    if goal is None:
        goal = UserGoal(user_id=user.id, **recommended)
        db.add(goal)
        db.commit()
        db.refresh(goal)
        return goal

    dirty = False
    for field, value in recommended.items():
        if getattr(goal, field) is None and value is not None:
            setattr(goal, field, value)
            dirty = True

    if dirty:
        db.add(goal)
        db.commit()
        db.refresh(goal)

    return goal


def list_food_catalog(db: Session) -> list[FoodCatalog]:
    stmt = select(FoodCatalog).order_by(FoodCatalog.verified.desc(), FoodCatalog.food_name.asc())
    return list(db.scalars(stmt).all())


def _find_alias_match(item: FoodCatalog, text: str) -> str | None:
    candidates = [item.food_name, *(item.aliases or [])]
    for alias in sorted({candidate for candidate in candidates if candidate}, key=len, reverse=True):
        if alias.lower() in text:
            return alias
    return None


def _item_from_catalog(item: FoodCatalog, alias: str, text: str) -> dict[str, object]:
    quantity, unit = _extract_quantity(text, alias.lower(), item.serving_reference)
    calories = _as_float(item.calories_per_serving) * quantity
    carbs = _as_float(item.carbs_g) * quantity
    sugar = _as_float(item.sugar_g) * quantity
    notes: list[str] = [f"Matched from transcript via {alias}."]

    if item.category == "beverage":
        sweetness_label, sweetness_factor = _sweetness_adjustment(text)
        if sweetness_label:
            calories = round(calories * sweetness_factor, 2)
            carbs = round(carbs * sweetness_factor, 2)
            sugar = round(sugar * sweetness_factor, 2)
            notes.append(f"Sweetness hint: {sweetness_label}.")

    return {
        "food_name": item.food_name,
        "canonical_food_id": item.id,
        "estimated_portion_label": f"{quantity:g}{unit or ''}",
        "estimated_quantity": quantity,
        "estimated_unit": unit,
        "calories": round(calories, 2),
        "protein_g": round(_as_float(item.protein_g) * quantity, 2),
        "carbs_g": round(carbs, 2),
        "fat_g": round(_as_float(item.fat_g) * quantity, 2),
        "sugar_g": round(sugar, 2),
        "sodium_mg": round(_as_float(item.sodium_mg) * quantity, 2),
        "fiber_g": round(_as_float(item.fiber_g) * quantity, 2),
        "confidence": 0.9 if alias == item.food_name else 0.78,
        "source_type": "catalog_match",
        "uncertain": False,
        "notes": " ".join(notes),
    }


def analyze_meal_text(db: Session, transcript_text: str | None, extra_text: str | None) -> tuple[list[dict[str, object]], str]:
    combined_text = " ".join(part for part in [transcript_text, extra_text] if part and part.strip()).strip()
    normalized_text = combined_text.lower()

    if not combined_text:
        return [], "尚未提供語音轉錄或補充描述，等待使用者補充。"

    catalog = list_food_catalog(db)
    items: list[dict[str, object]] = []
    seen_food_ids: set[int] = set()
    matched_aliases: list[str] = []

    for catalog_item in catalog:
        alias = _find_alias_match(catalog_item, normalized_text)
        if alias is None or catalog_item.id in seen_food_ids:
            continue
        if any(alias in existing_alias or existing_alias in alias for existing_alias in matched_aliases):
            continue
        items.append(_item_from_catalog(catalog_item, alias, normalized_text))
        seen_food_ids.add(catalog_item.id)
        matched_aliases.append(alias)

    if not items:
        snippet = combined_text[:48]
        items.append(
            {
                "food_name": snippet,
                "canonical_food_id": None,
                "estimated_portion_label": "1份",
                "estimated_quantity": 1.0,
                "estimated_unit": "份",
                "calories": 0.0,
                "protein_g": 0.0,
                "carbs_g": 0.0,
                "fat_g": 0.0,
                "sugar_g": 0.0,
                "sodium_mg": 0.0,
                "fiber_g": 0.0,
                "confidence": 0.2,
                "source_type": "manual_review",
                "uncertain": True,
                "notes": "Unable to confidently map this meal. Manual review is recommended.",
            }
        )

    summary_names = "、".join(item["food_name"] for item in items[:4])
    if len(items) > 4:
        summary_names += "等"
    return items, f"本餐初步拆解為 {summary_names}。"


def hydrate_item_input(db: Session, payload: dict[str, object]) -> dict[str, object]:
    catalog = list_food_catalog(db)
    food_name = str(payload.get("food_name") or "").strip()
    quantity = float(payload.get("estimated_quantity") or 1)
    canonical_food_id = payload.get("canonical_food_id")
    matched_catalog = None

    if canonical_food_id:
        matched_catalog = next((item for item in catalog if item.id == canonical_food_id), None)
    if matched_catalog is None:
        normalized_name = food_name.lower()
        matched_catalog = next(
            (
                item
                for item in catalog
                if item.food_name.lower() == normalized_name or normalized_name in [alias.lower() for alias in item.aliases or []]
            ),
            None,
        )

    if matched_catalog is not None:
        payload = {
            **payload,
            "canonical_food_id": matched_catalog.id,
            "calories": payload.get("calories") if payload.get("calories") is not None else _as_float(matched_catalog.calories_per_serving) * quantity,
            "protein_g": payload.get("protein_g") if payload.get("protein_g") is not None else _as_float(matched_catalog.protein_g) * quantity,
            "carbs_g": payload.get("carbs_g") if payload.get("carbs_g") is not None else _as_float(matched_catalog.carbs_g) * quantity,
            "fat_g": payload.get("fat_g") if payload.get("fat_g") is not None else _as_float(matched_catalog.fat_g) * quantity,
            "sugar_g": payload.get("sugar_g") if payload.get("sugar_g") is not None else _as_float(matched_catalog.sugar_g) * quantity,
            "sodium_mg": payload.get("sodium_mg") if payload.get("sodium_mg") is not None else _as_float(matched_catalog.sodium_mg) * quantity,
            "fiber_g": payload.get("fiber_g") if payload.get("fiber_g") is not None else _as_float(matched_catalog.fiber_g) * quantity,
            "source_type": payload.get("source_type") or "catalog_match",
        }
    else:
        payload = {
            **payload,
            "source_type": payload.get("source_type") or "manual",
        }

    return payload


def calculate_meal_totals(items: list[object]) -> dict[str, float]:
    return {
        "total_calories": round(sum(_as_float(getattr(item, "calories", None) if not isinstance(item, dict) else item.get("calories")) for item in items), 2),
        "total_protein_g": round(sum(_as_float(getattr(item, "protein_g", None) if not isinstance(item, dict) else item.get("protein_g")) for item in items), 2),
        "total_carbs_g": round(sum(_as_float(getattr(item, "carbs_g", None) if not isinstance(item, dict) else item.get("carbs_g")) for item in items), 2),
        "total_fat_g": round(sum(_as_float(getattr(item, "fat_g", None) if not isinstance(item, dict) else item.get("fat_g")) for item in items), 2),
        "total_sugar_g": round(sum(_as_float(getattr(item, "sugar_g", None) if not isinstance(item, dict) else item.get("sugar_g")) for item in items), 2),
        "total_sodium_mg": round(sum(_as_float(getattr(item, "sodium_mg", None) if not isinstance(item, dict) else item.get("sodium_mg")) for item in items), 2),
        "total_fiber_g": round(sum(_as_float(getattr(item, "fiber_g", None) if not isinstance(item, dict) else item.get("fiber_g")) for item in items), 2),
    }


def _day_bounds(target_date: date) -> tuple[datetime, datetime]:
    day_start = datetime.combine(target_date, time.min)
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


def get_day_meals(db: Session, user_id: int, target_date: date) -> list[Meal]:
    day_start, day_end = _day_bounds(target_date)
    stmt = (
        select(Meal)
        .where(
            Meal.user_id == user_id,
            Meal.eaten_at >= day_start,
            Meal.eaten_at < day_end,
            Meal.status.in_(("analyzed", "confirmed")),
        )
        .order_by(Meal.eaten_at.asc())
    )
    return list(db.scalars(stmt).all())


def calculate_day_totals(db: Session, user_id: int, target_date: date, extra_meal: Meal | None = None) -> dict[str, float]:
    meals = get_day_meals(db, user_id, target_date)
    if extra_meal is not None and extra_meal.id not in {meal.id for meal in meals} and extra_meal.status in {"analyzed", "confirmed"}:
        meals.append(extra_meal)

    totals = {
        "calories": 0.0,
        "protein_g": 0.0,
        "carbs_g": 0.0,
        "fat_g": 0.0,
        "sugar_g": 0.0,
        "sodium_mg": 0.0,
        "fiber_g": 0.0,
    }

    for meal in meals:
        totals["calories"] += _as_float(meal.total_calories)
        totals["protein_g"] += _as_float(meal.total_protein_g)
        totals["carbs_g"] += _as_float(meal.total_carbs_g)
        totals["fat_g"] += _as_float(meal.total_fat_g)
        totals["sugar_g"] += _as_float(meal.total_sugar_g)
        totals["sodium_mg"] += _as_float(meal.total_sodium_mg)
        totals["fiber_g"] += _as_float(meal.total_fiber_g)

    return {key: round(value, 2) for key, value in totals.items()}


def build_daily_guidance(goal: UserGoal, totals: dict[str, float]) -> dict[str, object]:
    suggestions: list[str] = []

    if goal.daily_protein_g and totals["protein_g"] < float(goal.daily_protein_g) * 0.65:
        suggestions.append(f"今天蛋白質還有空間，下一餐可優先補 { _PROTEIN_HINTS }。")
    if goal.daily_sugar_g and totals["sugar_g"] > float(goal.daily_sugar_g) * 0.8:
        suggestions.append("今天含糖來源偏多，接下來的飲料建議改成無糖茶。")
    if goal.daily_sodium_mg and totals["sodium_mg"] > float(goal.daily_sodium_mg) * 0.8:
        suggestions.append("今天鈉已經累積不少，下一餐可偏向清湯、少醬與原型食物。")
    if goal.daily_calorie_target and totals["calories"] > float(goal.daily_calorie_target) * 0.9:
        suggestions.append(f"今日熱量接近目標上限，若還會餓可以 { _LIGHT_MEAL_HINTS } 為主。")

    if not suggestions:
        suggestions.append("目前整體攝取還算平衡，下一餐維持蛋白質加蔬菜的組合就很好。")

    encouragement = "今天的紀錄已經很有幫助，先看整體趨勢比單餐完美更重要。"
    if goal.daily_protein_g and totals["protein_g"] >= float(goal.daily_protein_g) * 0.8:
        encouragement = "今天的蛋白質基礎打得不錯，接下來維持節奏就好。"

    next_meal_idea = f"下一餐可以考慮雞胸、豆腐或燙青菜，主食視飽足感抓半碗到一碗。"
    return {
        "encouragement": encouragement,
        "suggestions": suggestions[:3],
        "next_meal_idea": next_meal_idea,
    }


def format_suggestion_text(guidance: dict[str, object]) -> str:
    lines = [str(guidance.get("encouragement") or "").strip()]
    lines.extend(f"- {item}" for item in guidance.get("suggestions", []) if item)
    next_meal_idea = str(guidance.get("next_meal_idea") or "").strip()
    if next_meal_idea:
        lines.append(f"下一餐想法：{next_meal_idea}")
    return "\n".join(line for line in lines if line)


def goal_to_payload(goal: UserGoal) -> dict[str, float | int | None]:
    return {
        "daily_calorie_target": goal.daily_calorie_target,
        "daily_protein_g": _round_or_none(goal.daily_protein_g),
        "daily_carbs_g": _round_or_none(goal.daily_carbs_g),
        "daily_fat_g": _round_or_none(goal.daily_fat_g),
        "daily_sugar_g": _round_or_none(goal.daily_sugar_g),
        "daily_sodium_mg": _round_or_none(goal.daily_sodium_mg),
        "daily_fiber_g": _round_or_none(goal.daily_fiber_g),
    }
