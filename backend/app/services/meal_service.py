from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import AIProviderDriver, AIProviderKind, UsageEventKind
from app.models.ai_provider import AIProvider
from app.models.meal import Meal
from app.models.meal_analysis_job import MealAnalysisJob
from app.models.meal_item import MealItem
from app.models.user import User
from app.schemas.meal import MealConfirm, MealUpdate
from app.services.audio_storage import probe_audio_duration_seconds
from app.services.nutrition_ai import NutritionAiError, analyze_meal_multimodal, transcribe_meal_audio
from app.services.nutrition_service import (
    build_daily_guidance,
    calculate_day_totals,
    calculate_meal_totals,
    ensure_user_goal,
    format_suggestion_text,
    hydrate_item_input,
)
from app.services.usage_policy import ensure_audio_duration_allowed, ensure_llm_budget_available, get_or_create_usage_policy, record_usage_event

settings = get_settings()


class MealServiceError(RuntimeError):
    pass


def _apply_item_payloads(meal: Meal, payloads: list[dict[str, object]]) -> None:
    meal.items.clear()
    for item_payload in payloads:
        meal.items.append(
            MealItem(
                food_name=str(item_payload.get("food_name") or "").strip() or "未命名品項",
                canonical_food_id=item_payload.get("canonical_food_id"),
                estimated_portion_label=item_payload.get("estimated_portion_label"),
                estimated_quantity=item_payload.get("estimated_quantity"),
                estimated_unit=item_payload.get("estimated_unit"),
                calories=item_payload.get("calories"),
                protein_g=item_payload.get("protein_g"),
                carbs_g=item_payload.get("carbs_g"),
                fat_g=item_payload.get("fat_g"),
                sugar_g=item_payload.get("sugar_g"),
                sodium_mg=item_payload.get("sodium_mg"),
                fiber_g=item_payload.get("fiber_g"),
                confidence=item_payload.get("confidence"),
                source_type=item_payload.get("source_type"),
                uncertain=bool(item_payload.get("uncertain", False)),
                notes=item_payload.get("notes"),
            )
        )


def _sync_totals(meal: Meal) -> None:
    totals = calculate_meal_totals(list(meal.items))
    meal.total_calories = totals["total_calories"]
    meal.total_protein_g = totals["total_protein_g"]
    meal.total_carbs_g = totals["total_carbs_g"]
    meal.total_fat_g = totals["total_fat_g"]
    meal.total_sugar_g = totals["total_sugar_g"]
    meal.total_sodium_mg = totals["total_sodium_mg"]
    meal.total_fiber_g = totals["total_fiber_g"]


def _resolve_meal_gemini_provider(db: Session) -> AIProvider | None:
    stmt = (
        select(AIProvider)
        .where(
            AIProvider.driver == AIProviderDriver.GEMINI,
            AIProvider.kind == AIProviderKind.LLM,
            AIProvider.is_active.is_(True),
        )
        .order_by(AIProvider.updated_at.desc())
    )
    return db.scalar(stmt)


def _meal_media_path(relative_path: str | None) -> Path | None:
    if not relative_path:
        return None
    path = Path(settings.meal_upload_dir) / relative_path
    if not path.exists():
        return None
    return path


def _guess_mime_type(path: Path | None) -> str | None:
    if path is None:
        return None
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    if suffix == ".heic":
        return "image/heic"
    if suffix == ".heif":
        return "image/heif"
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".webm":
        return "audio/webm"
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".m4a":
        return "audio/mp4"
    if suffix == ".ogg" or suffix == ".opus":
        return "audio/ogg"
    return None


def _normalize_model_items(payload: dict[str, object]) -> list[dict[str, object]]:
    normalized_items: list[dict[str, object]] = []

    def append_items(raw_items: object, *, source_type: str, suffix_note: str | None = None) -> None:
        if not isinstance(raw_items, list):
            return
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            food_name = str(raw_item.get("name") or "").strip()
            if not food_name:
                continue
            notes = str(raw_item.get("notes") or "").strip()
            if suffix_note:
                notes = f"{notes} {suffix_note}".strip()
            normalized_items.append(
                {
                    "food_name": food_name,
                    "estimated_portion_label": str(raw_item.get("portion_label") or "").strip() or None,
                    "estimated_quantity": raw_item.get("quantity"),
                    "estimated_unit": str(raw_item.get("unit") or "").strip() or None,
                    "confidence": raw_item.get("confidence"),
                    "source_type": source_type,
                    "uncertain": bool(raw_item.get("uncertain", False)),
                    "notes": notes or None,
                }
            )

    append_items(payload.get("foods"), source_type="gemini_food")
    beverages = payload.get("beverages")
    if isinstance(beverages, list):
        for raw_item in beverages:
            if not isinstance(raw_item, dict):
                continue
            sweetness = str(raw_item.get("sweetness") or "").strip()
            suffix = f"Sweetness: {sweetness}." if sweetness else None
            append_items([raw_item], source_type="gemini_beverage", suffix_note=suffix)

    return normalized_items


