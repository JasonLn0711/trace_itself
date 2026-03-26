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
    credentials_secret_key: str | None = None
    default_llm_runs_per_24h: int = 3
    default_max_audio_seconds_per_request: int = 5 * 60 * 60
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    db_connect_max_attempts: int = 30
    db_connect_retry_seconds: int = 2
    asr_model_name: str = "SoybeanMilk/faster-whisper-Breeze-ASR-25"
    asr_device: str = "cpu"
    asr_compute_type: str = "float32"
    asr_cpu_threads: int = 4
    asr_live_sample_rate: int = 16000
    asr_live_partial_interval_ms: int = 1500
    asr_live_commit_silence_ms: int = 1200
    asr_live_max_window_seconds: int = 18
    asr_live_prompt_tail_words: int = 48
    asr_live_vad_threshold: float = 0.45
    asr_live_vad_min_silence_ms: int = 450
    asr_live_vad_speech_pad_ms: int = 180
    asr_live_preview_beam_size: int = 1
    asr_live_final_beam_size: int = 5
    asr_upload_dir: str = "/data/asr"
    asr_max_upload_mb: int = 512
    meeting_upload_dir: str = "/data/meetings"
    meeting_max_upload_mb: int = 512
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.1-flash-lite-preview"

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), case_sensitive=False, extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        if not self.backend_cors_origins:
            return []
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]

    @property
    def bootstrap_admin_password(self) -> str:
        return self.initial_admin_password or self.app_password

    @property
    def asr_max_upload_bytes(self) -> int:
        return self.asr_max_upload_mb * 1024 * 1024

    @property
    def asr_live_partial_interval_seconds(self) -> float:
        return self.asr_live_partial_interval_ms / 1000

    @property
    def asr_live_commit_silence_seconds(self) -> float:
        return self.asr_live_commit_silence_ms / 1000

    @property
    def meeting_max_upload_bytes(self) -> int:
        return self.meeting_max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
