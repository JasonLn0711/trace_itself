from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    log_date: Mapped[date] = mapped_column(Date(), nullable=False, unique=True, index=True)
    summary: Mapped[str] = mapped_column(Text(), nullable=False)
    blockers: Mapped[str | None] = mapped_column(Text())
    next_step: Mapped[str | None] = mapped_column(Text())
    total_focus_hours: Mapped[float | None] = mapped_column(Float())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
