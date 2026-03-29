from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.body_log import BodyLog
from app.models.user import User
from app.schemas.body_log import BodyLogCreate, BodyLogRead, BodyLogUpdate

router = APIRouter(prefix="/body-logs", tags=["body_logs"])


def _body_log_or_404(body_log_id: int, user_id: int, db: Session) -> BodyLog:
    body_log = db.scalar(select(BodyLog).where(BodyLog.id == body_log_id, BodyLog.user_id == user_id))
    if body_log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Body log not found.")
    return body_log


def _sync_current_weight(user: User, body_log: BodyLog) -> None:
    if body_log.weight_kg is not None:
        user.current_weight_kg = body_log.weight_kg


@router.get("", response_model=list[BodyLogRead])
def list_body_logs(
    limit: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BodyLog]:
    stmt = (
        select(BodyLog)
        .where(BodyLog.user_id == current_user.id)
        .order_by(BodyLog.log_date.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.post("", response_model=BodyLogRead, status_code=status.HTTP_201_CREATED)
def create_body_log(
    payload: BodyLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BodyLog:
    body_log = BodyLog(user_id=current_user.id, **payload.model_dump())
    _sync_current_weight(current_user, body_log)
    db.add_all([body_log, current_user])
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A body log already exists for that date.") from exc
    db.refresh(body_log)
    return body_log


@router.put("/{body_log_id}", response_model=BodyLogRead)
def update_body_log(
    body_log_id: int,
    payload: BodyLogUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BodyLog:
    body_log = _body_log_or_404(body_log_id, current_user.id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(body_log, field, value)
    _sync_current_weight(current_user, body_log)
    db.add_all([body_log, current_user])
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A body log already exists for that date.") from exc
    db.refresh(body_log)
    return body_log


@router.delete("/{body_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_body_log(
    body_log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    body_log = _body_log_or_404(body_log_id, current_user.id, db)
    db.delete(body_log)
    db.commit()
