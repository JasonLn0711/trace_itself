from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import require_admin
from app.db.session import get_db
from app.models.access_group import AccessGroup
from app.models.user import User
from app.schemas.access_group import AccessGroupCreate, AccessGroupRead, AccessGroupUpdate

router = APIRouter(prefix="/access-groups", tags=["access_groups"], dependencies=[Depends(require_admin)])


def get_access_group_or_404(group_id: int, db: Session) -> AccessGroup:
    group = db.scalar(select(AccessGroup).options(selectinload(AccessGroup.users)).where(AccessGroup.id == group_id))
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access group not found.")
    return group


@router.get("", response_model=list[AccessGroupRead])
def list_access_groups(db: Session = Depends(get_db)) -> list[AccessGroup]:
    stmt = select(AccessGroup).options(selectinload(AccessGroup.users)).order_by(AccessGroup.name.asc())
    return list(db.scalars(stmt).all())


@router.post("", response_model=AccessGroupRead, status_code=status.HTTP_201_CREATED)
def create_access_group(payload: AccessGroupCreate, db: Session = Depends(get_db)) -> AccessGroup:
    group = AccessGroup(**payload.model_dump())
    db.add(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Access group already exists.") from exc
    db.refresh(group)
    return group


@router.put("/{group_id}", response_model=AccessGroupRead)
def update_access_group(group_id: int, payload: AccessGroupUpdate, db: Session = Depends(get_db)) -> AccessGroup:
    group = get_access_group_or_404(group_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    db.add(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Access group already exists.") from exc
    db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_access_group(group_id: int, db: Session = Depends(get_db)) -> None:
    group = get_access_group_or_404(group_id, db)
    if group.users:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Access group still has assigned users.")
    db.delete(group)
    db.commit()
