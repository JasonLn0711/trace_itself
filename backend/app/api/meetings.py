from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

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
from app.models.user import User
from app.schemas.meeting import MeetingRecordRead, MeetingRecordSummaryRead
from app.services.asr import AsrServiceError, service as asr_service
from app.services.audio_storage import delete_audio_file, save_upload_file
from app.services.meeting_ai import MeetingAiError, generate_meeting_artifacts

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
    return MeetingRecordSummaryRead.model_validate(meeting)


def to_read(meeting: MeetingRecord) -> MeetingRecordRead:
    return MeetingRecordRead.model_validate(meeting)


@router.get("", response_model=list[MeetingRecordSummaryRead])
def list_meetings(
    limit: int = Query(default=25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MeetingRecordSummaryRead]:
    stmt = (
        select(MeetingRecord)
        .where(MeetingRecord.user_id == current_user.id)
        .order_by(MeetingRecord.created_at.desc())
        .limit(limit)
    )
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetingRecordRead:
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
    stored_audio = save_upload_file(
        file,
        storage_root=Path(settings.meeting_upload_dir),
        max_bytes=settings.meeting_max_upload_bytes,
        prefix=f"meeting-{current_user.id}",
    )
    normalized_language = (language or "").strip().lower() or None
    if normalized_language == "auto":
        normalized_language = None

    try:
        transcript = asr_service.transcribe_file(
            stored_audio.storage_path,
            language=normalized_language,
            model_name=asr_provider.model_name,
        )
        artifacts = generate_meeting_artifacts(
            transcript_text=transcript.text,
            title=meeting_title_from_filename(title, stored_audio.original_filename),
            provider=llm_provider,
        )
    except AsrServiceError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except MeetingAiError as exc:
        delete_audio_file(stored_audio.storage_path)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    meeting = MeetingRecord(
        user_id=current_user.id,
        title=meeting_title_from_filename(title, stored_audio.original_filename),
        audio_filename=stored_audio.original_filename,
        audio_storage_path=stored_audio.relative_storage_path,
        audio_mime_type=stored_audio.mime_type,
        file_size_bytes=stored_audio.file_size_bytes,
        language=transcript.language,
        duration_seconds=transcript.duration_seconds,
        transcript_text=transcript.text,
        minutes_text=artifacts.minutes_text,
        summary_text=artifacts.summary_text,
        action_items_text=artifacts.action_items_text,
        asr_model_name=transcript.model_name,
        llm_model_name=artifacts.model_name,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return to_read(meeting)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting: MeetingRecord = Depends(get_meeting_record_or_404), db: Session = Depends(get_db)) -> None:
    path = Path(settings.meeting_upload_dir) / meeting.audio_storage_path
    db.delete(meeting)
    db.commit()
    delete_audio_file(path)
