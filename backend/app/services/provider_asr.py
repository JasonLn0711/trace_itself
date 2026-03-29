from pathlib import Path

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
            return self._transcribe_file_with_gemini(provider, file_path, language=language)
        raise AsrServiceError("Selected ASR provider driver is not supported.")

    def _transcribe_file_with_gemini(
        self,
        provider: AIProvider,
        file_path: Path,
        *,
        language: str | None = None,
    ) -> AsrTranscriptionResult:
        uploaded_audio = None
        normalized_language = (language or "").strip().lower() or None
        prompt_lines = [
            "Transcribe this audio accurately and return strict JSON only.",
            "Preserve the spoken wording, names, numbers, mixed-language phrases, and meaningful filler words.",
            "Do not summarize, rewrite, or translate unless the speech itself does that.",
            "If parts are unclear, make the best-effort transcript instead of refusing.",
        ]
        if normalized_language:
            prompt_lines.append(
                f"Language hint: {normalized_language}. Prefer that language code when you return language_code."
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


service = ProviderAsrService()
