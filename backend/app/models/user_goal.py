from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class UserGoal(Base):
    __tablename__ = "user_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    daily_calorie_target: Mapped[int | None] = mapped_column(Integer)
    daily_protein_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    daily_carbs_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    daily_fat_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    daily_sugar_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    daily_sodium_mg: Mapped[float | None] = mapped_column(Numeric(10, 2))
    daily_fiber_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="nutrition_goal")
