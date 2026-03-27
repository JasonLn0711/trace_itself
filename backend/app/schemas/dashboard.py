from datetime import date, datetime

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


class DashboardTimelineMilestoneItem(BaseModel):
    id: int
    project_id: int
    title: str
    start_date: date
    due_date: date
    status: str
    progress: int


class DashboardTimelineProjectItem(BaseModel):
    id: int
    name: str
    status: str
    start_date: date | None
    target_date: date | None
    milestones: list[DashboardTimelineMilestoneItem]


class DashboardTimeline(BaseModel):
    today: date
    window_start: date
    window_end: date
    projects: list[DashboardTimelineProjectItem]


class DashboardNextActionItem(BaseModel):
    action_title: str
    project_id: int | None
    project_name: str | None
    entity_type: str
    entity_id: int | None
    reason: str
    urgency_score: int
    due_date: date | None
    status: str | None
    route: str


class DashboardNextActions(BaseModel):
    items: list[DashboardNextActionItem]


class DashboardStagnationAlert(BaseModel):
    id: str
    category: str
    severity: str
    title: str
    description: str
    project_id: int | None
    project_name: str | None
    entity_type: str
    entity_id: int | None
    route: str
    due_date: date | None = None
    last_activity_at: datetime | None = None
    days_since_activity: int | None = None
    progress: int | None = None


class DashboardProjectHealthItem(BaseModel):
    project_id: int
    project_name: str
    status: str
    target_date: date | None
    completion_percent: int
    open_tasks: int
    overdue_tasks: int
    last_activity_at: datetime | None
    last_completion_at: datetime | None
    days_since_activity: int | None
    health: str
    note: str


class DashboardStagnation(BaseModel):
    alerts: list[DashboardStagnationAlert]
    project_health: list[DashboardProjectHealthItem]
    tracking_notes: list[str]


class DashboardRealityGapTrendPoint(BaseModel):
    label: str
    week_start: date
    planned_tasks: int
    completed_tasks: int


class DashboardRealityGap(BaseModel):
    planned_tasks_this_week: int
    completed_tasks_this_week: int
    weekly_completion_rate: int
    estimated_hours_this_week: float
    actual_hours_this_week: float
    overdue_ratio: int
    delay_rate: int
    trend: list[DashboardRealityGapTrendPoint]


class DashboardWeeklyReview(BaseModel):
    completed_tasks_this_week: int
    overdue_tasks: int
    most_active_project: str | None
    most_active_project_id: int | None
    inactive_projects: list[str]
    total_focus_hours: float
    focus_days_logged: int
    biggest_progress: str | None
    biggest_blocker: str | None
    summary_text: str


class DashboardActivityFeedItem(BaseModel):
    id: str
    event_type: str
    title: str
    detail: str | None
    entity_type: str
    entity_id: int | None
    project_id: int | None
    project_name: str | None
    changed_at: datetime
    route: str
    tone: str


class DashboardActivityFeed(BaseModel):
    items: list[DashboardActivityFeedItem]
