from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_milestone_or_404
from app.core.enums import MilestoneStatus
from app.db.session import get_db
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.user import User
from app.schemas.milestone import MilestoneCreate, MilestoneRead, MilestoneUpdate

router = APIRouter(prefix="/milestones", tags=["milestones"])


def ensure_project_exists(project_id: int, current_user: User, db: Session) -> None:
    project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")


@router.get("", response_model=list[MilestoneRead])
def list_milestones(
    project_id: int | None = None,
    status_filter: MilestoneStatus | None = Query(default=None, alias="status"),
    due_before: date | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Milestone]:
    stmt = (
        select(Milestone)
        .where(Milestone.user_id == current_user.id)
        .order_by(Milestone.due_date.asc().nulls_last(), Milestone.created_at.desc())
    )
    if project_id is not None:
        stmt = stmt.where(Milestone.project_id == project_id)
    if status_filter:
        stmt = stmt.where(Milestone.status == status_filter)
    if due_before:
        stmt = stmt.where(Milestone.due_date <= due_before)
    return list(db.scalars(stmt).all())


@router.get("/upcoming", response_model=list[MilestoneRead])
def upcoming_milestones(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Milestone]:
    stmt = (
        select(Milestone)
        .where(
            Milestone.user_id == current_user.id,
            Milestone.due_date >= date.today(),
            Milestone.status != MilestoneStatus.COMPLETED,
        )
        .order_by(Milestone.due_date.asc().nulls_last())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.post("", response_model=MilestoneRead, status_code=status.HTTP_201_CREATED)
def create_milestone(
    payload: MilestoneCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Milestone:
    ensure_project_exists(payload.project_id, current_user, db)
    milestone = Milestone(user_id=current_user.id, **payload.model_dump())
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.get("/{milestone_id}", response_model=MilestoneRead)
def get_milestone(milestone: Milestone = Depends(get_milestone_or_404)) -> Milestone:
    return milestone


@router.put("/{milestone_id}", response_model=MilestoneRead)
def update_milestone(
    payload: MilestoneUpdate,
    milestone: Milestone = Depends(get_milestone_or_404),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Milestone:
    changes = payload.model_dump(exclude_unset=True)
    if "project_id" in changes:
        ensure_project_exists(changes["project_id"], current_user, db)
    for field, value in changes.items():
        setattr(milestone, field, value)
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(milestone: Milestone = Depends(get_milestone_or_404), db: Session = Depends(get_db)) -> None:
    db.delete(milestone)
    db.commit()
