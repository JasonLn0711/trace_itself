from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import MilestoneStatus, ProjectStatus, TaskStatus
from app.models.daily_log import DailyLog
from app.models.milestone import Milestone
from app.models.product_update import ProductUpdate
from app.models.project import Project
from app.models.task import Task
from app.schemas.dashboard import (
    DashboardActivityFeed,
    DashboardNextActions,
    DashboardRealityGap,
    DashboardStagnation,
    DashboardSummary,
    DashboardTimeline,
    DashboardWeeklyReview,
)
from app.schemas.daily_log import DailyLogRead
from app.schemas.milestone import MilestoneRead
from app.schemas.product_update import ProductUpdateRead
from app.schemas.project import ProjectRead
from app.schemas.task import TaskRead

TIMELINE_LOOKBACK_DAYS = 30
TIMELINE_LOOKAHEAD_DAYS = 30
STAGNATION_DAYS = 7
BACKLOG_ALERT_OPEN_TASK_THRESHOLD = 6
ACTIVITY_FEED_LOOKBACK_DAYS = 14
MAX_NEXT_ACTIONS = 6
MAX_ACTIVITY_FEED_ITEMS = 12

PRIORITY_SCORES = {
    "critical": 18,
    "high": 12,
    "medium": 6,
    "low": 0,
}

SEVERITY_SORT = {
    "high": 0,
    "medium": 1,
    "low": 2,
}

HEALTH_SORT = {
    "critical": 0,
    "watch": 1,
    "healthy": 2,
}


@dataclass
class DashboardDataset:
    today: date
    week_start: date
    week_end: date
    projects: list[Project]
    milestones: list[Milestone]
    tasks: list[Task]
    daily_logs: list[DailyLog]


def _normalize_timeline_milestone_dates(milestone: Milestone) -> tuple[date, date]:
    inferred_start = milestone.created_at.date()
    if milestone.due_date is None:
        return inferred_start, inferred_start
    if inferred_start > milestone.due_date:
        return milestone.due_date, milestone.due_date
    return inferred_start, milestone.due_date


