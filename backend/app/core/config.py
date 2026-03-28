from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


def _looks_like_placeholder(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip().lower()
    if not normalized:
        return True
    placeholder_tokens = ("change-me", "placeholder", "example", "default", "in-production")
    return any(token in normalized for token in placeholder_tokens)


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
    session_idle_timeout_minutes: int = 5
    credentials_secret_key: str | None = None
    default_llm_runs_per_24h: int = 3
    default_max_audio_seconds_per_request: int = 5 * 60 * 60
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    db_connect_max_attempts: int = 30
    db_connect_retry_seconds: int = 2
    asr_model_name: str = "SoybeanMilk/faster-whisper-Breeze-ASR-25"
    asr_device: str = "cuda"
    asr_compute_type: str = "float16"
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
    asr_live_max_chunk_kb: int = 2048
    asr_live_max_utterance_seconds: int = 45
    asr_live_max_sessions_per_user: int = 2
    asr_upload_dir: str = "/data/asr"
    asr_max_upload_mb: int = 512
    asr_meeting_diarization_enabled: bool = True
    asr_meeting_diarizer_model: str = "nvidia/diar_sortformer_4spk-v1"
    asr_meeting_diarization_device: str = "cuda"
    asr_meeting_diarization_default_max_speakers: int = 3
    asr_meeting_diarization_merge_gap_seconds: float = 1.2
    asr_meeting_diarization_gap_tolerance_seconds: float = 0.4
    asr_meeting_diarization_short_turn_seconds: float = 1.6
    asr_meeting_diarization_min_overlap_seconds: float = 0.35
    asr_meeting_diarization_min_overlap_ratio: float = 0.35
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
    def asr_live_max_chunk_bytes(self) -> int:
        return self.asr_live_max_chunk_kb * 1024

    @property
    def asr_live_partial_interval_seconds(self) -> float:
        return self.asr_live_partial_interval_ms / 1000

    @property
    def asr_live_commit_silence_seconds(self) -> float:
        return self.asr_live_commit_silence_ms / 1000

    @property
    def meeting_max_upload_bytes(self) -> int:
        return self.meeting_max_upload_mb * 1024 * 1024

    @property
    def is_production_like(self) -> bool:
        return self.app_env.strip().lower() not in {"development", "dev", "local", "test"}

    def validate_runtime_security(self) -> None:
        if not self.is_production_like:
            return

        issues: list[str] = []
        if _looks_like_placeholder(self.secret_key):
            issues.append("SECRET_KEY must be set to a strong non-placeholder value.")
        if _looks_like_placeholder(self.bootstrap_admin_password):
            issues.append("INITIAL_ADMIN_PASSWORD must be set to a strong non-placeholder value.")
        if _looks_like_placeholder(self.credentials_secret_key):
            issues.append("CREDENTIALS_SECRET_KEY must be set to a distinct strong value in production.")
        elif self.credentials_secret_key == self.secret_key:
            issues.append("CREDENTIALS_SECRET_KEY must not reuse SECRET_KEY in production.")
        if not self.session_cookie_secure:
            issues.append("SESSION_COOKIE_SECURE must be true in production.")

        if issues:
            formatted = "\n".join(f"- {issue}" for issue in issues)
            raise RuntimeError(f"Refusing to start with insecure production settings:\n{formatted}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
