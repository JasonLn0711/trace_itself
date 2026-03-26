from datetime import date

from pydantic import BaseModel

from app.schemas.daily_log import DailyLogRead
from app.schemas.milestone import MilestoneRead
from app.schemas.product_update import ProductUpdateRead
from app.schemas.project import ProjectRead
from app.schemas.task import TaskRead


class ProjectProgressItem(BaseModel):
    project_id: int
    project_name: str
    total_tasks: int
    completed_tasks: int
    overdue_tasks: int
    completion_percent: int
    target_date: date | None


class TaskStatusBreakdownItem(BaseModel):
    status: str
    count: int


class FocusHoursPoint(BaseModel):
    log_date: date
    total_focus_hours: float


class DashboardSummary(BaseModel):
    active_projects: list[ProjectRead]
    today_tasks: list[TaskRead]
    overdue_tasks: list[TaskRead]
    upcoming_milestones: list[MilestoneRead]
    recent_daily_logs: list[DailyLogRead]
    recent_product_updates: list[ProductUpdateRead]
    project_progress: list[ProjectProgressItem]
    task_status_breakdown: list[TaskStatusBreakdownItem]
    focus_hours_trend: list[FocusHoursPoint]
