from datetime import datetime

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UsagePolicy(Base):
    __tablename__ = "usage_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    llm_runs_per_24h: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    max_audio_seconds_per_request: Mapped[int] = mapped_column(Integer, nullable=False, default=5 * 60 * 60)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
