from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_task_or_404
from app.core.enums import TaskStatus
from app.db.session import get_db
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


def validate_task_relations(project_id: int, milestone_id: int | None, current_user: User, db: Session) -> None:
    project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    if milestone_id is None:
        return

    milestone = db.scalar(select(Milestone).where(Milestone.id == milestone_id, Milestone.user_id == current_user.id))
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
    if milestone.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Milestone must belong to the same project as the task.",
        )


@router.get("", response_model=list[TaskRead])
def list_tasks(
    project_id: int | None = None,
    milestone_id: int | None = None,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    due_today: bool = False,
    overdue: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    stmt = (
        select(Task)
        .where(Task.user_id == current_user.id)
        .order_by(Task.due_date.asc().nulls_last(), Task.created_at.desc())
    )
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if milestone_id is not None:
        stmt = stmt.where(Task.milestone_id == milestone_id)
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if due_today:
        stmt = stmt.where(Task.due_date == date.today(), Task.status != TaskStatus.DONE)
    if overdue:
        stmt = stmt.where(Task.due_date < date.today(), Task.status != TaskStatus.DONE)
    return list(db.scalars(stmt).all())


@router.get("/overdue", response_model=list[TaskRead])
def overdue_tasks(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Task]:
    stmt = (
        select(Task)
        .where(Task.user_id == current_user.id, Task.due_date < date.today(), Task.status != TaskStatus.DONE)
        .order_by(Task.due_date.asc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    validate_task_relations(payload.project_id, payload.milestone_id, current_user, db)
    task = Task(user_id=current_user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task: Task = Depends(get_task_or_404)) -> Task:
    return task


@router.put("/{task_id}", response_model=TaskRead)
def update_task(
    payload: TaskUpdate,
    task: Task = Depends(get_task_or_404),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    changes = payload.model_dump(exclude_unset=True)
    if "project_id" in changes or "milestone_id" in changes:
        validate_task_relations(
            changes.get("project_id", task.project_id),
            changes.get("milestone_id", task.milestone_id),
            current_user,
            db,
        )
    for field, value in changes.items():
        setattr(task, field, value)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task: Task = Depends(get_task_or_404), db: Session = Depends(get_db)) -> None:
    db.delete(task)
    db.commit()
