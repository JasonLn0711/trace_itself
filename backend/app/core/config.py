from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "trace_itself"
    app_env: str = "development"
    secret_key: str = "change-me-in-production"
    app_password: str = "change-me"
    database_url: str = "postgresql+psycopg://trace_itself:trace_itself@localhost:5432/trace_itself"
    session_cookie_name: str = "trace_itself_session"
    session_cookie_secure: bool = False
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    db_connect_max_attempts: int = 30
    db_connect_retry_seconds: int = 2

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), case_sensitive=False, extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        if not self.backend_cors_origins:
            return []
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