def _start_of_week(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _days_until(value: date | None, today: date) -> int | None:
    if value is None:
        return None
    return (value - today).days


def _days_since(value: datetime | None, today: date) -> int | None:
    if value is None:
        return None
    return max(0, (today - value.date()).days)


def _ratio_as_percent(numerator: int, denominator: int) -> int:
    if denominator <= 0:
        return 0
    return round((numerator / denominator) * 100)


def _project_route(project_id: int | None) -> str:
    return f"/projects/{project_id}" if project_id else "/projects"


def _task_route(_: int | None = None) -> str:
    return "/tasks"


def _priority_score(value) -> int:
    priority_key = getattr(value, "value", value)
    return PRIORITY_SCORES.get(str(priority_key), 0)


def _load_dashboard_dataset(db: Session, user_id: int, daily_log_limit: int = 42) -> DashboardDataset:
    today = date.today()
    week_start = _start_of_week(today)
    week_end = week_start + timedelta(days=6)

    projects = list(
        db.scalars(
            select(Project)
            .where(Project.user_id == user_id)
            .order_by(Project.target_date.asc().nulls_last(), Project.created_at.desc())
        ).all()
    )
    milestones = list(
        db.scalars(
            select(Milestone)
            .where(Milestone.user_id == user_id)
            .order_by(Milestone.due_date.asc().nulls_last(), Milestone.updated_at.desc())
        ).all()
    )
    tasks = list(
        db.scalars(
            select(Task)
            .where(Task.user_id == user_id)
            .order_by(Task.updated_at.desc(), Task.created_at.desc())
        ).all()
    )
    daily_logs = list(
        db.scalars(
            select(DailyLog)
            .where(DailyLog.user_id == user_id)
            .order_by(DailyLog.log_date.desc())
            .limit(daily_log_limit)
        ).all()
    )

    return DashboardDataset(
        today=today,
        week_start=week_start,
        week_end=week_end,
        projects=projects,
        milestones=milestones,
        tasks=tasks,
        daily_logs=daily_logs,
    )


def _project_groups(dataset: DashboardDataset) -> tuple[dict[int, list[Milestone]], dict[int, list[Task]]]:
    milestones_by_project: dict[int, list[Milestone]] = defaultdict(list)
    tasks_by_project: dict[int, list[Task]] = defaultdict(list)
    for milestone in dataset.milestones:
        milestones_by_project[milestone.project_id].append(milestone)
    for task in dataset.tasks:
        tasks_by_project[task.project_id].append(task)
    return milestones_by_project, tasks_by_project


def _project_health_snapshot(
    project: Project,
    project_milestones: list[Milestone],
    project_tasks: list[Task],
    today: date,
) -> dict:
    total_tasks = len(project_tasks)
    completed_tasks = len([task for task in project_tasks if task.status == TaskStatus.DONE])
    open_tasks = len([task for task in project_tasks if task.status != TaskStatus.DONE])
    overdue_tasks = len(
        [
            task
            for task in project_tasks
            if task.due_date is not None and task.due_date < today and task.status != TaskStatus.DONE
        ]
    )

    activity_candidates = [project.updated_at]
    activity_candidates.extend(milestone.updated_at for milestone in project_milestones)
    activity_candidates.extend(task.updated_at for task in project_tasks)
    last_activity_at = max(activity_candidates) if activity_candidates else None

    completion_candidates = [task.updated_at for task in project_tasks if task.status == TaskStatus.DONE]
    last_completion_at = max(completion_candidates) if completion_candidates else None
    days_since_activity = _days_since(last_activity_at, today)
    days_since_completion = _days_since(last_completion_at, today)
    completion_percent = _ratio_as_percent(completed_tasks, total_tasks)
    target_days = _days_until(project.target_date, today)

    if target_days is not None and target_days < 0 and open_tasks > 0:
        health = "critical"
        note = f"Target slipped by {abs(target_days)} day{'s' if abs(target_days) != 1 else ''}."
    elif overdue_tasks > 0:
        health = "critical"
        note = f"{overdue_tasks} overdue task{'s' if overdue_tasks != 1 else ''} are blocking the track."
    elif days_since_activity is not None and days_since_activity >= STAGNATION_DAYS and open_tasks > 0:
        health = "watch"
        note = f"No meaningful movement for {days_since_activity} day{'s' if days_since_activity != 1 else ''}."
    elif open_tasks >= BACKLOG_ALERT_OPEN_TASK_THRESHOLD and (days_since_completion is None or days_since_completion >= STAGNATION_DAYS):
        health = "watch"
        note = f"{open_tasks} open tasks with no recent completions."
    else:
        health = "healthy"
        note = "Track is moving."

    return {
        "project_id": project.id,
        "project_name": project.name,
        "status": project.status.value,
        "target_date": project.target_date,
        "completion_percent": completion_percent,
        "open_tasks": open_tasks,
        "overdue_tasks": overdue_tasks,
        "last_activity_at": last_activity_at,
        "last_completion_at": last_completion_at,
        "days_since_activity": days_since_activity,
        "health": health,
        "note": note,
    }


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


def get_dashboard_timeline(db: Session, user_id: int) -> DashboardTimeline:
    today = date.today()
    window_start = today - timedelta(days=TIMELINE_LOOKBACK_DAYS)
    window_end = today + timedelta(days=TIMELINE_LOOKAHEAD_DAYS)

    active_projects = list(
        db.scalars(
            select(Project)
            .options(selectinload(Project.milestones))
            .where(Project.user_id == user_id, Project.status == ProjectStatus.ACTIVE)
            .order_by(Project.target_date.asc().nulls_last(), Project.created_at.desc())
        ).all()
    )

    timeline_projects = []
    for project in active_projects:
        milestone_items = []
        ordered_milestones = sorted(
            project.milestones,
            key=lambda milestone: (milestone.due_date or milestone.created_at.date(), milestone.created_at, milestone.id),
        )

        for milestone in ordered_milestones:
            start_date, due_date = _normalize_timeline_milestone_dates(milestone)
            if due_date < window_start or start_date > window_end:
                continue

            milestone_items.append(
                {
                    "id": milestone.id,
                    "project_id": project.id,
                    "title": milestone.title,
                    "start_date": start_date,
                    "due_date": due_date,
                    "status": milestone.status.value,
                    "progress": milestone.progress,
                }
            )

        target_in_window = project.target_date is not None and window_start <= project.target_date <= window_end
        if not milestone_items and not target_in_window:
            continue

        timeline_projects.append(
            {
                "id": project.id,
                "name": project.name,
                "status": project.status.value,
                "start_date": project.start_date,
                "target_date": project.target_date,
                "milestones": milestone_items,
            }
        )

    return DashboardTimeline(
        today=today,
        window_start=window_start,
        window_end=window_end,
        projects=timeline_projects,
    )


def get_dashboard_stagnation(db: Session, user_id: int) -> DashboardStagnation:
    dataset = _load_dashboard_dataset(db, user_id)
    milestones_by_project, tasks_by_project = _project_groups(dataset)
    active_projects = [project for project in dataset.projects if project.status == ProjectStatus.ACTIVE]

    project_health = [
        _project_health_snapshot(
            project,
            milestones_by_project.get(project.id, []),
            tasks_by_project.get(project.id, []),
            dataset.today,
        )
        for project in active_projects
    ]

    alerts = []
    for item in project_health:
        if item["days_since_activity"] is not None and item["days_since_activity"] >= STAGNATION_DAYS and item["open_tasks"] > 0:
            severity = "high" if item["days_since_activity"] >= 14 else "medium"
            alerts.append(
                {
                    "id": f"project-drift-{item['project_id']}",
                    "category": "drifting_project",
                    "severity": severity,
                    "title": f"{item['project_name']} is drifting",
                    "description": item["note"],
                    "project_id": item["project_id"],
                    "project_name": item["project_name"],
                    "entity_type": "project",
                    "entity_id": item["project_id"],
                    "route": _project_route(item["project_id"]),
                    "last_activity_at": item["last_activity_at"],
                    "days_since_activity": item["days_since_activity"],
                }
            )

        last_completion_days = _days_since(item["last_completion_at"], dataset.today)
        if item["open_tasks"] >= BACKLOG_ALERT_OPEN_TASK_THRESHOLD and (last_completion_days is None or last_completion_days >= STAGNATION_DAYS):
            alerts.append(
                {
                    "id": f"project-backlog-{item['project_id']}",
                    "category": "backlog_pressure",
                    "severity": "medium",
                    "title": f"{item['project_name']} is carrying too much open work",
                    "description": f"{item['open_tasks']} open tasks and no recent completions on the board.",
                    "project_id": item["project_id"],
                    "project_name": item["project_name"],
                    "entity_type": "project",
                    "entity_id": item["project_id"],
                    "route": _project_route(item["project_id"]),
                    "last_activity_at": item["last_activity_at"],
                    "days_since_activity": item["days_since_activity"],
                }
            )

    project_name_by_id = {project.id: project.name for project in dataset.projects}
    for milestone in dataset.milestones:
        if milestone.project_id not in project_name_by_id:
            continue
        if milestone.status == MilestoneStatus.COMPLETED or milestone.due_date is None:
            continue

        days_to_due = _days_until(milestone.due_date, dataset.today)
        if days_to_due is None:
            continue

        at_risk = days_to_due < 0 or (days_to_due <= 7 and milestone.progress < 70)
        if not at_risk:
            continue

        severity = "high" if days_to_due < 0 or days_to_due <= 2 or milestone.progress < 35 else "medium"
        description = (
            f"Overdue and only {milestone.progress}% complete."
            if days_to_due < 0
            else f"Due in {days_to_due} day{'s' if days_to_due != 1 else ''} at {milestone.progress}% progress."
        )
        alerts.append(
            {
                "id": f"milestone-risk-{milestone.id}",
                "category": "milestone_risk",
                "severity": severity,
                "title": milestone.title,
                "description": description,
                "project_id": milestone.project_id,
                "project_name": project_name_by_id.get(milestone.project_id),
                "entity_type": "milestone",
                "entity_id": milestone.id,
                "route": _project_route(milestone.project_id),
                "due_date": milestone.due_date,
                "progress": milestone.progress,
            }
        )

    alerts.sort(
        key=lambda item: (
            SEVERITY_SORT.get(item["severity"], 99),
            item.get("due_date") or date.max,
            -(item.get("days_since_activity") or 0),
            item["title"],
        )
    )
    project_health.sort(
        key=lambda item: (
            HEALTH_SORT.get(item["health"], 99),
            -item["overdue_tasks"],
            -(item["days_since_activity"] or 0),
            item["target_date"] or date.max,
            item["project_name"],
        )
    )

    return DashboardStagnation(
        alerts=alerts[:8],
        project_health=project_health,
        tracking_notes=["Task postponement counts are not tracked yet, so repeated reschedules are not surfaced in this MVP."],
    )


def get_dashboard_next_actions(db: Session, user_id: int) -> DashboardNextActions:
    dataset = _load_dashboard_dataset(db, user_id)
    milestones_by_project, tasks_by_project = _project_groups(dataset)
    active_projects = [project for project in dataset.projects if project.status == ProjectStatus.ACTIVE]
    active_project_ids = {project.id for project in active_projects}
    project_name_by_id = {project.id: project.name for project in dataset.projects}

    candidates: dict[tuple[str, int], dict] = {}

    def upsert_candidate(key: tuple[str, int], payload: dict) -> None:
        existing = candidates.get(key)
        if existing is None or payload["urgency_score"] > existing["urgency_score"]:
            candidates[key] = payload

    for task in dataset.tasks:
        if task.project_id not in active_project_ids or task.status == TaskStatus.DONE:
            continue

        reason = None
        score = _priority_score(task.priority)
        if task.due_date is not None and task.due_date < dataset.today:
            overdue_days = (dataset.today - task.due_date).days
            score += 100 + min(overdue_days, 14) * 2
            reason = f"Overdue by {overdue_days} day{'s' if overdue_days != 1 else ''}."
        elif task.status == TaskStatus.BLOCKED:
            score += 88
            reason = "Blocked task on an active mission."
        elif task.due_date is not None and task.due_date <= dataset.today + timedelta(days=3):
            days_to_due = max((task.due_date - dataset.today).days, 0)
            score += 78 + (3 - days_to_due) * 3
            reason = (
                "Due today."
                if days_to_due == 0
                else f"Due in {days_to_due} day{'s' if days_to_due != 1 else ''}."
            )
        elif task.status in (TaskStatus.TODO, TaskStatus.IN_PROGRESS) and _priority_score(task.priority) >= PRIORITY_SCORES["high"]:
            score += 58
            reason = "High-priority open task on an active mission."

        if reason is None:
            continue

        upsert_candidate(
            ("task", task.id),
            {
                "action_title": task.title,
                "project_id": task.project_id,
                "project_name": project_name_by_id.get(task.project_id),
                "entity_type": "task",
                "entity_id": task.id,
                "reason": reason,
                "urgency_score": score,
                "due_date": task.due_date,
                "status": task.status.value,
                "route": _task_route(task.project_id),
            },
        )

    for milestone in dataset.milestones:
        if milestone.project_id not in active_project_ids or milestone.status == MilestoneStatus.COMPLETED or milestone.due_date is None:
            continue

        days_to_due = _days_until(milestone.due_date, dataset.today)
        if days_to_due is None:
            continue

        if days_to_due < 0:
            score = 94 + min(abs(days_to_due), 14) * 2 + max(0, 60 - milestone.progress) // 4
            reason = f"Milestone overdue by {abs(days_to_due)} day{'s' if abs(days_to_due) != 1 else ''}."
        elif days_to_due <= 7:
            score = 72 + (7 - days_to_due) * 2 + max(0, 55 - milestone.progress) // 5
            reason = f"Milestone due in {days_to_due} day{'s' if days_to_due != 1 else ''} at {milestone.progress}% progress."
        else:
            continue

        upsert_candidate(
            ("milestone", milestone.id),
            {
                "action_title": f"Advance milestone: {milestone.title}",
                "project_id": milestone.project_id,
                "project_name": project_name_by_id.get(milestone.project_id),
                "entity_type": "milestone",
                "entity_id": milestone.id,
                "reason": reason,
                "urgency_score": score,
                "due_date": milestone.due_date,
                "status": milestone.status.value,
                "route": _project_route(milestone.project_id),
            },
        )

    for project in active_projects:
        snapshot = _project_health_snapshot(
            project,
            milestones_by_project.get(project.id, []),
            tasks_by_project.get(project.id, []),
            dataset.today,
        )
        if snapshot["days_since_activity"] is None or snapshot["days_since_activity"] < STAGNATION_DAYS or snapshot["open_tasks"] == 0:
            continue

        open_tasks = [task for task in tasks_by_project.get(project.id, []) if task.status != TaskStatus.DONE]
        ranked_tasks = sorted(
            open_tasks,
            key=lambda task: (
                -_priority_score(task.priority),
                task.due_date or date.max,
                task.created_at,
            ),
        )
        recovery_task = ranked_tasks[0] if ranked_tasks else None
        action_title = recovery_task.title if recovery_task else f"Review project: {project.name}"
        score = 56 + min(snapshot["days_since_activity"], 21) + snapshot["overdue_tasks"] * 2
        reason = f"No meaningful movement for {snapshot['days_since_activity']} day{'s' if snapshot['days_since_activity'] != 1 else ''}."

        upsert_candidate(
            ("recovery", project.id),
            {
                "action_title": action_title,
                "project_id": project.id,
                "project_name": project.name,
                "entity_type": "project",
                "entity_id": project.id,
                "reason": reason,
                "urgency_score": score,
                "due_date": recovery_task.due_date if recovery_task else project.target_date,
                "status": project.status.value,
                "route": _project_route(project.id),
            },
        )

    ranked_candidates = sorted(
        candidates.values(),
        key=lambda item: (-item["urgency_score"], item["due_date"] or date.max, item["action_title"]),
    )
    return DashboardNextActions(items=ranked_candidates[:MAX_NEXT_ACTIONS])


def get_dashboard_reality_gap(db: Session, user_id: int) -> DashboardRealityGap:
    dataset = _load_dashboard_dataset(db, user_id)
    planned_this_week = [
        task
        for task in dataset.tasks
        if task.due_date is not None and dataset.week_start <= task.due_date <= dataset.week_end
    ]
    completed_this_week = [
        task
        for task in dataset.tasks
        if task.status == TaskStatus.DONE and dataset.week_start <= task.updated_at.date() <= dataset.week_end
    ]
    due_so_far_this_week = [task for task in planned_this_week if task.due_date is not None and task.due_date <= dataset.today]
    delayed_this_week = [task for task in due_so_far_this_week if task.status != TaskStatus.DONE]
    open_tasks = [task for task in dataset.tasks if task.status != TaskStatus.DONE]
    overdue_open_tasks = [task for task in open_tasks if task.due_date is not None and task.due_date < dataset.today]

    trend = []
    for offset in range(5, -1, -1):
        period_start = dataset.week_start - timedelta(days=offset * 7)
        period_end = period_start + timedelta(days=6)
        planned_count = len(
            [task for task in dataset.tasks if task.due_date is not None and period_start <= task.due_date <= period_end]
        )
        completed_count = len(
            [
                task
                for task in dataset.tasks
                if task.status == TaskStatus.DONE and period_start <= task.updated_at.date() <= period_end
            ]
        )
        trend.append(
            {
                "label": period_start.strftime("%b %d"),
                "week_start": period_start,
                "planned_tasks": planned_count,
                "completed_tasks": completed_count,
            }
        )

    return DashboardRealityGap(
        planned_tasks_this_week=len(planned_this_week),
        completed_tasks_this_week=len(completed_this_week),
        weekly_completion_rate=_ratio_as_percent(len(completed_this_week), len(planned_this_week))
        if planned_this_week
        else (100 if completed_this_week else 0),
        estimated_hours_this_week=round(sum(task.estimated_hours or 0 for task in planned_this_week), 1),
        actual_hours_this_week=round(sum(task.actual_hours or 0 for task in completed_this_week), 1),
        overdue_ratio=_ratio_as_percent(len(overdue_open_tasks), len(open_tasks)),
        delay_rate=_ratio_as_percent(len(delayed_this_week), len(due_so_far_this_week)),
        trend=trend,
    )


def get_dashboard_weekly_review(db: Session, user_id: int) -> DashboardWeeklyReview:
    dataset = _load_dashboard_dataset(db, user_id)
    milestones_by_project, tasks_by_project = _project_groups(dataset)
    active_projects = [project for project in dataset.projects if project.status == ProjectStatus.ACTIVE]
    completed_this_week = [
        task
        for task in dataset.tasks
        if task.status == TaskStatus.DONE and dataset.week_start <= task.updated_at.date() <= dataset.week_end
    ]
    overdue_tasks = [
        task
        for task in dataset.tasks
        if task.due_date is not None and task.due_date < dataset.today and task.status != TaskStatus.DONE
    ]
    focus_logs = [log for log in dataset.daily_logs if dataset.week_start <= log.log_date <= dataset.week_end]
    total_focus_hours = round(sum(log.total_focus_hours or 0 for log in focus_logs), 1)

    activity_scores: dict[int, int] = defaultdict(int)
    completion_counts: dict[int, int] = defaultdict(int)
    for task in dataset.tasks:
        if dataset.week_start <= task.updated_at.date() <= dataset.week_end:
            activity_scores[task.project_id] += 2 if task.status == TaskStatus.DONE else 1
        if task.status == TaskStatus.DONE and dataset.week_start <= task.updated_at.date() <= dataset.week_end:
            completion_counts[task.project_id] += 1
    for milestone in dataset.milestones:
        if dataset.week_start <= milestone.updated_at.date() <= dataset.week_end:
            activity_scores[milestone.project_id] += 1
    for project in active_projects:
        if dataset.week_start <= project.updated_at.date() <= dataset.week_end:
            activity_scores[project.id] += 1

    most_active_project_id = max(activity_scores, key=activity_scores.get, default=None)
    project_name_by_id = {project.id: project.name for project in dataset.projects}
    most_active_project = project_name_by_id.get(most_active_project_id)

    inactive_projects = []
    for project in active_projects:
        snapshot = _project_health_snapshot(
            project,
            milestones_by_project.get(project.id, []),
            tasks_by_project.get(project.id, []),
            dataset.today,
        )
        if snapshot["days_since_activity"] is not None and snapshot["days_since_activity"] >= STAGNATION_DAYS and snapshot["open_tasks"] > 0:
            inactive_projects.append(project.name)

    biggest_progress = None
    if completion_counts:
        leading_project_id = max(completion_counts, key=completion_counts.get)
        biggest_progress = f"{project_name_by_id.get(leading_project_id, 'Unknown project')} completed {completion_counts[leading_project_id]} task{'s' if completion_counts[leading_project_id] != 1 else ''}."
    elif focus_logs:
        biggest_progress = focus_logs[0].summary

    biggest_blocker = next((log.blockers for log in focus_logs if log.blockers and log.blockers.strip()), None)
    if biggest_blocker is None and overdue_tasks:
        worst_project_id = max(overdue_tasks, key=lambda task: _priority_score(task.priority)).project_id
        worst_count = len([task for task in overdue_tasks if task.project_id == worst_project_id])
        biggest_blocker = f"{project_name_by_id.get(worst_project_id, 'Unknown project')} has {worst_count} overdue task{'s' if worst_count != 1 else ''}."

    summary_text = (
        f"Closed {len(completed_this_week)} task{'s' if len(completed_this_week) != 1 else ''} this week, "
        f"with {len(overdue_tasks)} overdue item{'s' if len(overdue_tasks) != 1 else ''} still exposed. "
        f"Focus time totaled {total_focus_hours:.1f}h."
    )
    if most_active_project:
        summary_text += f" {most_active_project} carried the most visible momentum."
    if inactive_projects:
        summary_text += f" Watch {', '.join(inactive_projects[:3])} for drift."

    return DashboardWeeklyReview(
        completed_tasks_this_week=len(completed_this_week),
        overdue_tasks=len(overdue_tasks),
        most_active_project=most_active_project,
        most_active_project_id=most_active_project_id,
        inactive_projects=inactive_projects[:4],
        total_focus_hours=total_focus_hours,
        focus_days_logged=len(focus_logs),
        biggest_progress=biggest_progress,
        biggest_blocker=biggest_blocker,
        summary_text=summary_text,
    )


def get_dashboard_activity_feed(db: Session, user_id: int) -> DashboardActivityFeed:
    dataset = _load_dashboard_dataset(db, user_id)
    project_name_by_id = {project.id: project.name for project in dataset.projects}
    feed_cutoff = datetime.now(timezone.utc) - timedelta(days=ACTIVITY_FEED_LOOKBACK_DAYS)
    items = []

    for log in dataset.daily_logs:
        if log.updated_at < feed_cutoff:
            continue
        items.append(
            {
                "id": f"daily-log-{log.id}",
                "event_type": "daily_log",
                "title": f"Daily review for {log.log_date.isoformat()}",
                "detail": log.next_step or log.summary,
                "entity_type": "daily_log",
                "entity_id": log.id,
                "project_id": None,
                "project_name": None,
                "changed_at": log.updated_at,
                "route": "/daily-logs",
                "tone": "info",
            }
        )

    for task in dataset.tasks:
        if task.updated_at < feed_cutoff:
            continue
        if task.status == TaskStatus.DONE:
            items.append(
                {
                    "id": f"task-done-{task.id}",
                    "event_type": "task_completed",
                    "title": task.title,
                    "detail": f"Completed in {project_name_by_id.get(task.project_id, 'Unknown project')}.",
                    "entity_type": "task",
                    "entity_id": task.id,
                    "project_id": task.project_id,
                    "project_name": project_name_by_id.get(task.project_id),
                    "changed_at": task.updated_at,
                    "route": _task_route(task.project_id),
                    "tone": "success",
                }
            )
        elif task.status == TaskStatus.BLOCKED:
            items.append(
                {
                    "id": f"task-blocked-{task.id}",
                    "event_type": "task_blocked",
                    "title": task.title,
                    "detail": f"Blocked in {project_name_by_id.get(task.project_id, 'Unknown project')}.",
                    "entity_type": "task",
                    "entity_id": task.id,
                    "project_id": task.project_id,
                    "project_name": project_name_by_id.get(task.project_id),
                    "changed_at": task.updated_at,
                    "route": _task_route(task.project_id),
                    "tone": "warning",
                }
            )
        elif task.status == TaskStatus.IN_PROGRESS:
            items.append(
                {
                    "id": f"task-progress-{task.id}",
                    "event_type": "task_in_progress",
                    "title": task.title,
                    "detail": f"Moved into active execution for {project_name_by_id.get(task.project_id, 'Unknown project')}.",
                    "entity_type": "task",
                    "entity_id": task.id,
                    "project_id": task.project_id,
                    "project_name": project_name_by_id.get(task.project_id),
                    "changed_at": task.updated_at,
                    "route": _task_route(task.project_id),
                    "tone": "info",
                }
            )

    for milestone in dataset.milestones:
        if milestone.updated_at < feed_cutoff:
            continue
        if milestone.status == MilestoneStatus.COMPLETED:
            items.append(
                {
                    "id": f"milestone-done-{milestone.id}",
                    "event_type": "milestone_completed",
                    "title": milestone.title,
                    "detail": f"Milestone completed for {project_name_by_id.get(milestone.project_id, 'Unknown project')}.",
                    "entity_type": "milestone",
                    "entity_id": milestone.id,
                    "project_id": milestone.project_id,
                    "project_name": project_name_by_id.get(milestone.project_id),
                    "changed_at": milestone.updated_at,
                    "route": _project_route(milestone.project_id),
                    "tone": "success",
                }
            )
        elif milestone.progress > 0:
            items.append(
                {
                    "id": f"milestone-progress-{milestone.id}",
                    "event_type": "milestone_progress",
                    "title": milestone.title,
                    "detail": f"{milestone.progress}% progress on {project_name_by_id.get(milestone.project_id, 'Unknown project')}.",
                    "entity_type": "milestone",
                    "entity_id": milestone.id,
                    "project_id": milestone.project_id,
                    "project_name": project_name_by_id.get(milestone.project_id),
                    "changed_at": milestone.updated_at,
                    "route": _project_route(milestone.project_id),
                    "tone": "info",
                }
            )

    for project in dataset.projects:
        if project.updated_at < feed_cutoff:
            continue
        items.append(
            {
                "id": f"project-{project.id}",
                "event_type": "project_updated",
                "title": project.name,
                "detail": f"Project status: {project.status.value}.",
                "entity_type": "project",
                "entity_id": project.id,
                "project_id": project.id,
                "project_name": project.name,
                "changed_at": project.updated_at,
                "route": _project_route(project.id),
                "tone": "info",
            }
        )

    items.sort(key=lambda item: item["changed_at"], reverse=True)
    return DashboardActivityFeed(items=items[:MAX_ACTIVITY_FEED_ITEMS])
