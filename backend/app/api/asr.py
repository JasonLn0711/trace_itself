from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_asr_transcript_or_404, get_current_user, require_asr_access, resolve_ai_provider
from app.core.enums import AIProviderKind
from app.core.config import get_settings
from app.db.session import get_db
from app.models.asr_transcript import AsrTranscript
from app.models.user import User
from app.schemas.asr import AsrTranscriptRead, AsrTranscriptSummary
from app.services.asr import AsrServiceError, service as asr_service
from app.services.audio_storage import delete_audio_file, save_upload_file

router = APIRouter(prefix="/asr", tags=["asr"], dependencies=[Depends(require_asr_access)])
settings = get_settings()


def build_excerpt(value: str, max_length: int = 180) -> str:
    compact = " ".join(value.split()).strip()
    if len(compact) <= max_length:
        return compact
    return f"{compact[: max_length - 1].rstrip()}…"


def to_summary(transcript: AsrTranscript) -> AsrTranscriptSummary:
    return AsrTranscriptSummary(
        id=transcript.id,
        title=transcript.title,
        original_filename=transcript.original_filename,
        audio_mime_type=transcript.audio_mime_type,
        language=transcript.language,
        duration_seconds=transcript.duration_seconds,
        file_size_bytes=transcript.file_size_bytes,
        model_name=transcript.model_name,
        excerpt=build_excerpt(transcript.transcript_text),
        created_at=transcript.created_at,
        updated_at=transcript.updated_at,
    )


def to_read(transcript: AsrTranscript) -> AsrTranscriptRead:
    return AsrTranscriptRead.model_validate(transcript)


def normalize_title(raw_title: str | None, original_filename: str) -> str:
    candidate = (raw_title or "").strip()
    if candidate:
        return candidate[:200]
    stem = Path(original_filename).stem.replace("_", " ").replace("-", " ").strip()
    return (stem or "Transcript")[:200]


@router.get("/transcripts/{transcript_id}/audio")
def download_audio(transcript: AsrTranscript = Depends(get_asr_transcript_or_404)) -> FileResponse:
    if not transcript.audio_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found.")
    path = Path(settings.asr_upload_dir) / transcript.audio_storage_path
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found.")
    return FileResponse(path, media_type=transcript.audio_mime_type, filename=transcript.original_filename)


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
    stored_audio = save_upload_file(
        file,
        storage_root=Path(settings.asr_upload_dir),
        max_bytes=settings.asr_max_upload_bytes,
        prefix=f"asr-{current_user.id}",
    )

    normalized_language = (language or "").strip().lower() or None
    if normalized_language == "auto":
        normalized_language = None

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
        duration_seconds=result.duration_seconds,
        file_size_bytes=stored_audio.file_size_bytes,
        model_name=result.model_name,
        transcript_text=result.text,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return to_read(transcript)


@router.delete("/transcripts/{transcript_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transcript(transcript: AsrTranscript = Depends(get_asr_transcript_or_404), db: Session = Depends(get_db)) -> None:
    path = Path(settings.asr_upload_dir) / transcript.audio_storage_path if transcript.audio_storage_path else None
    db.delete(transcript)
    db.commit()
    delete_audio_file(path)
