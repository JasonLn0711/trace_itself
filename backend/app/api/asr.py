import logging
import json
import re
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_asr_transcript_or_404, get_current_user, require_asr_access, resolve_ai_provider
from app.core.enums import AIProviderKind
from app.core.config import get_settings
from app.db.session import SessionLocal, get_db
from app.models.ai_provider import AIProvider
from app.models.asr_transcript import AsrTranscript
from app.models.user import User
from app.schemas.asr import AsrTranscriptRead, AsrTranscriptSummary, LiveAsrSessionCreate, LiveAsrSessionRead
from app.services.asr import AsrRuntimeUnavailableError, AsrServiceError
from app.services.audio_storage import delete_audio_file, probe_audio_duration_seconds, save_upload_file
from app.services.diarization import DiarizationRuntimeUnavailableError, DiarizationServiceError, service as diarization_service
from app.services.live_asr import LiveAsrSessionError, service as live_asr_service
from app.services.meeting_transcription import service as meeting_transcription_service
from app.services.provider_asr import service as provider_asr_service
from app.services.usage_policy import ensure_audio_duration_allowed, get_or_create_usage_policy, record_usage_event
from app.core.enums import UsageEventKind

router = APIRouter(prefix="/asr", tags=["asr"], dependencies=[Depends(require_asr_access)])
settings = get_settings()
logger = logging.getLogger(__name__)

POST_PROCESSING_COMPLETED = "completed"
POST_PROCESSING_QUEUED = "queued"
POST_PROCESSING_RUNNING = "running"
POST_PROCESSING_FAILED = "failed"
VALID_POST_PROCESSING_STATES = {
    POST_PROCESSING_COMPLETED,
    POST_PROCESSING_QUEUED,
    POST_PROCESSING_RUNNING,
    POST_PROCESSING_FAILED,
}


async def read_capped_request_body(request: Request, *, max_bytes: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Live audio chunk exceeds the {settings.asr_live_max_chunk_kb} KB limit.",
                )
        except ValueError:
            pass

    buffer = bytearray()
    async for chunk in request.stream():
        if not chunk:
            continue
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Live audio chunk exceeds the {settings.asr_live_max_chunk_kb} KB limit.",
            )
    return bytes(buffer)


def build_excerpt(value: str, max_length: int = 180) -> str:
    compact = " ".join(value.split()).strip()
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 1].rstrip()}…"


def to_summary(transcript: AsrTranscript) -> AsrTranscriptSummary:
    parsed_entries = parse_transcript_entries(transcript.transcript_entries_json)
    return AsrTranscriptSummary(
        id=transcript.id,
        title=transcript.title,
        original_filename=transcript.original_filename,
        audio_mime_type=transcript.audio_mime_type,
        language=transcript.language,
        duration_seconds=transcript.duration_seconds,
        file_size_bytes=transcript.file_size_bytes,
        model_name=transcript.model_name,
        capture_mode=normalize_capture_mode(transcript.capture_mode),
        live_entry_count=len(parsed_entries),
        speaker_diarization_enabled=bool(transcript.speaker_diarization_enabled),
        speaker_count=transcript.speaker_count,
        post_processing_state=normalize_post_processing_state(transcript.post_processing_state),
        excerpt=build_excerpt(transcript.transcript_text),
        created_at=transcript.created_at,
        updated_at=transcript.updated_at,
    )


def to_read(transcript: AsrTranscript) -> AsrTranscriptRead:
    return AsrTranscriptRead(
        id=transcript.id,
        title=transcript.title,
        original_filename=transcript.original_filename,
        audio_mime_type=transcript.audio_mime_type,
        language=transcript.language,
        duration_seconds=transcript.duration_seconds,
        file_size_bytes=transcript.file_size_bytes,
        model_name=transcript.model_name,
        capture_mode=normalize_capture_mode(transcript.capture_mode),
        transcript_text=transcript.transcript_text,
        transcript_entries=parse_transcript_entries(transcript.transcript_entries_json),
        speaker_diarization_enabled=bool(transcript.speaker_diarization_enabled),
        speaker_count=transcript.speaker_count,
        speaker_diarization_model_name=transcript.speaker_diarization_model_name,
        post_processing_state=normalize_post_processing_state(transcript.post_processing_state),
        post_processing_error=normalize_post_processing_error(transcript.post_processing_error),
        created_at=transcript.created_at,
        updated_at=transcript.updated_at,
    )


