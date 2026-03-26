from enum import StrEnum


class PriorityLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ProjectStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class MilestoneStatus(StrEnum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"


class TaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"


class UserRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class AppFeature(StrEnum):
    PROJECT_TRACER = "project_tracer"
    ASR = "asr"
    LLM = "llm"


class AIProviderKind(StrEnum):
    ASR = "asr"
    LLM = "llm"


class AIProviderDriver(StrEnum):
    LOCAL_BREEZE = "local_breeze"
    GEMINI = "gemini"


class UsageEventKind(StrEnum):
    ASR_AUDIO = "asr_audio"
    LLM_TEXT = "llm_text"


class ProductUpdateType(StrEnum):
    BUILD = "build"
    FIX = "fix"
    UPDATE = "update"
    SECURITY = "security"
