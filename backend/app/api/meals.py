from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.meal import Meal
from app.models.user import User
from app.schemas.meal import MealConfirm, MealCreate, MealRead, MealSummaryRead, MealUpdate
from app.services.meal_service import MealServiceError, analyze_meal, confirm_meal, update_meal_from_payload
from app.services.media_storage import ALLOWED_AUDIO_EXTENSIONS, ALLOWED_IMAGE_EXTENSIONS, delete_media_file, save_media_upload
from app.services.nutrition_ai import NutritionAiError

router = APIRouter(prefix="/meals", tags=["meals"])
settings = get_settings()


def _meal_query() -> select:
    return select(Meal).options(selectinload(Meal.items)).order_by(Meal.eaten_at.desc())


def _meal_or_404(meal_id: int, user_id: int, db: Session) -> Meal:
    meal = db.scalar(_meal_query().where(Meal.id == meal_id, Meal.user_id == user_id))
    if meal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found.")
    return meal


@router.get("", response_model=list[MealSummaryRead])
def list_meals(
    target_date: date | None = Query(default=None, alias="date"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Meal]:
    stmt = _meal_query().where(Meal.user_id == current_user.id)
    if target_date is not None:
        day_start = datetime.combine(target_date, datetime.min.time())
        day_end = day_start + timedelta(days=1)
        stmt = stmt.where(Meal.eaten_at >= day_start, Meal.eaten_at < day_end)
    return list(db.scalars(stmt).all())


@router.post("", response_model=MealRead, status_code=status.HTTP_201_CREATED)
def create_meal(
    payload: MealCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    meal = Meal(user_id=current_user.id, **payload.model_dump())
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return _meal_or_404(meal.id, current_user.id, db)


@router.post("/ingest", response_model=MealRead, status_code=status.HTTP_201_CREATED)
def ingest_meal(
    meal_type: str = Form(...),
    eaten_at: datetime = Form(...),
    transcript_text: str | None = Form(default=None),
    extra_text: str | None = Form(default=None),
    image_file: UploadFile | None = File(default=None),
    audio_file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    stored_image = None
    stored_audio = None
    meal = None

    try:
        if image_file is not None:
            stored_image = save_media_upload(
                image_file,
                storage_root=Path(settings.meal_upload_dir),
                max_bytes=settings.meal_max_image_upload_bytes,
                prefix=f"meal-image-{current_user.id}",
                allowed_extensions=ALLOWED_IMAGE_EXTENSIONS,
                kind_label="image",
            )
        if audio_file is not None:
            stored_audio = save_media_upload(
                audio_file,
                storage_root=Path(settings.meal_upload_dir),
                max_bytes=settings.meal_max_audio_upload_bytes,
                prefix=f"meal-audio-{current_user.id}",
                allowed_extensions=ALLOWED_AUDIO_EXTENSIONS,
                kind_label="audio",
            )

        meal = Meal(
            user_id=current_user.id,
            meal_type=meal_type,
            eaten_at=eaten_at,
            image_object_key=stored_image.relative_storage_path if stored_image else None,
            audio_object_key=stored_audio.relative_storage_path if stored_audio else None,
            transcript_text=(transcript_text or "").strip() or None,
            extra_text=(extra_text or "").strip() or None,
        )
        db.add(meal)
        db.commit()
        db.refresh(meal)

        analyze_meal(db, meal, current_user)
        return _meal_or_404(meal.id, current_user.id, db)
    except HTTPException:
        if meal is None:
            delete_media_file(stored_image.storage_path if stored_image else None)
            delete_media_file(stored_audio.storage_path if stored_audio else None)
        raise
    except (NutritionAiError, MealServiceError) as exc:
        if meal is None:
            delete_media_file(stored_image.storage_path if stored_image else None)
            delete_media_file(stored_audio.storage_path if stored_audio else None)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        if meal is None:
            delete_media_file(stored_image.storage_path if stored_image else None)
            delete_media_file(stored_audio.storage_path if stored_audio else None)
        raise


@router.get("/{meal_id}", response_model=MealRead)
def get_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    return _meal_or_404(meal_id, current_user.id, db)


@router.put("/{meal_id}", response_model=MealRead)
def update_meal(
    meal_id: int,
    payload: MealUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    meal = _meal_or_404(meal_id, current_user.id, db)
    update_meal_from_payload(db, meal, payload)
    return _meal_or_404(meal_id, current_user.id, db)


@router.post("/{meal_id}/analyze", response_model=MealRead)
def analyze_meal_route(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    meal = _meal_or_404(meal_id, current_user.id, db)
    try:
        analyze_meal(db, meal, current_user)
    except (NutritionAiError, MealServiceError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return _meal_or_404(meal_id, current_user.id, db)


@router.post("/{meal_id}/confirm", response_model=MealRead)
def confirm_meal_route(
    meal_id: int,
    payload: MealConfirm,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    meal = _meal_or_404(meal_id, current_user.id, db)
    confirm_meal(db, meal, current_user, payload)
    return _meal_or_404(meal_id, current_user.id, db)


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    meal = _meal_or_404(meal_id, current_user.id, db)
    db.delete(meal)
    db.commit()
