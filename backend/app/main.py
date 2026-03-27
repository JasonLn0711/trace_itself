import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.db.session import init_db
from app.services.asr import AsrRuntimeUnavailableError, service as asr_service

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_runtime_security()
    init_db()
    try:
        asr_service.log_runtime_status()
    except AsrRuntimeUnavailableError as exc:
        logger.warning("ASR runtime is not ready: %s", exc)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie=settings.session_cookie_name,
    same_site="lax",
    https_only=settings.session_cookie_secure,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router, prefix="/api")
