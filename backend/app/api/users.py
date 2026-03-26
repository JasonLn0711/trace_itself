from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.core.enums import UserRole
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserPasswordReset, UserRead, UserUpdate
from app.services.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


def get_user_for_admin_or_404(user_id: int, db: Session) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.get("", response_model=list[UserRead], dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    stmt = select(User).order_by(User.role.asc(), User.username.asc())
    return list(db.scalars(stmt).all())


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    user = User(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists.") from exc
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserRead, dependencies=[Depends(require_admin)])
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    user = get_user_for_admin_or_404(user_id, db)
    changes = payload.model_dump(exclude_unset=True)

    if user.id == current_user.id:
        if changes.get("is_active") is False:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account.")
        if changes.get("role") and changes["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove your own admin role.")

    for field, value in changes.items():
        setattr(user, field, value)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=UserRead, dependencies=[Depends(require_admin)])
def reset_password(user_id: int, payload: UserPasswordReset, db: Session = Depends(get_db)) -> User:
    user = get_user_for_admin_or_404(user_id, db)
    user.password_hash = hash_password(payload.password)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/unlock", response_model=UserRead, dependencies=[Depends(require_admin)])
def unlock_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = get_user_for_admin_or_404(user_id, db)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
