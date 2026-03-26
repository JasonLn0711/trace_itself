from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import UsageEventKind
from app.models.base import Base


class AIUsageEvent(Base):
    __tablename__ = "ai_usage_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_id: Mapped[int | None] = mapped_column(ForeignKey("ai_providers.id", ondelete="SET NULL"), index=True)
    kind: Mapped[UsageEventKind] = mapped_column(
        Enum(UsageEventKind, name="usage_event_kind"),
        nullable=False,
        index=True,
    )
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    request_units: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    user = relationship("User", back_populates="usage_events")
    provider = relationship("AIProvider", back_populates="usage_events")
