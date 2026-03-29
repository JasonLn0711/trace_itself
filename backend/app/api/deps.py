from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AIProviderKind, AppFeature
from app.core.config import get_settings
from app.db.session import get_db
from app.models.body_log import BodyLog
from app.models.daily_log import DailyLog
from app.models.asr_transcript import AsrTranscript
from app.models.ai_provider import AIProvider
from app.models.meal import Meal
from app.models.milestone import Milestone
from app.models.meeting_record import MeetingRecord
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.services.user_sessions import get_user_session, touch_user_session
from app.services.feature_access import user_can_access_provider, user_has_feature

settings = get_settings()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user_id = request.session.get("user_id")
    session_token = request.session.get("session_token")
    if user_id is None or not session_token:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    auth_session = get_user_session(db, user_id=user.id, session_token=session_token)
    if auth_session is None:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    now = datetime.now(timezone.utc)
    if settings.session_idle_timeout_minutes > 0:
        idle_cutoff = now - timedelta(minutes=settings.session_idle_timeout_minutes)
        if auth_session.last_seen_at < idle_cutoff:
            db.delete(auth_session)
            db.commit()
            request.session.clear()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")

    touch_user_session(auth_session, now=now)
    db.add(auth_session)
    db.commit()

    return user


def require_auth(current_user: User = Depends(get_current_user)) -> User:
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user


def require_feature(feature: AppFeature):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if not user_has_feature(current_user, feature):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Feature access denied.")
        return current_user

    return dependency


require_project_tracer = require_feature(AppFeature.PROJECT_TRACER)
require_asr_access = require_feature(AppFeature.ASR)
require_llm_access = require_feature(AppFeature.LLM)


def list_available_ai_providers(
    kind: AIProviderKind,
    current_user: User,
    db: Session,
    *,
    include_inactive: bool = False,
) -> list[AIProvider]:
    stmt = select(AIProvider).where(AIProvider.kind == kind).order_by(AIProvider.is_active.desc(), AIProvider.name.asc())
    if not include_inactive:
        stmt = stmt.where(AIProvider.is_active.is_(True))
    providers = list(db.scalars(stmt).all())
    if current_user.role == "admin":
        return providers
    return [provider for provider in providers if provider.is_active and user_can_access_provider(current_user, provider)]


def resolve_ai_provider(
    *,
    kind: AIProviderKind,
    provider_id: int | None,
    current_user: User,
    db: Session,
) -> AIProvider:
    if provider_id is not None:
        provider = db.get(AIProvider, provider_id)
        if provider is None or provider.kind != kind:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI provider not found.")
        if not provider.is_active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI provider is inactive.")
        if not user_can_access_provider(current_user, provider):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider access denied.")
        return provider

    providers = list_available_ai_providers(kind, current_user, db)
    if not providers:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="No active AI provider is available.")
    return providers[0]


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


def get_body_log_or_404(
    body_log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BodyLog:
    body_log = db.scalar(select(BodyLog).where(BodyLog.id == body_log_id, BodyLog.user_id == current_user.id))
    if not body_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Body log not found.")
    return body_log


def get_asr_transcript_or_404(
    transcript_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AsrTranscript:
    transcript = db.scalar(select(AsrTranscript).where(AsrTranscript.id == transcript_id, AsrTranscript.user_id == current_user.id))
    if not transcript:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcript not found.")
    return transcript


def get_meal_or_404(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meal:
    meal = db.scalar(select(Meal).where(Meal.id == meal_id, Meal.user_id == current_user.id))
    if not meal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found.")
    return meal


def get_meeting_record_or_404(
    meeting_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetingRecord:
    meeting = db.scalar(select(MeetingRecord).where(MeetingRecord.id == meeting_id, MeetingRecord.user_id == current_user.id))
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting record not found.")
    return meeting
