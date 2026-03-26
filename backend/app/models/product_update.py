from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ProductUpdateType
from app.models.base import Base


class ProductUpdate(Base):
    __tablename__ = "product_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    summary: Mapped[str] = mapped_column(Text(), nullable=False)
    details: Mapped[str | None] = mapped_column(Text())
    area: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    change_type: Mapped[ProductUpdateType] = mapped_column(
        Enum(ProductUpdateType, name="product_update_type"),
        nullable=False,
        default=ProductUpdateType.UPDATE,
        index=True,
    )
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    author_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    author = relationship("User", back_populates="product_updates")

    @property
    def author_display_name(self) -> str | None:
        if not self.author:
            return None
        return self.author.display_name or self.author.username