def update_meal_from_payload(db: Session, meal: Meal, payload: MealUpdate) -> Meal:
    for field, value in payload.model_dump(exclude_unset=True, exclude={"items"}).items():
        setattr(meal, field, value)

    if payload.items is not None:
        hydrated_items = [hydrate_item_input(db, item.model_dump()) for item in payload.items]
        _apply_item_payloads(meal, hydrated_items)
        _sync_totals(meal)
        if hydrated_items:
            meal.status = "analyzed"

    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


def analyze_meal(db: Session, meal: Meal, user: User) -> Meal:
    job = MealAnalysisJob(meal_id=meal.id, status="running", started_at=datetime.utcnow())
    db.add(job)
    db.flush()

    try:
        gemini_provider = _resolve_meal_gemini_provider(db)
        if gemini_provider is None:
            raise MealServiceError("No active Gemini provider is configured. Add one in Control > Providers.")

        policy = get_or_create_usage_policy(db)
        ensure_llm_budget_available(db, user.id, policy)

        audio_path = _meal_media_path(meal.audio_object_key)
        image_path = _meal_media_path(meal.image_object_key)
        transcript_text = (meal.transcript_text or "").strip() or None

        if audio_path is not None:
            duration_seconds = probe_audio_duration_seconds(audio_path)
            ensure_audio_duration_allowed(duration_seconds, policy)
            transcript = transcribe_meal_audio(
                gemini_provider,
                audio_path=audio_path,
                mime_type=_guess_mime_type(audio_path) or "audio/webm",
            )
            transcript_text = transcript.transcript_text
            meal.transcript_text = transcript_text
            record_usage_event(
                db,
                user_id=user.id,
                kind=UsageEventKind.ASR_AUDIO,
                source="meal_audio_transcription",
                provider_id=gemini_provider.id,
                duration_seconds=duration_seconds,
            )

        payload = analyze_meal_multimodal(
            gemini_provider,
            meal_type=meal.meal_type,
            transcript_text=transcript_text,
            extra_text=meal.extra_text,
            image_path=image_path,
            image_mime_type=_guess_mime_type(image_path),
            user=user,
        )
        item_payloads = [hydrate_item_input(db, item) for item in _normalize_model_items(payload)]

        if not item_payloads:
            raise MealServiceError("Gemini did not return any meal items to review.")

        _apply_item_payloads(meal, item_payloads)
        _sync_totals(meal)

        meal.ai_summary = str(payload.get("overall_notes") or "").strip() or "Gemini completed the meal analysis."
        meal.status = "analyzed" if item_payloads else "draft"

        goal = ensure_user_goal(db, user)
        totals = calculate_day_totals(db, user.id, meal.eaten_at.date(), extra_meal=meal)
        guidance = build_daily_guidance(goal, totals)
        meal.suggestion_text = format_suggestion_text(guidance)

        job.status = "completed"
        job.finished_at = datetime.utcnow()
        record_usage_event(
            db,
            user_id=user.id,
            kind=UsageEventKind.LLM_TEXT,
            source="meal_multimodal_analysis",
            provider_id=gemini_provider.id,
        )
        db.add_all([meal, job])
        db.commit()
        db.refresh(meal)
        return meal
    except (NutritionAiError, MealServiceError) as exc:
        meal.status = "error"
        job.status = "failed"
        job.error_message = str(exc)
        job.finished_at = datetime.utcnow()
        db.add_all([meal, job])
        db.commit()
        raise
    except Exception as exc:
        meal.status = "error"
        job.status = "failed"
        job.error_message = str(exc)
        job.finished_at = datetime.utcnow()
        db.add_all([meal, job])
        db.commit()
        raise


def confirm_meal(db: Session, meal: Meal, user: User, payload: MealConfirm) -> Meal:
    if payload.transcript_text is not None:
        meal.transcript_text = payload.transcript_text
    if payload.extra_text is not None:
        meal.extra_text = payload.extra_text

    hydrated_items = [hydrate_item_input(db, item.model_dump()) for item in payload.items]
    _apply_item_payloads(meal, hydrated_items)
    _sync_totals(meal)

    goal = ensure_user_goal(db, user)
    totals = calculate_day_totals(db, user.id, meal.eaten_at.date(), extra_meal=meal)
    guidance = build_daily_guidance(goal, totals)

    meal.user_confirmed = True
    meal.status = "confirmed"
    meal.suggestion_text = format_suggestion_text(guidance)
    if not meal.ai_summary and hydrated_items:
        meal.ai_summary = f"本餐確認為 {'、'.join(item['food_name'] for item in hydrated_items[:4])}。"

    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal
