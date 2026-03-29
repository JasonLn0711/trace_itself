from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MealItem(Base):
    __tablename__ = "meal_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meal_id: Mapped[int] = mapped_column(ForeignKey("meals.id", ondelete="CASCADE"), nullable=False, index=True)
    food_name: Mapped[str] = mapped_column(String(255), nullable=False)
    canonical_food_id: Mapped[int | None] = mapped_column(ForeignKey("food_catalog.id", ondelete="SET NULL"), index=True)
    estimated_portion_label: Mapped[str | None] = mapped_column(String(100))
    estimated_quantity: Mapped[float | None] = mapped_column(Numeric(8, 2))
    estimated_unit: Mapped[str | None] = mapped_column(String(50))
    calories: Mapped[float | None] = mapped_column(Numeric(8, 2))
    protein_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    carbs_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    fat_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    sugar_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    sodium_mg: Mapped[float | None] = mapped_column(Numeric(10, 2))
    fiber_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    source_type: Mapped[str | None] = mapped_column(String(30))
    uncertain: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    meal = relationship("Meal", back_populates="items")
    canonical_food = relationship("FoodCatalog")
