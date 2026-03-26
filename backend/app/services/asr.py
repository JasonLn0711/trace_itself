import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import soundfile as sf

from app.core.config import get_settings
from app.services.audio_storage import convert_audio_to_wav

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
        self._pipeline: Any | None = None

    def _get_pipeline(self):
        if self._pipeline is None:
            import torch
            from transformers import AutomaticSpeechRecognitionPipeline, WhisperForConditionalGeneration, WhisperProcessor

            if settings.asr_cpu_threads > 0:
                torch.set_num_threads(settings.asr_cpu_threads)

            use_cuda = settings.asr_device == "cuda" and torch.cuda.is_available()
            torch_dtype = torch.float16 if use_cuda else torch.float32

            processor = WhisperProcessor.from_pretrained(settings.asr_model_name)
            model = WhisperForConditionalGeneration.from_pretrained(
                settings.asr_model_name,
                torch_dtype=torch_dtype,
            ).eval()
            model = model.to("cuda" if use_cuda else "cpu")

            self._pipeline = AutomaticSpeechRecognitionPipeline(
                model=model,
                tokenizer=processor.tokenizer,
                feature_extractor=processor.feature_extractor,
                chunk_length_s=max(0, settings.asr_chunk_length_seconds),
                device=0 if use_cuda else -1,
            )
        return self._pipeline

    def transcribe_file(self, file_path: Path, language: str | None = None) -> AsrTranscriptionResult:
        wav_path = None
        wav_dir = None
        try:
            wav_path = convert_audio_to_wav(file_path)
            wav_dir = wav_path.parent
            waveform, sample_rate = sf.read(wav_path, dtype="float32")
            if getattr(waveform, "ndim", 1) > 1:
                waveform = waveform.mean(axis=1)

            generate_kwargs: dict[str, str] = {"task": "transcribe"}
            if language:
                generate_kwargs["language"] = language

            output = self._get_pipeline()(waveform, generate_kwargs=generate_kwargs)
            text = (output.get("text") or "").strip()
        except Exception as exc:
            raise AsrServiceError("Transcription failed. Check the audio file and ASR settings.") from exc
        finally:
            if wav_dir:
                shutil.rmtree(wav_dir, ignore_errors=True)

        if not text:
            raise AsrServiceError("No speech detected in the uploaded file.")

        duration_seconds = len(waveform) / sample_rate if sample_rate else None
        normalized_language = language.strip().lower() if language else None
        return AsrTranscriptionResult(
            text=text,
            language=normalized_language,
            duration_seconds=duration_seconds,
            model_name=settings.asr_model_name,
        )


service = AsrService()
