from fastapi import APIRouter

from app.api import auth, daily_logs, dashboard, milestones, projects, tasks

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(milestones.router)
api_router.include_router(tasks.router)
api_router.include_router(daily_logs.router)
api_router.include_router(dashboard.router)
