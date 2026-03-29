from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AsrTranscript(Base):
    __tablename__ = "asr_transcripts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    audio_storage_path: Mapped[str | None] = mapped_column(String(255))
    audio_mime_type: Mapped[str | None] = mapped_column(String(120))
    language: Mapped[str | None] = mapped_column(String(32))
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    model_name: Mapped[str] = mapped_column(String(120), nullable=False)
    capture_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="file", server_default="file")
    transcript_text: Mapped[str] = mapped_column(Text, nullable=False)
    transcript_entries_json: Mapped[str | None] = mapped_column(Text)
    speaker_diarization_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)
    speaker_count: Mapped[int | None] = mapped_column()
    speaker_diarization_model_name: Mapped[str | None] = mapped_column(String(160))
    post_processing_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="completed",
        server_default="completed",
    )
    post_processing_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="asr_transcripts")
