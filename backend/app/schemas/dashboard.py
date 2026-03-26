from pydantic import BaseModel

from app.schemas.daily_log import DailyLogRead
from app.schemas.milestone import MilestoneRead
from app.schemas.project import ProjectRead
from app.schemas.task import TaskRead

class DashboardSummary(BaseModel):
    active_projects: list[ProjectRead]
    today_tasks: list[TaskRead]
    overdue_tasks: list[TaskRead]
    upcoming_milestones: list[MilestoneRead]
    recent_daily_logs: list[DailyLogRead]
