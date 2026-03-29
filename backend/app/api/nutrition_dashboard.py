from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.nutrition_dashboard import NutritionDashboardToday, NutritionDashboardWindow
from app.services.nutrition_dashboard import get_today_dashboard, get_window_dashboard

router = APIRouter(prefix="/dashboard", tags=["nutrition_dashboard"])


@router.get("/today", response_model=NutritionDashboardToday)
def dashboard_today(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionDashboardToday:
    return get_today_dashboard(db, current_user)


@router.get("/weekly", response_model=NutritionDashboardWindow)
def dashboard_weekly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionDashboardWindow:
    return get_window_dashboard(db, current_user, days=7)


@router.get("/monthly", response_model=NutritionDashboardWindow)
def dashboard_monthly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NutritionDashboardWindow:
    return get_window_dashboard(db, current_user, days=30)
