import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import (
    get_current_user,
    get_db,
    get_meeting_record_or_404,
    require_asr_access,
    require_llm_access,
    resolve_ai_provider,
)
from app.core.enums import AIProviderKind
from app.core.config import get_settings
from app.models.meeting_record import MeetingRecord
from app.models.project import Project
from app.models.user import User
from app.schemas.meeting import MeetingRecordRead, MeetingRecordSummaryRead
from app.services.asr import AsrRuntimeUnavailableError, AsrServiceError, service as asr_service
from app.services.audio_storage import delete_audio_file, probe_audio_duration_seconds, save_upload_file
from app.services.diarization import (
    DiarizationRuntimeUnavailableError,
    DiarizationServiceError,
    service as diarization_service,
)
from app.services.meeting_ai import MeetingAiError, generate_meeting_artifacts
from app.services.meeting_transcription import MeetingTranscriptEntry, service as meeting_transcription_service
from app.services.usage_policy import ensure_audio_duration_allowed, ensure_llm_budget_available, get_or_create_usage_policy, record_usage_event
from app.core.enums import UsageEventKind

router = APIRouter(
    prefix="/meetings",
    tags=["meetings"],
    dependencies=[Depends(require_asr_access), Depends(require_llm_access)],
)
settings = get_settings()


def meeting_title_from_filename(title: str | None, filename: str) -> str:
    candidate = (title or "").strip()
    if candidate:
        return candidate[:200]
    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    return (stem or "Meeting")[:200]


def to_summary(meeting: MeetingRecord) -> MeetingRecordSummaryRead:
    return MeetingRecordSummaryRead(
        id=meeting.id,
        project_id=meeting.project_id,
        project_name=meeting.project_name,
        title=meeting.title,
        audio_filename=meeting.audio_filename,
        audio_mime_type=meeting.audio_mime_type,
        file_size_bytes=meeting.file_size_bytes,
        language=meeting.language,
        duration_seconds=meeting.duration_seconds,
        summary_text=meeting.summary_text,
        action_items_text=meeting.action_items_text,
        asr_model_name=meeting.asr_model_name,
        speaker_diarization_enabled=bool(meeting.speaker_diarization_enabled),
        speaker_count=meeting.speaker_count,
        llm_model_name=meeting.llm_model_name,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
    )


def to_read(meeting: MeetingRecord) -> MeetingRecordRead:
    return MeetingRecordRead(
        id=meeting.id,
        project_id=meeting.project_id,
        project_name=meeting.project_name,
        title=meeting.title,
        audio_filename=meeting.audio_filename,
        audio_mime_type=meeting.audio_mime_type,
        file_size_bytes=meeting.file_size_bytes,
        language=meeting.language,
        duration_seconds=meeting.duration_seconds,
        transcript_text=meeting.transcript_text,
        transcript_entries=parse_meeting_entries(meeting.transcript_entries_json),
        minutes_text=meeting.minutes_text,
        summary_text=meeting.summary_text,
        action_items_text=meeting.action_items_text,
        asr_model_name=meeting.asr_model_name,
        speaker_diarization_enabled=bool(meeting.speaker_diarization_enabled),
        speaker_count=meeting.speaker_count,
        speaker_diarization_model_name=meeting.speaker_diarization_model_name,
        llm_model_name=meeting.llm_model_name,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
    )


def resolve_project_for_meeting(project_id: int, current_user: User, db: Session) -> Project:
    project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == current_user.id))
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


def serialize_meeting_entries(entries: list[MeetingTranscriptEntry]) -> str | None:
    if not entries:
        return None
    payload = [
        {
            "id": entry.id,
            "speaker_label": entry.speaker_label,
            "started_at_seconds": entry.started_at_seconds,
            "ended_at_seconds": entry.ended_at_seconds,
            "text": entry.text,
        }
        for entry in entries
    ]
    return json.dumps(payload, separators=(",", ":"))


