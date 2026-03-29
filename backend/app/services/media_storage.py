import mimetypes
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status


ALLOWED_AUDIO_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".opus", ".wav", ".webm"}
ALLOWED_IMAGE_EXTENSIONS = {".heic", ".heif", ".jpeg", ".jpg", ".png", ".webp"}

MIME_BY_EXTENSION = {
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".png": "image/png",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".webp": "image/webp",
}


@dataclass(slots=True)
class StoredUpload:
    original_filename: str
    mime_type: str | None
    file_size_bytes: int
    storage_path: Path
    relative_storage_path: str


def _resolve_mime_type(filename: str, content_type: str | None) -> str | None:
    normalized = (content_type or "").strip().lower()
    if normalized and normalized != "application/octet-stream":
        return normalized

    suffix = Path(filename).suffix.lower()
    if suffix in MIME_BY_EXTENSION:
        return MIME_BY_EXTENSION[suffix]

    guessed, _ = mimetypes.guess_type(filename)
    return guessed


def save_media_upload(
    upload: UploadFile,
    *,
    storage_root: Path,
    max_bytes: int,
    prefix: str,
    allowed_extensions: set[str],
    kind_label: str,
) -> StoredUpload:
    original_filename = Path(upload.filename or kind_label).name[:255]
    suffix = Path(original_filename).suffix.lower()
    if suffix not in allowed_extensions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported {kind_label} format.")

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
                        detail=f"{kind_label.capitalize()} file exceeds the {max_bytes // (1024 * 1024)} MB limit.",
                    )
                handle.write(chunk)
    except Exception:
        storage_path.unlink(missing_ok=True)
        raise
    finally:
        upload.file.close()

    if file_size_bytes == 0:
        storage_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Empty {kind_label} file.")

    return StoredUpload(
        original_filename=original_filename,
        mime_type=_resolve_mime_type(original_filename, upload.content_type),
        file_size_bytes=file_size_bytes,
        storage_path=storage_path,
        relative_storage_path=storage_name,
    )


def delete_media_file(path: Path | None) -> None:
    if path is not None:
        path.unlink(missing_ok=True)