def normalize_title(raw_title: str | None, original_filename: str) -> str:
    candidate = (raw_title or "").strip()
    if candidate:
        return candidate[:200]
    stem = Path(original_filename).stem.replace("_", " ").replace("-", " ").strip()
    return (stem or "Transcript")[:200]


def normalize_language(raw_language: str | None) -> str | None:
    normalized_language = (raw_language or "").strip().lower() or None
    if normalized_language == "auto":
        normalized_language = None
    return normalized_language


def normalize_capture_mode(raw_capture_mode: str | None) -> str:
    normalized = (raw_capture_mode or "").strip().lower()
    if normalized in {"live", "file"}:
        return normalized
    return "file"


def normalize_post_processing_state(raw_state: str | None) -> str:
    normalized = (raw_state or "").strip().lower()
    if normalized in VALID_POST_PROCESSING_STATES:
        return normalized
    return POST_PROCESSING_COMPLETED


def normalize_post_processing_error(raw_error: str | None) -> str | None:
    normalized = (raw_error or "").strip()
    return normalized or None


def build_download_filename(stem: str | None, suffix: str) -> str:
    candidate = (stem or "").strip() or "transcript"
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", candidate).strip("._-")
    return f"{safe_stem or 'transcript'}.{suffix}"


def normalize_uploaded_filename(filename: str | None) -> str | None:
    candidate = Path(filename or "").name.strip()[:255]
    return candidate or None


def build_transcript_only_filename(title: str | None) -> str:
    return build_download_filename((title or "").strip() or "live transcript", "txt")


def resolve_live_original_filename(title: str | None, uploaded_filename: str | None) -> str:
    return normalize_uploaded_filename(uploaded_filename) or build_transcript_only_filename(title)


def serialize_live_entries(entries: list[dict[str, str]]) -> str | None:
    return serialize_transcript_entries(entries)


def serialize_transcript_entries(entries: list[dict[str, object]]) -> str | None:
    normalized_entries: list[dict[str, object]] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        entry_id = str(item.get("id", "")).strip()
        text = str(item.get("text", "")).strip()
        if not entry_id or not text:
            continue

        normalized: dict[str, object] = {
            "id": entry_id,
            "text": text,
        }
        recorded_at = str(item.get("recorded_at", "")).strip()
        if recorded_at:
            normalized["recorded_at"] = recorded_at

        speaker_label = str(item.get("speaker_label", "")).strip()
        if speaker_label:
            normalized["speaker_label"] = speaker_label

        started_at_seconds = parse_optional_seconds(item.get("started_at_seconds"))
        if started_at_seconds is not None:
            normalized["started_at_seconds"] = started_at_seconds

        ended_at_seconds = parse_optional_seconds(item.get("ended_at_seconds"))
        if ended_at_seconds is not None:
            normalized["ended_at_seconds"] = ended_at_seconds

        normalized_entries.append(normalized)

    if not normalized_entries:
        return None
    return json.dumps(normalized_entries, separators=(",", ":"))


