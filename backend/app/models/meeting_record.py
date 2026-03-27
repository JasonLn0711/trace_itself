from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class MeetingRecord(Base):
    __tablename__ = "meeting_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    audio_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    audio_storage_path: Mapped[str] = mapped_column(String(255), nullable=False)
    audio_mime_type: Mapped[str | None] = mapped_column(String(120))
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    language: Mapped[str | None] = mapped_column(String(32))
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    transcript_text: Mapped[str] = mapped_column(Text, nullable=False)
    minutes_text: Mapped[str] = mapped_column(Text, nullable=False)
    summary_text: Mapped[str] = mapped_column(Text, nullable=False)
    action_items_text: Mapped[str] = mapped_column(Text, nullable=False)
    asr_model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    llm_model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="meeting_records")
    project = relationship("Project", back_populates="meeting_records")

    @property
    def project_name(self) -> str | None:
        if not self.project:
            return None
        return self.project.name
