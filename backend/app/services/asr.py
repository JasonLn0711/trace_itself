import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class AsrServiceError(RuntimeError):
    pass


class AsrRuntimeUnavailableError(AsrServiceError):
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
        self._runtime_validated = False

    def assert_runtime_available(self) -> None:
        normalized_device = settings.asr_device.strip().lower()
        if normalized_device != "cuda":
            self._runtime_validated = True
            return

        try:
            import ctranslate2
        except Exception as exc:
            raise AsrRuntimeUnavailableError(
                "CUDA ASR is configured but CTranslate2 could not load its CUDA runtime."
            ) from exc

        try:
            cuda_count = ctranslate2.get_cuda_device_count()
            supported_compute_types = {
                getattr(item, "value", str(item)) for item in ctranslate2.get_supported_compute_types("cuda")
            }
        except Exception as exc:
            raise AsrRuntimeUnavailableError(
                "CUDA ASR is configured but Docker cannot access the NVIDIA runtime. "
                "Install NVIDIA Container Toolkit and start the backend with docker-compose.cuda.yml."
            ) from exc

        if cuda_count < 1:
            raise AsrRuntimeUnavailableError(
                "CUDA ASR is configured but no GPU is visible inside the backend container."
            )

        if settings.asr_compute_type not in supported_compute_types:
            supported_label = ", ".join(sorted(supported_compute_types)) or "unknown"
            raise AsrRuntimeUnavailableError(
                f"ASR_COMPUTE_TYPE={settings.asr_compute_type} is not supported on CUDA. "
                f"Supported values: {supported_label}."
            )

        self._runtime_validated = True

    def ensure_model_ready(self, model_name: str | None = None) -> None:
        resolved_model_name = model_name or settings.asr_model_name
        self._get_model(resolved_model_name)

    def log_runtime_status(self) -> None:
        normalized_device = settings.asr_device.strip().lower()
        if normalized_device != "cuda":
            logger.info("ASR runtime is configured for %s with compute_type=%s", normalized_device, settings.asr_compute_type)
            return

        self.assert_runtime_available()
        logger.info("ASR runtime is configured for CUDA with compute_type=%s", settings.asr_compute_type)

    def _get_model(self, model_name: str):
        if not self._runtime_validated:
            self.assert_runtime_available()
        if model_name not in self._models:
            from faster_whisper import WhisperModel

            self._models[model_name] = WhisperModel(
                model_name,
                device=settings.asr_device,
                compute_type=settings.asr_compute_type,
                cpu_threads=max(0, settings.asr_cpu_threads),
            )
        return self._models[model_name]

    def _transcribe_audio(
        self,
        audio_input: str | Path | np.ndarray,
        *,
        language: str | None = None,
        model_name: str | None = None,
        beam_size: int = 5,
        initial_prompt: str | None = None,
        condition_on_previous_text: bool = True,
        chunk_length: int | None = None,
        vad_parameters: dict[str, Any] | None = None,
    ) -> AsrTranscriptionResult:
        resolved_model_name = model_name or settings.asr_model_name
        normalized_audio = audio_input
        if isinstance(audio_input, Path):
            normalized_audio = str(audio_input)
        if isinstance(normalized_audio, np.ndarray) and normalized_audio.dtype != np.float32:
            normalized_audio = normalized_audio.astype(np.float32, copy=False)

        try:
            model = self._get_model(resolved_model_name)
            segments, info = model.transcribe(
                normalized_audio,
                task="transcribe",
                language=language or None,
                beam_size=beam_size,
                condition_on_previous_text=condition_on_previous_text,
                initial_prompt=initial_prompt or None,
                chunk_length=chunk_length,
                vad_filter=True,
                vad_parameters=vad_parameters,
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

    def transcribe_file(
        self,
        file_path: Path,
        *,
        language: str | None = None,
        model_name: str | None = None,
    ) -> AsrTranscriptionResult:
        return self._transcribe_audio(
            file_path,
            language=language,
            model_name=model_name,
        )

    def transcribe_waveform(
        self,
        waveform: np.ndarray,
        *,
        language: str | None = None,
        model_name: str | None = None,
        beam_size: int = 1,
        initial_prompt: str | None = None,
        condition_on_previous_text: bool = False,
        chunk_length: int | None = None,
        vad_parameters: dict[str, Any] | None = None,
    ) -> AsrTranscriptionResult:
        if waveform.ndim != 1:
            raise AsrServiceError("Streaming audio must be mono.")
        if waveform.size == 0:
            raise AsrServiceError("No speech detected in the uploaded file.")

        return self._transcribe_audio(
            waveform,
            language=language,
            model_name=model_name,
            beam_size=beam_size,
            initial_prompt=initial_prompt,
            condition_on_previous_text=condition_on_previous_text,
            chunk_length=chunk_length,
            vad_parameters=vad_parameters,
        )


service = AsrService()
