from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_project_tracer
from app.db.session import get_db
from app.models.user import User
from app.schemas.dashboard import (
    DashboardActivityFeed,
    DashboardNextActions,
    DashboardRealityGap,
    DashboardStagnation,
    DashboardSummary,
    DashboardTimeline,
    DashboardWeeklyReview,
)
from app.services.dashboard import (
    get_dashboard_activity_feed,
    get_dashboard_next_actions,
    get_dashboard_reality_gap,
    get_dashboard_stagnation,
    get_dashboard_summary,
    get_dashboard_timeline,
    get_dashboard_weekly_review,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(require_project_tracer)])


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardSummary:
    return get_dashboard_summary(db, current_user.id)


@router.get("/timeline", response_model=DashboardTimeline)
def dashboard_timeline(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardTimeline:
    return get_dashboard_timeline(db, current_user.id)


@router.get("/next-actions", response_model=DashboardNextActions)
def dashboard_next_actions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardNextActions:
    return get_dashboard_next_actions(db, current_user.id)


@router.get("/stagnation", response_model=DashboardStagnation)
def dashboard_stagnation(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardStagnation:
    return get_dashboard_stagnation(db, current_user.id)


@router.get("/reality-gap", response_model=DashboardRealityGap)
def dashboard_reality_gap(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardRealityGap:
    return get_dashboard_reality_gap(db, current_user.id)


@router.get("/weekly-review", response_model=DashboardWeeklyReview)
def dashboard_weekly_review(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardWeeklyReview:
    return get_dashboard_weekly_review(db, current_user.id)


@router.get("/activity-feed", response_model=DashboardActivityFeed)
def dashboard_activity_feed(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DashboardActivityFeed:
    return get_dashboard_activity_feed(db, current_user.id)
