from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BodyLog(Base):
    __tablename__ = "body_logs"
    __table_args__ = (UniqueConstraint("user_id", "log_date", name="uq_body_logs_user_log_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    log_date: Mapped[date] = mapped_column(Date(), nullable=False, index=True)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(6, 2))
    body_fat_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    notes: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="body_logs")
