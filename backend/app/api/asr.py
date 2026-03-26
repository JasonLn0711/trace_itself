from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_asr_transcript_or_404, get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.asr_transcript import AsrTranscript
from app.models.user import User
from app.schemas.asr import AsrTranscriptRead, AsrTranscriptSummary
from app.services.asr import AsrServiceError, service as asr_service

router = APIRouter(prefix="/asr", tags=["asr"])
settings = get_settings()
ALLOWED_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".wav", ".webm"}


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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AsrTranscriptRead:
    original_filename = file.filename or "audio"
    suffix = Path(original_filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported audio format.")

    payload = await file.read()
    await file.close()
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file.")

    max_bytes = settings.asr_max_upload_mb * 1024 * 1024
    if len(payload) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Audio file exceeds the {settings.asr_max_upload_mb} MB limit.",
        )

    target_dir = Path(settings.asr_upload_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{uuid4().hex}{suffix}"
    target_path.write_bytes(payload)

    normalized_language = (language or "").strip().lower() or None
    if normalized_language == "auto":
        normalized_language = None

    try:
        result = asr_service.transcribe_file(target_path, language=normalized_language)
    except AsrServiceError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    finally:
        target_path.unlink(missing_ok=True)

    transcript = AsrTranscript(
        user_id=current_user.id,
        title=normalize_title(title, original_filename),
        original_filename=original_filename[:255],
        language=result.language,
        duration_seconds=result.duration_seconds,
        file_size_bytes=len(payload),
        model_name=result.model_name,
        transcript_text=result.text,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return to_read(transcript)


@router.delete("/transcripts/{transcript_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transcript(transcript: AsrTranscript = Depends(get_asr_transcript_or_404), db: Session = Depends(get_db)) -> None:
    db.delete(transcript)
    db.commit()
