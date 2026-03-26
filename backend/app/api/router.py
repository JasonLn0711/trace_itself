from fastapi import APIRouter

from app.api import asr, auth, daily_logs, dashboard, meetings, milestones, product_updates, projects, tasks, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(asr.router)
api_router.include_router(meetings.router)
api_router.include_router(projects.router)
api_router.include_router(milestones.router)
api_router.include_router(tasks.router)
api_router.include_router(daily_logs.router)
api_router.include_router(product_updates.router)
api_router.include_router(dashboard.router)
