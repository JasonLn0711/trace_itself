import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_asr_transcript_or_404, get_current_user, require_asr_access, resolve_ai_provider
from app.core.enums import AIProviderKind
from app.core.config import get_settings
from app.db.session import get_db
from app.models.asr_transcript import AsrTranscript
from app.models.user import User
from app.schemas.asr import AsrTranscriptRead, AsrTranscriptSummary, LiveAsrSessionCreate, LiveAsrSessionRead
from app.services.asr import AsrRuntimeUnavailableError, AsrServiceError, service as asr_service
from app.services.audio_storage import delete_audio_file, probe_audio_duration_seconds, save_upload_file, transcode_audio_to_mp3
from app.services.live_asr import LiveAsrSessionError, service as live_asr_service
from app.services.usage_policy import ensure_audio_duration_allowed, get_or_create_usage_policy, record_usage_event
from app.core.enums import UsageEventKind

router = APIRouter(prefix="/asr", tags=["asr"], dependencies=[Depends(require_asr_access)])
settings = get_settings()


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


def build_download_filename(stem: str | None, suffix: str) -> str:
    candidate = (stem or "").strip() or "transcript"
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", candidate).strip("._-")
    return f"{safe_stem or 'transcript'}.{suffix}"


def serialize_live_entries(entries: list[dict[str, str]]) -> str | None:
    if not entries:
        return None
    return json.dumps(entries, separators=(",", ":"))


def parse_transcript_entries(value: str | None) -> list[dict[str, str]]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    normalized: list[dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        entry_id = str(item.get("id", "")).strip()
        recorded_at = str(item.get("recorded_at", "")).strip()
        text = str(item.get("text", "")).strip()
        if not entry_id or not recorded_at or not text:
            continue
        normalized.append(
            {
                "id": entry_id,
                "recorded_at": recorded_at,
                "text": text,
            }
        )
    return normalized


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
        transcript.transcript_text,
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
    try:
        asr_service.ensure_model_ready(provider.model_name)
    except AsrRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    policy = get_or_create_usage_policy(db)
    session = live_asr_service.create_session(
        user_id=current_user.id,
        provider_id=provider.id,
        model_name=provider.model_name,
        language_hint=normalize_language(payload.language),
        max_duration_seconds=policy.max_audio_seconds_per_request,
    )
    return to_live_read(live_asr_service.build_payload(session))


@router.post("/live-sessions/{session_id}/chunks", response_model=LiveAsrSessionRead)
async def ingest_live_chunk(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> LiveAsrSessionRead:
    raw_chunk = await request.body()
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
    file: UploadFile = File(...),
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

    uploaded_audio = save_upload_file(
        file,
        storage_root=Path(settings.asr_upload_dir),
        max_bytes=settings.asr_max_upload_bytes,
        prefix=f"asr-live-raw-{current_user.id}",
    )
    transcript_title = normalize_title(title, uploaded_audio.original_filename)
    try:
        stored_audio = transcode_audio_to_mp3(
            uploaded_audio,
            storage_root=Path(settings.asr_upload_dir),
            prefix=f"asr-live-{current_user.id}",
            target_stem=transcript_title,
        )
    except HTTPException:
        delete_audio_file(uploaded_audio.storage_path)
        raise
    captured_duration_seconds = round(session.total_samples / settings.asr_live_sample_rate, 3)
    try:
        policy = get_or_create_usage_policy(db)
        if captured_duration_seconds <= 0:
            captured_duration_seconds = probe_audio_duration_seconds(stored_audio.storage_path)
        ensure_audio_duration_allowed(captured_duration_seconds, policy)
    except HTTPException:
        delete_audio_file(stored_audio.storage_path)
        raise

    transcript = AsrTranscript(
        user_id=current_user.id,
        title=transcript_title,
        original_filename=stored_audio.original_filename,
        audio_storage_path=stored_audio.relative_storage_path,
        audio_mime_type=stored_audio.mime_type,
        language=session.detected_language or session.language_hint,
        duration_seconds=captured_duration_seconds,
        file_size_bytes=stored_audio.file_size_bytes,
        model_name=session.model_name,
        capture_mode="live",
        transcript_text=session.committed_text,
        transcript_entries_json=serialize_live_entries(live_asr_service.serialize_entries(session.entries)),
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
        asr_service.ensure_model_ready(provider.model_name)
    except AsrRuntimeUnavailableError as exc:
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
        result = asr_service.transcribe_file(
            stored_audio.storage_path,
            language=normalized_language,
            model_name=provider.model_name,
        )
    except AsrServiceError as exc:
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
        model_name=result.model_name,
        capture_mode="file",
        transcript_text=result.text,
        transcript_entries_json=None,
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
