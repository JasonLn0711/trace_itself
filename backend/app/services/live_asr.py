import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from time import monotonic
from uuid import uuid4

import numpy as np
from faster_whisper.vad import VadOptions, get_speech_timestamps

from app.core.config import get_settings
from app.models.ai_provider import AIProvider
from app.services.asr import AsrRuntimeUnavailableError, AsrServiceError, service as asr_service
from app.services.provider_asr import service as provider_asr_service

settings = get_settings()
ORPHANED_PENDING_SESSION_SECONDS = 10
ACTIVE_SESSION_IDLE_SECONDS = 180
FINALIZED_SESSION_IDLE_SECONDS = 1800


class LiveAsrSessionError(RuntimeError):
    pass


@dataclass(slots=True)
class LiveTranscriptEntry:
    id: str
    recorded_at: datetime
    text: str


@dataclass(slots=True)
class LiveAsrSession:
    id: str
    user_id: int
    provider_id: int
    model_name: str
    final_provider_id: int
    final_model_name: str
    final_provider: AIProvider
    language_hint: str | None
    max_duration_seconds: int
    created_at: float
    updated_at: float
    committed_text: str = ""
    partial_text: str = ""
    detected_language: str | None = None
    level: float = 0.0
    state: str = "idle"
    total_samples: int = 0
    current_utterance_chunks: list[np.ndarray] = field(default_factory=list)
    current_utterance_samples: int = 0
    current_utterance_started_at: datetime | None = None
    trailing_silence_seconds: float = 0.0
    last_partial_at: float = 0.0
    smoothed_gain: float = 1.0
    entries: list[LiveTranscriptEntry] = field(default_factory=list)
    finalized: bool = False
    persisted: bool = False
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)


class LiveAsrSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, LiveAsrSession] = {}

    def create_session(
        self,
        *,
        user_id: int,
        provider_id: int,
        model_name: str,
        final_provider_id: int,
        final_model_name: str,
        final_provider: AIProvider,
        language_hint: str | None,
        max_duration_seconds: int,
    ) -> LiveAsrSession:
        self._cleanup_expired()
        self._cleanup_orphaned_pending_sessions(user_id)
        active_sessions = sum(
            1 for session in self._sessions.values() if session.user_id == user_id and not session.finalized
        )
        if active_sessions >= max(1, settings.asr_live_max_sessions_per_user):
            raise LiveAsrSessionError("Too many live ASR sessions are already open for this account.")
        now = monotonic()
        session = LiveAsrSession(
            id=uuid4().hex,
            user_id=user_id,
            provider_id=provider_id,
            model_name=model_name,
            final_provider_id=final_provider_id,
            final_model_name=final_model_name,
            final_provider=final_provider,
            language_hint=language_hint,
            max_duration_seconds=max_duration_seconds,
            created_at=now,
            updated_at=now,
        )
        self._sessions[session.id] = session
        return session

    def get_session(self, session_id: str, user_id: int) -> LiveAsrSession:
        self._cleanup_expired()
        session = self._sessions.get(session_id)
        if session is None or session.user_id != user_id:
            raise LiveAsrSessionError("Live ASR session not found.")
        return session

    def pop_session(self, session_id: str, user_id: int) -> LiveAsrSession:
        session = self.get_session(session_id, user_id)
        self._sessions.pop(session.id, None)
        return session

    def discard_session(self, session_id: str, user_id: int) -> None:
        session = self._sessions.get(session_id)
        if session and session.user_id == user_id:
            self._sessions.pop(session_id, None)

    async def ingest_chunk(self, session_id: str, user_id: int, raw_chunk: bytes) -> LiveAsrSession:
        session = self.get_session(session_id, user_id)
        async with session.lock:
            if session.finalized:
                raise LiveAsrSessionError("Live ASR session is already finalized.")

            chunk = self._decode_chunk(raw_chunk)
            if chunk.size == 0:
                raise LiveAsrSessionError("Audio chunk is empty.")

            prepared = self._normalize_chunk(session, chunk)
            session.level = self._estimate_level(prepared)
            session.updated_at = monotonic()
            session.total_samples += prepared.size

            if (session.total_samples / settings.asr_live_sample_rate) > session.max_duration_seconds:
                raise LiveAsrSessionError("Live stream reached the audio cap for one session.")

            now_utc = datetime.now(timezone.utc)
            has_speech = self._has_speech(prepared)
            if has_speech:
                if session.current_utterance_samples == 0:
                    session.current_utterance_started_at = now_utc
                session.current_utterance_chunks.append(prepared)
                session.current_utterance_samples += prepared.size
                session.trailing_silence_seconds = 0.0
                session.state = "speech"
            elif session.current_utterance_samples:
                if session.current_utterance_started_at is None:
                    session.current_utterance_started_at = now_utc
                session.current_utterance_chunks.append(prepared)
                session.current_utterance_samples += prepared.size
                session.trailing_silence_seconds += prepared.size / settings.asr_live_sample_rate
                session.state = "speech"
            else:
                session.state = "listening"

            if (
                session.current_utterance_samples
                and session.trailing_silence_seconds >= settings.asr_live_commit_silence_seconds
            ):
                await self._commit_current_utterance(session)
                session.state = "listening"
                return session

            if session.current_utterance_samples >= int(settings.asr_live_max_utterance_seconds * settings.asr_live_sample_rate):
                await self._commit_current_utterance(session)
                session.state = "listening"
                return session

            if (
                session.current_utterance_samples >= int(settings.asr_live_sample_rate * 0.8)
                and (monotonic() - session.last_partial_at) >= settings.asr_live_partial_interval_seconds
            ):
                await self._refresh_partial(session)

            return session

    async def finalize_session(self, session_id: str, user_id: int) -> LiveAsrSession:
        session = self.get_session(session_id, user_id)
        async with session.lock:
            if session.finalized:
                return session

            if session.current_utterance_samples:
                await self._commit_current_utterance(session)

            session.partial_text = ""
            session.finalized = True
            session.state = "finalized"
            session.updated_at = monotonic()
            return session

    def mark_persisted(self, session_id: str, user_id: int) -> None:
        session = self.get_session(session_id, user_id)
        session.persisted = True
        self._sessions.pop(session_id, None)

    async def _refresh_partial(self, session: LiveAsrSession) -> None:
        preview_audio = self._build_tail_audio(session.current_utterance_chunks, settings.asr_live_max_window_seconds)
        try:
            result = await asyncio.to_thread(
                asr_service.transcribe_waveform,
                preview_audio,
                language=session.detected_language or session.language_hint,
                model_name=session.model_name,
                beam_size=settings.asr_live_preview_beam_size,
                initial_prompt=self._prompt_tail(session.committed_text),
                condition_on_previous_text=False,
                chunk_length=min(
                    max(8, int(round(preview_audio.size / settings.asr_live_sample_rate))),
                    settings.asr_live_max_window_seconds,
                ),
                vad_parameters=self._vad_parameters(),
            )
        except AsrRuntimeUnavailableError:
            raise
        except AsrServiceError:
            session.last_partial_at = monotonic()
            return

        session.partial_text = result.text
        session.detected_language = result.language or session.detected_language
        session.last_partial_at = monotonic()

    async def _commit_current_utterance(self, session: LiveAsrSession) -> None:
        full_audio = self._concatenate_chunks(session.current_utterance_chunks)
        prompt_tail = self._prompt_tail(session.committed_text)
        try:
            result = await asyncio.to_thread(
                provider_asr_service.transcribe_waveform,
                session.final_provider,
                full_audio,
                language=session.detected_language or session.language_hint,
                beam_size=settings.asr_live_final_beam_size,
                initial_prompt=prompt_tail,
                condition_on_previous_text=False,
                chunk_length=min(
                    max(8, int(round(full_audio.size / settings.asr_live_sample_rate))),
                    max(settings.asr_live_max_window_seconds, 30),
                ),
                vad_parameters=self._vad_parameters(),
            )
        except AsrRuntimeUnavailableError:
            raise
        except AsrServiceError:
            result = None

        if result is None and (
            session.final_provider_id != session.provider_id or session.final_model_name != session.model_name
        ):
            try:
                result = await asyncio.to_thread(
                    asr_service.transcribe_waveform,
                    full_audio,
                    language=session.detected_language or session.language_hint,
                    model_name=session.model_name,
                    beam_size=settings.asr_live_final_beam_size,
                    initial_prompt=prompt_tail,
                    condition_on_previous_text=False,
                    chunk_length=min(
                        max(8, int(round(full_audio.size / settings.asr_live_sample_rate))),
                        max(settings.asr_live_max_window_seconds, 30),
                    ),
                    vad_parameters=self._vad_parameters(),
                )
            except AsrRuntimeUnavailableError:
                raise
            except AsrServiceError:
                result = None

        raw_committed_text = result.text.strip() if result and result.text else ""
        committed_text = self._extract_incremental_text(session.committed_text, raw_committed_text)
        if not committed_text:
            committed_text = self._extract_incremental_text(session.committed_text, session.partial_text.strip())
        if committed_text:
            session.committed_text = self._append_text(session.committed_text, committed_text)
            if result and result.language:
                session.detected_language = result.language or session.detected_language
            session.entries.insert(
                0,
                LiveTranscriptEntry(
                    id=uuid4().hex,
                    recorded_at=session.current_utterance_started_at or datetime.now(timezone.utc),
                    text=committed_text,
                ),
            )

        session.partial_text = ""
        session.current_utterance_chunks.clear()
        session.current_utterance_samples = 0
        session.current_utterance_started_at = None
        session.trailing_silence_seconds = 0.0
        session.last_partial_at = monotonic()

    def _cleanup_expired(self) -> None:
        now = monotonic()
        expired: list[str] = []
        for session_id, session in self._sessions.items():
            idle_seconds = now - session.updated_at
            if session.finalized and idle_seconds > FINALIZED_SESSION_IDLE_SECONDS:
                expired.append(session_id)
            elif not session.finalized and idle_seconds > ACTIVE_SESSION_IDLE_SECONDS:
                expired.append(session_id)
        for session_id in expired:
            self._sessions.pop(session_id, None)

    def _cleanup_orphaned_pending_sessions(self, user_id: int) -> None:
        now = monotonic()
        expired = [
            session_id
            for session_id, session in self._sessions.items()
            if session.user_id == user_id
            and not session.finalized
            and session.total_samples == 0
            and (now - session.created_at) > ORPHANED_PENDING_SESSION_SECONDS
        ]
        for session_id in expired:
            self._sessions.pop(session_id, None)

    @staticmethod
    def _decode_chunk(raw_chunk: bytes) -> np.ndarray:
        even_length = len(raw_chunk) - (len(raw_chunk) % 2)
        if even_length <= 0:
            return np.zeros(0, dtype=np.float32)
        int_samples = np.frombuffer(raw_chunk[:even_length], dtype=np.int16)
        return int_samples.astype(np.float32) / 32768.0

    def _normalize_chunk(self, session: LiveAsrSession, chunk: np.ndarray) -> np.ndarray:
        if chunk.size == 0:
            return chunk

        prepared = chunk - float(np.mean(chunk))
        rms = float(np.sqrt(np.mean(np.square(prepared)))) if prepared.size else 0.0
        if rms < 0.0008:
            return np.zeros_like(prepared)

        target_rms = 0.18
        desired_gain = min(4.0, max(0.85, target_rms / max(rms, 1e-4)))
        session.smoothed_gain = session.smoothed_gain * 0.82 + desired_gain * 0.18
        prepared = prepared * session.smoothed_gain

        peak = float(np.max(np.abs(prepared))) if prepared.size else 0.0
        if peak > 0.98:
            prepared = prepared / peak * 0.98

        prepared[np.abs(prepared) < 0.003] = 0.0
        return prepared.astype(np.float32, copy=False)

    def _has_speech(self, chunk: np.ndarray) -> bool:
        if chunk.size == 0 or np.max(np.abs(chunk)) < 0.01:
            return False
        speech_timestamps = get_speech_timestamps(
            chunk,
            vad_options=VadOptions(
                threshold=settings.asr_live_vad_threshold,
                min_speech_duration_ms=80,
                min_silence_duration_ms=settings.asr_live_vad_min_silence_ms,
                speech_pad_ms=settings.asr_live_vad_speech_pad_ms,
            ),
            sampling_rate=settings.asr_live_sample_rate,
        )
        return bool(speech_timestamps)

    @staticmethod
    def _concatenate_chunks(chunks: list[np.ndarray]) -> np.ndarray:
        if not chunks:
            return np.zeros(0, dtype=np.float32)
        if len(chunks) == 1:
            return chunks[0]
        return np.concatenate(chunks, axis=0).astype(np.float32, copy=False)

    def _build_tail_audio(self, chunks: list[np.ndarray], max_seconds: int) -> np.ndarray:
        max_samples = max_seconds * settings.asr_live_sample_rate
        if not chunks:
            return np.zeros(0, dtype=np.float32)

        collected: list[np.ndarray] = []
        running = 0
        for chunk in reversed(chunks):
            collected.append(chunk)
            running += chunk.size
            if running >= max_samples:
                break

        tail = self._concatenate_chunks(list(reversed(collected)))
        if tail.size <= max_samples:
            return tail
        return tail[-max_samples:]

    @staticmethod
    def _estimate_level(chunk: np.ndarray) -> float:
        if chunk.size == 0:
            return 0.0
        rms = float(np.sqrt(np.mean(np.square(chunk))))
        return min(1.0, max(0.0, rms * 7.0))

    @staticmethod
    def _append_text(existing: str, addition: str) -> str:
        if not addition.strip():
            return existing.strip()
        if not existing.strip():
            return addition.strip()
        return f"{existing.rstrip()}\n{addition.strip()}"

    @classmethod
    def _extract_incremental_text(cls, existing: str, candidate: str) -> str:
        candidate = candidate.strip()
        if not candidate:
            return ""

        normalized_existing = cls._normalize_text_for_overlap(existing)
        normalized_candidate = cls._normalize_text_for_overlap(candidate)
        if not normalized_existing or not normalized_candidate:
            return candidate
        if normalized_candidate == normalized_existing:
            return ""

        overlap = cls._longest_overlap_suffix_prefix(normalized_existing, normalized_candidate)
        if not overlap or len(overlap) < cls._minimum_overlap_length(normalized_candidate):
            return candidate
        return cls._trim_prefix_by_normalized_text(candidate, overlap)

    @staticmethod
    def _preview_text(session: LiveAsrSession) -> str:
        if session.committed_text and session.partial_text:
            return f"{session.committed_text.rstrip()}\n{session.partial_text.strip()}"
        return session.partial_text.strip() or session.committed_text.strip()

    @staticmethod
    def _prompt_tail(value: str) -> str | None:
        words = value.split()
        if not words:
            return None
        return " ".join(words[-settings.asr_live_prompt_tail_words :])

    @staticmethod
    def _normalize_text_for_overlap(value: str) -> str:
        return " ".join(value.split())

    @staticmethod
    def _longest_overlap_suffix_prefix(existing: str, candidate: str) -> str:
        max_overlap = min(len(existing), len(candidate))
        for length in range(max_overlap, 0, -1):
            if existing[-length:] == candidate[:length]:
                return candidate[:length]
        return ""

    @staticmethod
    def _minimum_overlap_length(candidate: str) -> int:
        return max(6, len(candidate) // 3)

    @classmethod
    def _trim_prefix_by_normalized_text(cls, value: str, normalized_prefix: str) -> str:
        if not normalized_prefix:
            return value.strip()

        collapsed: list[str] = []
        pending_space = False
        for index, char in enumerate(value):
            if char.isspace():
                if collapsed:
                    pending_space = True
                continue
            if pending_space:
                collapsed.append(" ")
                pending_space = False
            collapsed.append(char)
            if "".join(collapsed) == normalized_prefix:
                return value[index + 1 :].strip()
        return value.strip()

    @staticmethod
    def _vad_parameters() -> dict[str, int | float]:
        return {
            "threshold": settings.asr_live_vad_threshold,
            "min_silence_duration_ms": settings.asr_live_vad_min_silence_ms,
            "speech_pad_ms": settings.asr_live_vad_speech_pad_ms,
        }

    def build_payload(self, session: LiveAsrSession) -> dict[str, object]:
        partial_entry = None
        if session.partial_text.strip():
            partial_entry = {
                "id": f"partial-{session.id}",
                "recorded_at": (session.current_utterance_started_at or datetime.now(timezone.utc)).isoformat(),
                "text": session.partial_text.strip(),
            }

        return {
            "session_id": session.id,
            "state": session.state,
            "language": session.detected_language or session.language_hint,
            "duration_seconds": round(session.total_samples / settings.asr_live_sample_rate, 3),
            "level": round(session.level, 4),
            "committed_text": session.committed_text,
            "partial_text": session.partial_text,
            "preview_text": self._preview_text(session),
            "entries": [
                item
                for item in self.serialize_entries(session.entries)
            ],
            "partial_entry": partial_entry,
            "model_name": session.model_name,
            "final_model_name": session.final_model_name,
            "final_ready": session.finalized,
        }

    @staticmethod
    def serialize_entries(entries: list[LiveTranscriptEntry]) -> list[dict[str, str]]:
        return [
            {
                "id": entry.id,
                "recorded_at": entry.recorded_at.isoformat(),
                "text": entry.text,
            }
            for entry in entries
        ]


service = LiveAsrSessionManager()
