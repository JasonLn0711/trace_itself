from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "trace_itself"
    app_env: str = "development"
    secret_key: str = "change-me-in-production"
    app_password: str = "change-me"
    initial_admin_username: str = "owner"
    initial_admin_display_name: str = "Owner"
    initial_admin_password: str | None = None
    auth_max_failed_attempts: int = 5
    auth_lockout_minutes: int = 5
    database_url: str = "postgresql+psycopg://trace_itself:trace_itself@localhost:5432/trace_itself"
    session_cookie_name: str = "trace_itself_session"
    session_cookie_secure: bool = False
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    db_connect_max_attempts: int = 30
    db_connect_retry_seconds: int = 2
    asr_model_name: str = "small"
    asr_device: str = "cpu"
    asr_compute_type: str = "int8"
    asr_cpu_threads: int = 4
    asr_upload_dir: str = "/tmp/trace_itself_asr"
    asr_max_upload_mb: int = 25

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), case_sensitive=False, extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        if not self.backend_cors_origins:
            return []
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def bootstrap_admin_password(self) -> str:
        return self.initial_admin_password or self.app_password


@lru_cache
def get_settings() -> Settings:
    return Settings()
