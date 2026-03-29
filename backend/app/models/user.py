from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UserRole
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"),
        default=UserRole.MEMBER,
        nullable=False,
    )
    age: Mapped[int | None] = mapped_column(Integer)
    sex: Mapped[str | None] = mapped_column(String(20))
    height_cm: Mapped[float | None] = mapped_column(Numeric(5, 2))
    current_weight_kg: Mapped[float | None] = mapped_column(Numeric(6, 2))
    target_weight_kg: Mapped[float | None] = mapped_column(Numeric(6, 2))
    goal_type: Mapped[str | None] = mapped_column(String(30))
    activity_level: Mapped[str | None] = mapped_column(String(30))
    weekly_workouts: Mapped[int | None] = mapped_column(Integer)
    workout_types: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    location_region: Mapped[str | None] = mapped_column(String(100))
    dietary_preferences: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    allergies: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    disliked_foods: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    tracking_focus: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    access_group_id: Mapped[int | None] = mapped_column(ForeignKey("access_groups.id", ondelete="SET NULL"), index=True)
    max_concurrent_sessions: Mapped[int] = mapped_column(Integer, default=2, server_default="2", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    access_group = relationship("AccessGroup", back_populates="users")
    projects = relationship("Project", back_populates="user")
    milestones = relationship("Milestone", back_populates="user")
    tasks = relationship("Task", back_populates="user")
    daily_logs = relationship("DailyLog", back_populates="user")
    asr_transcripts = relationship("AsrTranscript", back_populates="user", cascade="all, delete-orphan")
    meeting_records = relationship("MeetingRecord", back_populates="user", cascade="all, delete-orphan")
    usage_events = relationship("AIUsageEvent", back_populates="user", cascade="all, delete-orphan")
    audit_events = relationship("AuditEvent", back_populates="user")
    product_updates = relationship("ProductUpdate", back_populates="author")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    nutrition_goal = relationship("UserGoal", back_populates="user", cascade="all, delete-orphan", uselist=False)
    body_logs = relationship("BodyLog", back_populates="user", cascade="all, delete-orphan")
    meals = relationship("Meal", back_populates="user", cascade="all, delete-orphan")

    @property
    def access_group_name(self) -> str | None:
        if not self.access_group:
            return None
        return self.access_group.name

    @property
    def capabilities(self) -> dict[str, bool]:
        group = self.access_group
        if self.role == UserRole.ADMIN:
            return {
                "project_tracer": True,
                "asr": True,
                "llm": True,
            }
        return {
            "project_tracer": bool(group and group.can_use_project_tracer),
            "asr": bool(group and group.can_use_asr),
            "llm": bool(group and group.can_use_llm),
        }

    @property
    def active_session_count(self) -> int:
        return len(self.sessions or [])
