from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import MilestoneStatus, ProjectStatus, TaskStatus
from app.models.daily_log import DailyLog
from app.models.milestone import Milestone
from app.models.project import Project
from app.models.task import Task
from app.schemas.dashboard import DashboardSummary
from app.schemas.daily_log import DailyLogRead
from app.schemas.milestone import MilestoneRead
from app.schemas.project import ProjectRead
from app.schemas.task import TaskRead


def get_dashboard_summary(db: Session) -> DashboardSummary:
    today = date.today()

    active_projects = list(
        db.scalars(
            select(Project)
            .where(Project.status == ProjectStatus.ACTIVE)
            .order_by(Project.target_date.asc().nulls_last(), Project.created_at.desc())
            .limit(10)
        ).all()
    )

    today_tasks = list(
        db.scalars(
            select(Task)
            .where(Task.due_date == today, Task.status != TaskStatus.DONE)
            .order_by(Task.priority.desc(), Task.created_at.desc())
            .limit(20)
        ).all()
    )

    overdue_tasks = list(
        db.scalars(
            select(Task)
            .where(Task.due_date < today, Task.status != TaskStatus.DONE)
            .order_by(Task.due_date.asc(), Task.created_at.desc())
            .limit(20)
        ).all()
    )

    upcoming_milestones = list(
        db.scalars(
            select(Milestone)
            .where(Milestone.due_date >= today, Milestone.status != MilestoneStatus.COMPLETED)
            .order_by(Milestone.due_date.asc())
            .limit(10)
        ).all()
    )

    recent_daily_logs = list(
        db.scalars(select(DailyLog).order_by(DailyLog.log_date.desc()).limit(7)).all()
    )

    return DashboardSummary(
        active_projects=[ProjectRead.model_validate(project) for project in active_projects],
        today_tasks=[TaskRead.model_validate(task) for task in today_tasks],
        overdue_tasks=[TaskRead.model_validate(task) for task in overdue_tasks],
        upcoming_milestones=[MilestoneRead.model_validate(milestone) for milestone in upcoming_milestones],
        recent_daily_logs=[DailyLogRead.model_validate(log) for log in recent_daily_logs],
    )
