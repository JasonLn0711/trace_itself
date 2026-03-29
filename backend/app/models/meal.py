from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_type: Mapped[str] = mapped_column(String(20), nullable=False)
    eaten_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    image_object_key: Mapped[str | None] = mapped_column(Text())
    audio_object_key: Mapped[str | None] = mapped_column(Text())
    transcript_text: Mapped[str | None] = mapped_column(Text())
    extra_text: Mapped[str | None] = mapped_column(Text())
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", server_default="draft")
    total_calories: Mapped[float | None] = mapped_column(Numeric(8, 2))
    total_protein_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    total_carbs_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    total_fat_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    total_sugar_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    total_sodium_mg: Mapped[float | None] = mapped_column(Numeric(10, 2))
    total_fiber_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    ai_summary: Mapped[str | None] = mapped_column(Text())
    suggestion_text: Mapped[str | None] = mapped_column(Text())
    user_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="meals")
    items = relationship("MealItem", back_populates="meal", cascade="all, delete-orphan", order_by="MealItem.id.asc()")
    analysis_jobs = relationship("MealAnalysisJob", back_populates="meal", cascade="all, delete-orphan")
