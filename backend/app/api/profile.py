from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.profile import ProfileRead, ProfileUpdate, UserGoalRead, UserGoalUpdate
from app.services.nutrition_service import ensure_user_goal

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileRead)
def get_profile(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.put("", response_model=ProfileRead)
def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    ensure_user_goal(db, current_user)
    db.refresh(current_user)
    return current_user


@router.get("/goals", response_model=UserGoalRead)
def get_profile_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserGoalRead:
    return ensure_user_goal(db, current_user)


@router.put("/goals", response_model=UserGoalRead)
def update_profile_goals(
    payload: UserGoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserGoalRead:
    goal = ensure_user_goal(db, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal
