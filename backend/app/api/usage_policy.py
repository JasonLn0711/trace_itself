from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.usage_policy import UsagePolicyRead, UsagePolicySnapshotRead, UsagePolicyUpdate, UsageSummaryRead
from app.services.usage_policy import build_usage_summary, get_or_create_usage_policy

router = APIRouter(prefix="/usage-policy", tags=["usage_policy"])


@router.get("", response_model=UsagePolicySnapshotRead, dependencies=[Depends(get_current_user)])
def get_usage_policy_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UsagePolicySnapshotRead:
    policy = get_or_create_usage_policy(db)
    usage = build_usage_summary(db, current_user.id, policy)
    return UsagePolicySnapshotRead(
        policy=UsagePolicyRead.model_validate(policy),
        usage=UsageSummaryRead(
            llm_runs_last_24h=usage.llm_runs_last_24h,
            llm_runs_remaining=usage.llm_runs_remaining,
            audio_seconds_last_24h=usage.audio_seconds_last_24h,
            window_hours=usage.window_hours,
        ),
    )


@router.put("", response_model=UsagePolicyRead, dependencies=[Depends(require_admin)])
def update_usage_policy(payload: UsagePolicyUpdate, db: Session = Depends(get_db)) -> UsagePolicyRead:
    policy = get_or_create_usage_policy(db)
    policy.llm_runs_per_24h = payload.llm_runs_per_24h
    policy.max_audio_seconds_per_request = payload.max_audio_seconds_per_request
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return UsagePolicyRead.model_validate(policy)
