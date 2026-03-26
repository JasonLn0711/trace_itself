from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import UsageEventKind
from app.models.ai_usage_event import AIUsageEvent
from app.models.usage_policy import UsagePolicy

settings = get_settings()


@dataclass(slots=True)
class UsageSummary:
    llm_runs_last_24h: int
    llm_runs_remaining: int
    audio_seconds_last_24h: float
    window_hours: int = 24


def format_duration_label(seconds: int) -> str:
    if seconds % 3600 == 0:
        hours = seconds // 3600
        return f"{hours}h"
    if seconds % 60 == 0:
        minutes = seconds // 60
        return f"{minutes}m"
    return f"{seconds}s"


def get_or_create_usage_policy(db: Session) -> UsagePolicy:
    policy = db.scalar(select(UsagePolicy).order_by(UsagePolicy.id.asc()).limit(1))
    if policy is not None:
        return policy

    policy = UsagePolicy(
        id=1,
        llm_runs_per_24h=settings.default_llm_runs_per_24h,
        max_audio_seconds_per_request=settings.default_max_audio_seconds_per_request,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def usage_window_start(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    return current - timedelta(hours=24)


def build_usage_summary(db: Session, user_id: int, policy: UsagePolicy, now: datetime | None = None) -> UsageSummary:
    window_start = usage_window_start(now)
    llm_runs_last_24h = int(
        db.scalar(
            select(func.coalesce(func.sum(AIUsageEvent.request_units), 0)).where(
                AIUsageEvent.user_id == user_id,
                AIUsageEvent.kind == UsageEventKind.LLM_TEXT,
                AIUsageEvent.created_at >= window_start,
            )
        )
        or 0
    )
    audio_seconds_last_24h = float(
        db.scalar(
            select(func.coalesce(func.sum(AIUsageEvent.duration_seconds), 0)).where(
                AIUsageEvent.user_id == user_id,
                AIUsageEvent.kind == UsageEventKind.ASR_AUDIO,
                AIUsageEvent.created_at >= window_start,
            )
        )
        or 0
    )
    return UsageSummary(
        llm_runs_last_24h=llm_runs_last_24h,
        llm_runs_remaining=max(policy.llm_runs_per_24h - llm_runs_last_24h, 0),
        audio_seconds_last_24h=audio_seconds_last_24h,
    )


def ensure_llm_budget_available(db: Session, user_id: int, policy: UsagePolicy) -> UsageSummary:
    summary = build_usage_summary(db, user_id, policy)
    if summary.llm_runs_last_24h >= policy.llm_runs_per_24h:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Text AI budget reached. Each user gets {policy.llm_runs_per_24h} LLM runs per 24 hours.",
        )
    return summary


def ensure_audio_duration_allowed(duration_seconds: float | None, policy: UsagePolicy) -> None:
    if duration_seconds is None:
        return
    if duration_seconds > float(policy.max_audio_seconds_per_request):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio exceeds the {format_duration_label(policy.max_audio_seconds_per_request)} per file limit.",
        )


def record_usage_event(
    db: Session,
    *,
    user_id: int,
    kind: UsageEventKind,
    source: str,
    provider_id: int | None = None,
    request_units: int = 1,
    duration_seconds: float | None = None,
) -> AIUsageEvent:
    event = AIUsageEvent(
        user_id=user_id,
        provider_id=provider_id,
        kind=kind,
        source=source,
        request_units=request_units,
        duration_seconds=duration_seconds,
    )
    db.add(event)
    return event
