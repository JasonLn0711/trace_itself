from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import AIProviderDriver, AIProviderKind
from app.models.base import Base


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    kind: Mapped[AIProviderKind] = mapped_column(
        Enum(AIProviderKind, name="ai_provider_kind"),
        nullable=False,
        index=True,
    )
    driver: Mapped[AIProviderDriver] = mapped_column(
        Enum(AIProviderDriver, name="ai_provider_driver"),
        nullable=False,
    )
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255))
    api_key_encrypted: Mapped[str | None] = mapped_column(Text())
    api_key_hint: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    @property
    def has_api_key(self) -> bool:
        return bool(self.api_key_encrypted)
