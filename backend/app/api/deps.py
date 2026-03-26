from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.daily_log import DailyLog
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.task import Task


def require_auth(request: Request) -> None:
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")


def get_project_or_404(project_id: int, db: Session = Depends(get_db)) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def get_milestone_or_404(milestone_id: int, db: Session = Depends(get_db)) -> Milestone:
    milestone = db.get(Milestone, milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
    return milestone


def get_task_or_404(task_id: int, db: Session = Depends(get_db)) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


def get_daily_log_or_404(daily_log_id: int, db: Session = Depends(get_db)) -> DailyLog:
    daily_log = db.get(DailyLog, daily_log_id)
    if not daily_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily log not found.")
    return daily_log
