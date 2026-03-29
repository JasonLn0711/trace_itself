import tempfile
import wave
from pathlib import Path

import numpy as np

from app.core.config import get_settings
from app.core.enums import AIProviderDriver
from app.models.ai_provider import AIProvider
from app.services.asr import AsrRuntimeUnavailableError, AsrServiceError, AsrTranscriptionResult, service as asr_service
from app.services.audio_storage import probe_audio_duration_seconds, resolve_audio_mime_type
from app.services.gemini_client import (
    GeminiClientError,
    assert_provider_ready as assert_gemini_provider_ready,
    delete_file,
    generate_json,
    upload_file,
)

settings = get_settings()

MANDARIN_STYLE_PROMPT = (
    "When the speech is Mandarin, use Taiwanese Mandarin wording and orthography in the transcript."
)


class ProviderAsrService:
    def ensure_provider_ready(self, provider: AIProvider) -> None:
        if provider.driver == AIProviderDriver.LOCAL_BREEZE:
            asr_service.ensure_model_ready(provider.model_name)
            return
        if provider.driver == AIProviderDriver.GEMINI:
            try:
                assert_gemini_provider_ready(provider)
            except GeminiClientError as exc:
                raise AsrRuntimeUnavailableError(str(exc)) from exc
            return
        raise AsrRuntimeUnavailableError("Selected ASR provider driver is not supported.")

    @staticmethod
    def supports_live_streaming(provider: AIProvider) -> bool:
        return provider.driver == AIProviderDriver.LOCAL_BREEZE

    @staticmethod
    def supports_speaker_diarization(provider: AIProvider) -> bool:
        return provider.driver == AIProviderDriver.LOCAL_BREEZE

    def transcribe_file(
        self,
        provider: AIProvider,
        file_path: Path,
        *,
        language: str | None = None,
        word_timestamps: bool = False,
    ) -> AsrTranscriptionResult:
        if provider.driver == AIProviderDriver.LOCAL_BREEZE:
            return asr_service.transcribe_file(
                file_path,
                language=language,
                model_name=provider.model_name,
                word_timestamps=word_timestamps,
            )
        if provider.driver == AIProviderDriver.GEMINI:
            return self._transcribe_file_with_gemini(provider, file_path, language=language, context_prompt=None)
        raise AsrServiceError("Selected ASR provider driver is not supported.")

    def transcribe_waveform(
        self,
        provider: AIProvider,
        waveform: np.ndarray,
        *,
        language: str | None = None,
        beam_size: int = 5,
        initial_prompt: str | None = None,
        condition_on_previous_text: bool = False,
        chunk_length: int | None = None,
        vad_parameters: dict[str, object] | None = None,
        word_timestamps: bool = False,
    ) -> AsrTranscriptionResult:
        if provider.driver == AIProviderDriver.LOCAL_BREEZE:
            return asr_service.transcribe_waveform(
                waveform,
                language=language,
                model_name=provider.model_name,
                beam_size=beam_size,
                initial_prompt=initial_prompt,
                condition_on_previous_text=condition_on_previous_text,
                chunk_length=chunk_length,
                vad_parameters=vad_parameters,
                word_timestamps=word_timestamps,
            )
        if provider.driver == AIProviderDriver.GEMINI:
            return self._transcribe_waveform_with_gemini(
                provider,
                waveform,
                language=language,
                context_prompt=initial_prompt,
            )
        raise AsrServiceError("Selected ASR provider driver is not supported.")

    def _transcribe_file_with_gemini(
        self,
        provider: AIProvider,
        file_path: Path,
        *,
        language: str | None = None,
        context_prompt: str | None = None,
    ) -> AsrTranscriptionResult:
        uploaded_audio = None
        normalized_language = (language or "").strip().lower() or None
        prompt_lines = self._build_gemini_prompt_lines(
            language=normalized_language,
            context_prompt=context_prompt,
        )

        response_schema = {
            "type": "object",
            "properties": {
                "transcript_text": {"type": "string"},
                "language_code": {"type": "string"},
            },
            "required": ["transcript_text"],
        }

        mime_type = resolve_audio_mime_type(file_path.name, None) or "audio/webm"
        try:
            uploaded_audio = upload_file(
                provider,
                file_path,
                mime_type=mime_type,
                display_name=file_path.name[:120],
            )
            payload = generate_json(
                provider,
                parts=[
                    {"text": "\n".join(prompt_lines)},
                    {
                        "file_data": {
                            "mime_type": uploaded_audio.mime_type,
                            "file_uri": uploaded_audio.uri,
                        }
                    },
                ],
                response_schema=response_schema,
                temperature=0.1,
            )
        except GeminiClientError as exc:
            raise AsrServiceError(str(exc)) from exc
        finally:
            delete_file(provider, uploaded_audio)

        transcript_text = str(payload.get("transcript_text") or "").strip()
        if not transcript_text:
            raise AsrServiceError("Gemini did not return a transcript.")

        language_code = str(payload.get("language_code") or "").strip().lower() or normalized_language
        try:
            duration_seconds = probe_audio_duration_seconds(file_path)
        except Exception:
            duration_seconds = None

        return AsrTranscriptionResult(
            text=transcript_text,
            language=language_code,
            duration_seconds=duration_seconds,
            model_name=provider.model_name,
            segments=[],
        )

    def _transcribe_waveform_with_gemini(
        self,
        provider: AIProvider,
        waveform: np.ndarray,
        *,
        language: str | None = None,
        context_prompt: str | None = None,
    ) -> AsrTranscriptionResult:
        if waveform.ndim != 1:
            raise AsrServiceError("Streaming audio must be mono.")
        if waveform.size == 0:
            raise AsrServiceError("No speech detected in the uploaded file.")

        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
                temp_path = Path(handle.name)
            self._write_waveform_wav(temp_path, waveform)
            return self._transcribe_file_with_gemini(
                provider,
                temp_path,
                language=language,
                context_prompt=context_prompt,
            )
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    @staticmethod
    def _write_waveform_wav(path: Path, waveform: np.ndarray) -> None:
        clipped = np.clip(waveform.astype(np.float32, copy=False), -1.0, 1.0)
        pcm16 = (clipped * 32767.0).astype(np.int16, copy=False)
        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(settings.asr_live_sample_rate)
            wav_file.writeframes(pcm16.tobytes())

    @staticmethod
    def _build_gemini_prompt_lines(
        *,
        language: str | None,
        context_prompt: str | None,
    ) -> list[str]:
        prompt_lines = [
            "Transcribe this audio accurately and return strict JSON only.",
            "Preserve the spoken wording, names, numbers, mixed-language phrases, and meaningful filler words.",
            "Do not summarize, rewrite, or translate unless the speech itself does that.",
            "If parts are unclear, make the best-effort transcript instead of refusing.",
            MANDARIN_STYLE_PROMPT,
        ]
        if language:
            prompt_lines.append(
                f"Language hint: {language}. Prefer that language code when you return language_code."
            )
        normalized_context = (context_prompt or "").strip()
        if normalized_context:
            prompt_lines.append(
                "Prior transcript context for names and phrasing only. Do not repeat it unless it is spoken in this audio: "
                + normalized_context
            )
        return prompt_lines


service = ProviderAsrService()
