from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import get_settings

settings = get_settings()


class AsrServiceError(RuntimeError):
    pass


@dataclass
class AsrTranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float | None
    model_name: str


class AsrService:
    def __init__(self) -> None:
        self._model: Any | None = None

    def _get_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            kwargs: dict[str, Any] = {
                "device": settings.asr_device,
                "compute_type": settings.asr_compute_type,
            }
            if settings.asr_cpu_threads > 0:
                kwargs["cpu_threads"] = settings.asr_cpu_threads

            self._model = WhisperModel(settings.asr_model_name, **kwargs)

        return self._model

    def transcribe_file(self, file_path: Path, language: str | None = None) -> AsrTranscriptionResult:
        try:
            segments, info = self._get_model().transcribe(
                str(file_path),
                language=language or None,
                vad_filter=True,
            )
            text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        except Exception as exc:
            raise AsrServiceError("Transcription failed. Check the audio file and ASR settings.") from exc

        if not text:
            raise AsrServiceError("No speech detected in the uploaded file.")

        return AsrTranscriptionResult(
            text=text,
            language=getattr(info, "language", None),
            duration_seconds=getattr(info, "duration", None),
            model_name=settings.asr_model_name,
        )


service = AsrService()
