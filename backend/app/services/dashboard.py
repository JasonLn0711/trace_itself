from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import MilestoneStatus, ProjectStatus, TaskStatus
from app.models.daily_log import DailyLog
from app.models.milestone import Milestone
from app.models.product_update import ProductUpdate
from app.models.project import Project
from app.models.task import Task
from app.schemas.dashboard import DashboardSummary
from app.schemas.daily_log import DailyLogRead
from app.schemas.milestone import MilestoneRead
from app.schemas.product_update import ProductUpdateRead
from app.schemas.project import ProjectRead
from app.schemas.task import TaskRead


def get_dashboard_summary(db: Session, user_id: int) -> DashboardSummary:
    today = date.today()

    active_projects = list(
        db.scalars(
            select(Project)
            .where(Project.user_id == user_id, Project.status == ProjectStatus.ACTIVE)
            .order_by(Project.target_date.asc().nulls_last(), Project.created_at.desc())
            .limit(10)
        ).all()
    )

    today_tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == user_id, Task.due_date == today, Task.status != TaskStatus.DONE)
            .order_by(Task.priority.desc(), Task.created_at.desc())
            .limit(20)
        ).all()
    )

    overdue_tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == user_id, Task.due_date < today, Task.status != TaskStatus.DONE)
            .order_by(Task.due_date.asc(), Task.created_at.desc())
            .limit(20)
        ).all()
    )

    upcoming_milestones = list(
        db.scalars(
            select(Milestone)
            .where(
                Milestone.user_id == user_id,
                Milestone.due_date >= today,
                Milestone.status != MilestoneStatus.COMPLETED,
            )
            .order_by(Milestone.due_date.asc())
            .limit(10)
        ).all()
    )

    recent_daily_logs = list(
        db.scalars(
            select(DailyLog)
            .where(DailyLog.user_id == user_id)
            .order_by(DailyLog.log_date.desc())
            .limit(7)
        ).all()
    )

    recent_product_updates = list(
        db.scalars(
            select(ProductUpdate)
            .options(selectinload(ProductUpdate.author))
            .order_by(ProductUpdate.is_pinned.desc(), ProductUpdate.changed_at.desc(), ProductUpdate.id.desc())
            .limit(3)
        ).all()
    )

    all_projects = list(
        db.scalars(
            select(Project)
            .where(Project.user_id == user_id)
            .order_by(Project.created_at.desc())
        ).all()
    )
    all_tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == user_id)
            .order_by(Task.created_at.desc())
        ).all()
    )

    tasks_by_project: dict[int, list[Task]] = {}
    for task in all_tasks:
        tasks_by_project.setdefault(task.project_id, []).append(task)

    project_progress = []
    for project in all_projects[:8]:
        project_tasks = tasks_by_project.get(project.id, [])
        total_tasks = len(project_tasks)
        completed_tasks = len([task for task in project_tasks if task.status == TaskStatus.DONE])
        overdue_count = len(
            [
                task
                for task in project_tasks
                if task.due_date is not None and task.due_date < today and task.status != TaskStatus.DONE
            ]
        )
        completion_percent = 0 if total_tasks == 0 else round((completed_tasks / total_tasks) * 100)
        project_progress.append(
            {
                "project_id": project.id,
                "project_name": project.name,
                "total_tasks": total_tasks,
                "completed_tasks": completed_tasks,
                "overdue_tasks": overdue_count,
                "completion_percent": completion_percent,
                "target_date": project.target_date,
            }
        )

    status_counts: dict[str, int] = {}
    for task in all_tasks:
        status_counts[task.status.value] = status_counts.get(task.status.value, 0) + 1

    focus_hours_trend = [
        {
            "log_date": log.log_date,
            "total_focus_hours": float(log.total_focus_hours or 0),
        }
        for log in reversed(recent_daily_logs)
    ]

    return DashboardSummary(
        active_projects=[ProjectRead.model_validate(project) for project in active_projects],
        today_tasks=[TaskRead.model_validate(task) for task in today_tasks],
        overdue_tasks=[TaskRead.model_validate(task) for task in overdue_tasks],
        upcoming_milestones=[MilestoneRead.model_validate(milestone) for milestone in upcoming_milestones],
        recent_daily_logs=[DailyLogRead.model_validate(log) for log in recent_daily_logs],
        recent_product_updates=[ProductUpdateRead.model_validate(item) for item in recent_product_updates],
        project_progress=project_progress,
        task_status_breakdown=[
            {"status": status_name, "count": count}
            for status_name, count in sorted(status_counts.items(), key=lambda item: item[0])
        ],
        focus_hours_trend=focus_hours_trend,
    )
