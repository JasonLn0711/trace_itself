from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_daily_log_or_404
from app.db.session import get_db
from app.models.daily_log import DailyLog
from app.models.user import User
from app.schemas.daily_log import DailyLogCreate, DailyLogRead, DailyLogUpdate

router = APIRouter(prefix="/daily-logs", tags=["daily_logs"])


@router.get("", response_model=list[DailyLogRead])
def list_daily_logs(
    limit: int = Query(default=30, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DailyLog]:
    stmt = (
        select(DailyLog)
        .where(DailyLog.user_id == current_user.id)
        .order_by(DailyLog.log_date.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.post("", response_model=DailyLogRead, status_code=status.HTTP_201_CREATED)
def create_daily_log(
    payload: DailyLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyLog:
    daily_log = DailyLog(user_id=current_user.id, **payload.model_dump())
    db.add(daily_log)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A daily log already exists for that date.",
        ) from exc
    db.refresh(daily_log)
    return daily_log


@router.get("/{daily_log_id}", response_model=DailyLogRead)
def get_daily_log(daily_log: DailyLog = Depends(get_daily_log_or_404)) -> DailyLog:
    return daily_log


@router.put("/{daily_log_id}", response_model=DailyLogRead)
def update_daily_log(
    payload: DailyLogUpdate,
    daily_log: DailyLog = Depends(get_daily_log_or_404),
    db: Session = Depends(get_db),
) -> DailyLog:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(daily_log, field, value)
    db.add(daily_log)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A daily log already exists for that date.",
        ) from exc
    db.refresh(daily_log)
    return daily_log


@router.delete("/{daily_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_daily_log(daily_log: DailyLog = Depends(get_daily_log_or_404), db: Session = Depends(get_db)) -> None:
    db.delete(daily_log)
    db.commit()
