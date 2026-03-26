from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()


class AsrServiceError(RuntimeError):
    pass


@dataclass(slots=True)
class AsrTranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float | None
    model_name: str


class AsrService:
    def __init__(self) -> None:
        self._models: dict[str, object] = {}

    def _get_model(self, model_name: str):
        if model_name not in self._models:
            from faster_whisper import WhisperModel

            self._models[model_name] = WhisperModel(
                model_name,
                device=settings.asr_device,
                compute_type=settings.asr_compute_type,
                cpu_threads=max(0, settings.asr_cpu_threads),
            )
        return self._models[model_name]

    def transcribe_file(
        self,
        file_path: Path,
        *,
        language: str | None = None,
        model_name: str | None = None,
    ) -> AsrTranscriptionResult:
        resolved_model_name = model_name or settings.asr_model_name
        try:
            model = self._get_model(resolved_model_name)
            segments, info = model.transcribe(
                str(file_path),
                task="transcribe",
                language=language or None,
                beam_size=5,
                vad_filter=True,
            )
            segment_items = list(segments)
            text = " ".join(segment.text.strip() for segment in segment_items if segment.text and segment.text.strip()).strip()
        except Exception as exc:
            raise AsrServiceError("Transcription failed. Check the audio file and ASR settings.") from exc

        if not text:
            raise AsrServiceError("No speech detected in the uploaded file.")

        duration_seconds = getattr(info, "duration", None)
        normalized_language = (getattr(info, "language", None) or language or "").strip().lower() or None
        return AsrTranscriptionResult(
            text=text,
            language=normalized_language,
            duration_seconds=duration_seconds,
            model_name=resolved_model_name,
        )


service = AsrService()
