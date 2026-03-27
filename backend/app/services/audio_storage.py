import mimetypes
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status


ALLOWED_AUDIO_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".opus", ".wav", ".webm"}

AUDIO_MIME_BY_EXTENSION = {
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
}


@dataclass(slots=True)
class StoredAudio:
    original_filename: str
    mime_type: str | None
    file_size_bytes: int
    storage_path: Path
    relative_storage_path: str


def ensure_audio_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported audio format.")
    return suffix


def resolve_audio_mime_type(filename: str, content_type: str | None) -> str | None:
    normalized = (content_type or "").strip().lower()
    if normalized and normalized != "application/octet-stream":
        return normalized

    suffix = Path(filename).suffix.lower()
    if suffix in AUDIO_MIME_BY_EXTENSION:
        return AUDIO_MIME_BY_EXTENSION[suffix]

    guessed, _ = mimetypes.guess_type(filename)
    return guessed


def sanitize_audio_stem(value: str | None) -> str:
    candidate = (value or "").strip() or "audio"
    safe_value = re.sub(r"[^A-Za-z0-9._-]+", "_", candidate).strip("._-")
    return (safe_value or "audio")[:200]


def save_upload_file(
    upload: UploadFile,
    *,
    storage_root: Path,
    max_bytes: int,
    prefix: str,
) -> StoredAudio:
    original_filename = Path(upload.filename or "audio").name[:255]
    suffix = ensure_audio_extension(original_filename)
    storage_root.mkdir(parents=True, exist_ok=True)
    storage_name = f"{prefix}-{uuid4().hex}{suffix}"
    storage_path = storage_root / storage_name

    file_size_bytes = 0
    try:
        with storage_path.open("wb") as handle:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                file_size_bytes += len(chunk)
                if file_size_bytes > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Audio file exceeds the {max_bytes // (1024 * 1024)} MB limit.",
                    )
                handle.write(chunk)
    except Exception:
        storage_path.unlink(missing_ok=True)
        raise
    finally:
        upload.file.close()

    if file_size_bytes == 0:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file.")

    return StoredAudio(
        original_filename=original_filename,
        mime_type=resolve_audio_mime_type(original_filename, upload.content_type),
        file_size_bytes=file_size_bytes,
        storage_path=storage_path,
        relative_storage_path=storage_name,
    )


def transcode_audio_to_mp3(
    source_audio: StoredAudio,
    *,
    storage_root: Path,
    prefix: str,
    target_stem: str | None = None,
) -> StoredAudio:
    storage_root.mkdir(parents=True, exist_ok=True)
    safe_stem = sanitize_audio_stem(target_stem or Path(source_audio.original_filename).stem)
    storage_name = f"{prefix}-{uuid4().hex}.mp3"
    storage_path = storage_root / storage_name

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_audio.storage_path),
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        str(storage_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not storage_path.exists():
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Audio could not be converted to mp3.")

    file_size_bytes = storage_path.stat().st_size
    if file_size_bytes <= 0:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Converted mp3 audio is empty.")

    delete_audio_file(source_audio.storage_path)
    return StoredAudio(
        original_filename=f"{safe_stem}.mp3",
        mime_type=AUDIO_MIME_BY_EXTENSION[".mp3"],
        file_size_bytes=file_size_bytes,
        storage_path=storage_path,
        relative_storage_path=storage_name,
    )


def probe_audio_duration_seconds(source_path: Path) -> float:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(source_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Audio metadata could not be read.")

    raw_value = (result.stdout or "").strip()
    try:
        duration = float(raw_value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Audio duration could not be read.") from exc

    if duration <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Audio duration is invalid.")
    return duration


def delete_audio_file(path: Path | None) -> None:
    if path is not None:
        path.unlink(missing_ok=True)