def parse_transcript_entries(value: str | None) -> list[dict[str, object]]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    normalized: list[dict[str, object]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        entry_id = str(item.get("id", "")).strip()
        text = str(item.get("text", "")).strip()
        if not entry_id or not text:
            continue

        normalized_entry: dict[str, object] = {
            "id": entry_id,
            "text": text,
        }
        recorded_at = str(item.get("recorded_at", "")).strip()
        if recorded_at:
            normalized_entry["recorded_at"] = recorded_at

        speaker_label = str(item.get("speaker_label", "")).strip()
        if speaker_label:
            normalized_entry["speaker_label"] = speaker_label

        started_at_seconds = parse_optional_seconds(item.get("started_at_seconds"))
        if started_at_seconds is not None:
            normalized_entry["started_at_seconds"] = started_at_seconds

        ended_at_seconds = parse_optional_seconds(item.get("ended_at_seconds"))
        if ended_at_seconds is not None:
            normalized_entry["ended_at_seconds"] = ended_at_seconds

        normalized.append(normalized_entry)
    return normalized


def parse_optional_seconds(value: object) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def has_diarized_transcript_entries(entries: list[dict[str, object]]) -> bool:
    return any(
        str(entry.get("speaker_label", "")).strip() or parse_optional_seconds(entry.get("started_at_seconds")) is not None
        for entry in entries
    )


def format_audio_timestamp(seconds: float | None) -> str | None:
    if seconds is None:
        return None
    total_seconds = max(0, int(round(seconds)))
    minutes, remaining_seconds = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"
    return f"{minutes:02d}:{remaining_seconds:02d}"


def build_transcript_text_download(transcript: AsrTranscript) -> str:
    entries = parse_transcript_entries(transcript.transcript_entries_json)
    if not has_diarized_transcript_entries(entries):
        return transcript.transcript_text

    lines: list[str] = []
    for entry in entries:
        parts: list[str] = []
        timestamp = format_audio_timestamp(parse_optional_seconds(entry.get("started_at_seconds")))
        if timestamp:
            parts.append(f"[{timestamp}]")

        speaker_label = str(entry.get("speaker_label", "")).strip()
        if speaker_label:
            parts.append(f"{speaker_label}:")

        text = str(entry.get("text", "")).strip()
        if text:
            parts.append(text)

        line = " ".join(parts).strip()
        if line:
            lines.append(line)

    return "\n".join(lines).strip() or transcript.transcript_text


def set_post_processing_status(
    transcript: AsrTranscript,
    *,
    state: str,
    error: str | None = None,
) -> None:
    transcript.post_processing_state = normalize_post_processing_state(state)
    transcript.post_processing_error = normalize_post_processing_error(error)


def persist_live_transcript_reprocessing(
    *,
    transcript_id: int,
    storage_relative_path: str,
    language: str | None,
    provider_id: int,
) -> None:
    audio_path = Path(settings.asr_upload_dir) / storage_relative_path
    with SessionLocal() as db:
        transcript = db.get(AsrTranscript, transcript_id)
        if transcript is None:
            return
        provider = db.get(AIProvider, provider_id)
        if provider is None or not provider.is_active:
            set_post_processing_status(
                transcript,
                state=POST_PROCESSING_FAILED,
                error="Final transcript provider is no longer available.",
            )
            db.commit()
            return
        if not audio_path.exists():
            set_post_processing_status(
                transcript,
                state=POST_PROCESSING_FAILED,
                error="Replay audio file is no longer available for background processing.",
            )
            db.commit()
            return

        set_post_processing_status(transcript, state=POST_PROCESSING_RUNNING, error=None)
        db.commit()

        try:
            provider_asr_service.ensure_provider_ready(provider)
            result = meeting_transcription_service.transcribe(
                audio_path,
                language=language,
                provider=provider,
                enable_speaker_diarization=provider_asr_service.supports_speaker_diarization(provider),
                max_speaker_count=None,
            )
        except (AsrRuntimeUnavailableError, AsrServiceError, DiarizationRuntimeUnavailableError, DiarizationServiceError) as exc:
            logger.exception("Saved live ASR replay processing failed for transcript %s.", transcript_id)
            transcript = db.get(AsrTranscript, transcript_id)
            if transcript is None:
                return
            set_post_processing_status(
                transcript,
                state=POST_PROCESSING_FAILED,
                error=str(exc),
            )
            db.commit()
            return

        transcript = db.get(AsrTranscript, transcript_id)
        if transcript is None:
            return

        transcript.transcript_text = result.transcript_text
        transcript.transcript_entries_json = serialize_meeting_transcript_entries(result.transcript_entries)
        transcript.language = result.language
        transcript.duration_seconds = result.duration_seconds or transcript.duration_seconds
        transcript.model_name = result.asr_model_name
        transcript.speaker_diarization_enabled = result.speaker_diarization_enabled
        transcript.speaker_count = result.speaker_count
        transcript.speaker_diarization_model_name = result.speaker_diarization_model_name
        set_post_processing_status(transcript, state=POST_PROCESSING_COMPLETED, error=None)
        db.commit()


def serialize_meeting_transcript_entries(entries) -> str | None:
    return serialize_transcript_entries(
        [
            {
                "id": entry.id,
                "speaker_label": entry.speaker_label,
                "started_at_seconds": entry.started_at_seconds,
                "ended_at_seconds": entry.ended_at_seconds,
                "text": entry.text,
            }
            for entry in entries
        ]
    )


def to_live_read(payload: dict[str, object]) -> LiveAsrSessionRead:
    return LiveAsrSessionRead.model_validate(payload)


@router.get("/transcripts/{transcript_id}/audio")
def download_audio(transcript: AsrTranscript = Depends(get_asr_transcript_or_404)) -> FileResponse:
    if not transcript.audio_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found.")
    path = Path(settings.asr_upload_dir) / transcript.audio_storage_path
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found.")
    return FileResponse(path, media_type=transcript.audio_mime_type, filename=transcript.original_filename)


@router.get("/transcripts/{transcript_id}/text")
def download_transcript_text(transcript: AsrTranscript = Depends(get_asr_transcript_or_404)) -> PlainTextResponse:
    filename = build_download_filename(transcript.title, "txt")
    return PlainTextResponse(
        build_transcript_text_download(transcript),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/transcripts", response_model=list[AsrTranscriptSummary])
def list_transcripts(
    limit: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AsrTranscriptSummary]:
    stmt = (
        select(AsrTranscript)
        .where(AsrTranscript.user_id == current_user.id)
        .order_by(AsrTranscript.created_at.desc())
        .limit(limit)
    )
    return [to_summary(item) for item in db.scalars(stmt).all()]


@router.get("/transcripts/{transcript_id}", response_model=AsrTranscriptRead)
def get_transcript(transcript: AsrTranscript = Depends(get_asr_transcript_or_404)) -> AsrTranscriptRead:
    return to_read(transcript)


@router.post("/live-sessions", response_model=LiveAsrSessionRead, status_code=status.HTTP_201_CREATED)
def create_live_session(
    payload: LiveAsrSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LiveAsrSessionRead:
    provider = resolve_ai_provider(
        kind=AIProviderKind.ASR,
        provider_id=payload.provider_id,
        current_user=current_user,
        db=db,
    )
    if not provider_asr_service.supports_live_streaming(provider):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Live partial ASR currently supports only local Breeze providers.",
        )
    final_provider = resolve_ai_provider(
        kind=AIProviderKind.ASR,
        provider_id=payload.final_provider_id,
        current_user=current_user,
        db=db,
    )
    try:
        provider_asr_service.ensure_provider_ready(provider)
        if final_provider.id != provider.id:
            provider_asr_service.ensure_provider_ready(final_provider)
    except AsrRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    policy = get_or_create_usage_policy(db)
    try:
        session = live_asr_service.create_session(
            user_id=current_user.id,
            provider_id=provider.id,
            model_name=provider.model_name,
            final_provider_id=final_provider.id,
            final_model_name=final_provider.model_name,
            language_hint=normalize_language(payload.language),
            max_duration_seconds=policy.max_audio_seconds_per_request,
        )
    except LiveAsrSessionError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    return to_live_read(live_asr_service.build_payload(session))


@router.post("/live-sessions/{session_id}/chunks", response_model=LiveAsrSessionRead)
async def ingest_live_chunk(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> LiveAsrSessionRead:
    raw_chunk = await read_capped_request_body(request, max_bytes=settings.asr_live_max_chunk_bytes)
    if not raw_chunk:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio chunk is empty.")
    try:
        session = await live_asr_service.ingest_chunk(session_id, current_user.id, raw_chunk)
    except AsrRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except LiveAsrSessionError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return to_live_read(live_asr_service.build_payload(session))


@router.post("/live-sessions/{session_id}/finalize", response_model=LiveAsrSessionRead)
async def finalize_live_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
) -> LiveAsrSessionRead:
    try:
        session = await live_asr_service.finalize_session(session_id, current_user.id)
    except AsrRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except LiveAsrSessionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_live_read(live_asr_service.build_payload(session))


@router.post("/live-sessions/{session_id}/persist", response_model=AsrTranscriptRead, status_code=status.HTTP_201_CREATED)
async def persist_live_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(default=None),
    title: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AsrTranscriptRead:
    try:
        session = live_asr_service.get_session(session_id, current_user.id)
    except LiveAsrSessionError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if not session.finalized:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Finalize the live session before saving it.")
    if not session.committed_text.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No speech was captured in this live session.")

    captured_duration_seconds = round(session.total_samples / settings.asr_live_sample_rate, 3)
    policy = get_or_create_usage_policy(db)
    if captured_duration_seconds > 0:
        ensure_audio_duration_allowed(captured_duration_seconds, policy)

    fallback_original_filename = resolve_live_original_filename(title, file.filename if file is not None else None)
    stored_audio = None
    if file is not None:
        try:
            stored_audio = save_upload_file(
                file,
                storage_root=Path(settings.asr_upload_dir),
                max_bytes=settings.asr_max_upload_bytes,
                prefix=f"asr-live-{current_user.id}",
            )
            if captured_duration_seconds <= 0:
                captured_duration_seconds = probe_audio_duration_seconds(stored_audio.storage_path)
                ensure_audio_duration_allowed(captured_duration_seconds, policy)
        except HTTPException:
            if stored_audio is not None:
                delete_audio_file(stored_audio.storage_path)
            stored_audio = None
        except Exception:
            if stored_audio is not None:
                delete_audio_file(stored_audio.storage_path)
            logger.exception("Live ASR audio attachment failed; continuing with transcript-only save.")
            stored_audio = None

    transcript_text = session.committed_text
    transcript_entries_json = serialize_live_entries(live_asr_service.serialize_entries(session.entries))
    transcript_language = session.detected_language or session.language_hint
    transcript_duration_seconds = captured_duration_seconds or None
    transcript_model_name = session.model_name
    speaker_diarization_enabled = False
    speaker_count = None
    speaker_diarization_model_name = None
    post_processing_state = (
        POST_PROCESSING_QUEUED
        if stored_audio is not None
        else POST_PROCESSING_COMPLETED
    )

    transcript = AsrTranscript(
        user_id=current_user.id,
        title=normalize_title(title, stored_audio.original_filename if stored_audio else fallback_original_filename),
        original_filename=stored_audio.original_filename if stored_audio else fallback_original_filename,
        audio_storage_path=stored_audio.relative_storage_path if stored_audio else None,
        audio_mime_type=stored_audio.mime_type if stored_audio else None,
        language=transcript_language,
        duration_seconds=transcript_duration_seconds,
        file_size_bytes=stored_audio.file_size_bytes if stored_audio else 0,
        model_name=transcript_model_name,
        capture_mode="live",
        transcript_text=transcript_text,
        transcript_entries_json=transcript_entries_json,
        speaker_diarization_enabled=speaker_diarization_enabled,
        speaker_count=speaker_count,
        speaker_diarization_model_name=speaker_diarization_model_name,
        post_processing_state=post_processing_state,
        post_processing_error=None,
    )
    db.add(transcript)
    record_usage_event(
        db,
        user_id=current_user.id,
        provider_id=session.provider_id,
        kind=UsageEventKind.ASR_AUDIO,
        source="asr_live_stream",
        duration_seconds=captured_duration_seconds,
    )
    db.commit()
    db.refresh(transcript)
    if (
        stored_audio is not None
        and background_tasks is not None
    ):
        background_tasks.add_task(
            persist_live_transcript_reprocessing,
            transcript_id=transcript.id,
            storage_relative_path=stored_audio.relative_storage_path,
            language=transcript_language,
            provider_id=session.final_provider_id,
        )
    live_asr_service.mark_persisted(session_id, current_user.id)
    return to_read(transcript)


@router.delete("/live-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def discard_live_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
) -> None:
    live_asr_service.discard_session(session_id, current_user.id)


@router.post("/transcripts", response_model=AsrTranscriptRead, status_code=status.HTTP_201_CREATED)
async def transcribe_audio(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    language: str | None = Form(default=None),
    provider_id: int | None = Form(default=None),
    speaker_diarization: bool = Form(default=False),
    max_speaker_count: int | None = Form(default=None, ge=2, le=8),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AsrTranscriptRead:
    provider = resolve_ai_provider(
        kind=AIProviderKind.ASR,
        provider_id=provider_id,
        current_user=current_user,
        db=db,
    )
    try:
        provider_asr_service.ensure_provider_ready(provider)
        if speaker_diarization and not provider_asr_service.supports_speaker_diarization(provider):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Selected ASR provider does not support speaker diarization on saved audio.",
            )
        if speaker_diarization:
            diarization_service.ensure_model_ready()
    except AsrRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DiarizationRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    stored_audio = save_upload_file(
        file,
        storage_root=Path(settings.asr_upload_dir),
        max_bytes=settings.asr_max_upload_bytes,
        prefix=f"asr-{current_user.id}",
    )
    try:
        policy = get_or_create_usage_policy(db)
        probed_duration_seconds = probe_audio_duration_seconds(stored_audio.storage_path)
        ensure_audio_duration_allowed(probed_duration_seconds, policy)
    except HTTPException:
        delete_audio_file(stored_audio.storage_path)
        raise

    normalized_language = normalize_language(language)

    try:
        result = meeting_transcription_service.transcribe(
            stored_audio.storage_path,
            language=normalized_language,
            provider=provider,
            enable_speaker_diarization=speaker_diarization,
            max_speaker_count=max_speaker_count,
        )
    except AsrRuntimeUnavailableError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except AsrServiceError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except DiarizationRuntimeUnavailableError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DiarizationServiceError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    transcript = AsrTranscript(
        user_id=current_user.id,
        title=normalize_title(title, stored_audio.original_filename),
        original_filename=stored_audio.original_filename,
        audio_storage_path=stored_audio.relative_storage_path,
        audio_mime_type=stored_audio.mime_type,
        language=result.language,
        duration_seconds=result.duration_seconds or probed_duration_seconds,
        file_size_bytes=stored_audio.file_size_bytes,
        model_name=result.asr_model_name,
        capture_mode="file",
        transcript_text=result.transcript_text,
        transcript_entries_json=serialize_meeting_transcript_entries(result.transcript_entries),
        speaker_diarization_enabled=result.speaker_diarization_enabled,
        speaker_count=result.speaker_count,
        speaker_diarization_model_name=result.speaker_diarization_model_name,
    )
    db.add(transcript)
    record_usage_event(
        db,
        user_id=current_user.id,
        provider_id=provider.id,
        kind=UsageEventKind.ASR_AUDIO,
        source="asr_transcript",
        duration_seconds=result.duration_seconds or probed_duration_seconds,
    )
    db.commit()
    db.refresh(transcript)
    return to_read(transcript)


@router.delete("/transcripts/{transcript_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transcript(transcript: AsrTranscript = Depends(get_asr_transcript_or_404), db: Session = Depends(get_db)) -> None:
    path = Path(settings.asr_upload_dir) / transcript.audio_storage_path if transcript.audio_storage_path else None
    db.delete(transcript)
    db.commit()
    delete_audio_file(path)