def parse_meeting_entries(value: str | None) -> list[dict[str, object]]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []

    entries: list[dict[str, object]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        entry_id = str(item.get("id", "")).strip()
        text = str(item.get("text", "")).strip()
        if not entry_id or not text:
            continue

        speaker_label = item.get("speaker_label")
        if speaker_label is not None:
            speaker_label = str(speaker_label).strip() or None

        entries.append(
            {
                "id": entry_id,
                "speaker_label": speaker_label,
                "started_at_seconds": parse_optional_seconds(item.get("started_at_seconds")),
                "ended_at_seconds": parse_optional_seconds(item.get("ended_at_seconds")),
                "text": text,
            }
        )
    return entries


def parse_optional_seconds(value: object) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


@router.get("", response_model=list[MeetingRecordSummaryRead])
def list_meetings(
    limit: int = Query(default=25, ge=1, le=100),
    project_id: int | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MeetingRecordSummaryRead]:
    stmt = (
        select(MeetingRecord)
        .options(selectinload(MeetingRecord.project))
        .where(MeetingRecord.user_id == current_user.id)
        .order_by(MeetingRecord.created_at.desc())
        .limit(limit)
    )
    if project_id is not None:
        resolve_project_for_meeting(project_id, current_user, db)
        stmt = stmt.where(MeetingRecord.project_id == project_id)
    return [to_summary(item) for item in db.scalars(stmt).all()]


@router.get("/{meeting_id}", response_model=MeetingRecordRead)
def get_meeting(meeting: MeetingRecord = Depends(get_meeting_record_or_404)) -> MeetingRecordRead:
    return to_read(meeting)


@router.get("/{meeting_id}/audio")
def download_meeting_audio(meeting: MeetingRecord = Depends(get_meeting_record_or_404)) -> FileResponse:
    path = Path(settings.meeting_upload_dir) / meeting.audio_storage_path
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found.")
    return FileResponse(path, media_type=meeting.audio_mime_type, filename=meeting.audio_filename)


@router.post("", response_model=MeetingRecordRead, status_code=status.HTTP_201_CREATED)
def create_meeting(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    language: str | None = Form(default=None),
    asr_provider_id: int | None = Form(default=None),
    llm_provider_id: int | None = Form(default=None),
    project_id: int | None = Form(default=None),
    speaker_diarization: bool = Form(default=False),
    max_speaker_count: int | None = Form(default=None, ge=2, le=8),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetingRecordRead:
    project = resolve_project_for_meeting(project_id, current_user, db) if project_id is not None else None
    asr_provider = resolve_ai_provider(
        kind=AIProviderKind.ASR,
        provider_id=asr_provider_id,
        current_user=current_user,
        db=db,
    )
    llm_provider = resolve_ai_provider(
        kind=AIProviderKind.LLM,
        provider_id=llm_provider_id,
        current_user=current_user,
        db=db,
    )
    try:
        asr_service.ensure_model_ready(asr_provider.model_name)
        if speaker_diarization:
            diarization_service.ensure_model_ready()
    except AsrRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except DiarizationRuntimeUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    stored_audio = save_upload_file(
        file,
        storage_root=Path(settings.meeting_upload_dir),
        max_bytes=settings.meeting_max_upload_bytes,
        prefix=f"meeting-{current_user.id}",
    )
    try:
        policy = get_or_create_usage_policy(db)
        probed_duration_seconds = probe_audio_duration_seconds(stored_audio.storage_path)
        ensure_audio_duration_allowed(probed_duration_seconds, policy)
        ensure_llm_budget_available(db, current_user.id, policy)
    except HTTPException:
        delete_audio_file(stored_audio.storage_path)
        raise
    normalized_language = (language or "").strip().lower() or None
    if normalized_language == "auto":
        normalized_language = None

    try:
        transcript = meeting_transcription_service.transcribe(
            stored_audio.storage_path,
            language=normalized_language,
            model_name=asr_provider.model_name,
            enable_speaker_diarization=speaker_diarization,
            max_speaker_count=max_speaker_count,
        )
        artifacts = generate_meeting_artifacts(
            transcript_text=transcript.transcript_text,
            title=meeting_title_from_filename(title, stored_audio.original_filename),
            provider=llm_provider,
            structured_transcript_text=transcript.llm_transcript_text() if transcript.speaker_diarization_enabled else None,
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
    except MeetingAiError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    meeting = MeetingRecord(
        user_id=current_user.id,
        project_id=project.id if project else None,
        title=meeting_title_from_filename(title, stored_audio.original_filename),
        audio_filename=stored_audio.original_filename,
        audio_storage_path=stored_audio.relative_storage_path,
        audio_mime_type=stored_audio.mime_type,
        file_size_bytes=stored_audio.file_size_bytes,
        language=transcript.language,
        duration_seconds=transcript.duration_seconds or probed_duration_seconds,
        transcript_text=transcript.transcript_text,
        transcript_entries_json=serialize_meeting_entries(transcript.transcript_entries),
        minutes_text=artifacts.minutes_text,
        summary_text=artifacts.summary_text,
        action_items_text=artifacts.action_items_text,
        asr_model_name=transcript.asr_model_name,
        speaker_diarization_enabled=transcript.speaker_diarization_enabled,
        speaker_count=transcript.speaker_count,
        speaker_diarization_model_name=transcript.speaker_diarization_model_name,
        llm_model_name=artifacts.model_name,
    )
    db.add(meeting)
    record_usage_event(
        db,
        user_id=current_user.id,
        provider_id=asr_provider.id,
        kind=UsageEventKind.ASR_AUDIO,
        source="meeting_record",
        duration_seconds=transcript.duration_seconds or probed_duration_seconds,
    )
    record_usage_event(
        db,
        user_id=current_user.id,
        provider_id=llm_provider.id,
        kind=UsageEventKind.LLM_TEXT,
        source="meeting_record",
    )
    db.commit()
    db.refresh(meeting)
    return to_read(meeting)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting: MeetingRecord = Depends(get_meeting_record_or_404), db: Session = Depends(get_db)) -> None:
    path = Path(settings.meeting_upload_dir) / meeting.audio_storage_path
    db.delete(meeting)
    db.commit()
    delete_audio_file(path)
