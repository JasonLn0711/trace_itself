from datetime import datetime

from sqlalchemy import Boolean, DateTime, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FoodCatalog(Base):
    __tablename__ = "food_catalog"
    __table_args__ = (UniqueConstraint("food_name", "locale", name="uq_food_catalog_name_locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    food_name: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    locale: Mapped[str] = mapped_column(String(20), nullable=False, default="zh-TW")
    serving_reference: Mapped[str | None] = mapped_column(String(100))
    calories_per_serving: Mapped[float | None] = mapped_column(Numeric(8, 2))
    protein_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    carbs_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    fat_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    sugar_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    sodium_mg: Mapped[float | None] = mapped_column(Numeric(10, 2))
    fiber_g: Mapped[float | None] = mapped_column(Numeric(8, 2))
    source_name: Mapped[str | None] = mapped_column(String(100))
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
