from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.daily_log import DailyLog
from app.models.asr_transcript import AsrTranscript
from app.models.milestone import Milestone
from app.models.meeting_record import MeetingRecord
from app.models.project import Project
from app.models.task import Task
from app.models.user import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user_id = request.session.get("user_id")
    if user_id is None:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    return user


def require_auth(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user


def get_project_or_404(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Project:
    project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def get_milestone_or_404(
    milestone_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Milestone:
    milestone = db.scalar(select(Milestone).where(Milestone.id == milestone_id, Milestone.user_id == current_user.id))
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
    return milestone


def get_task_or_404(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == current_user.id))
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


def get_daily_log_or_404(
    daily_log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyLog:
    daily_log = db.scalar(select(DailyLog).where(DailyLog.id == daily_log_id, DailyLog.user_id == current_user.id))
    if not daily_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily log not found.")
    return daily_log


def get_asr_transcript_or_404(
    transcript_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AsrTranscript:
    transcript = db.scalar(select(AsrTranscript).where(AsrTranscript.id == transcript_id, AsrTranscript.user_id == current_user.id))
    if not transcript:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found.")
    return transcript


def get_meeting_record_or_404(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetingRecord:
    meeting = db.scalar(select(MeetingRecord).where(MeetingRecord.id == meeting_id, MeetingRecord.user_id == current_user.id))
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting record not found.")
    return meeting
