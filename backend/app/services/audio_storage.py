import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status


ALLOWED_AUDIO_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".mp4", ".ogg", ".wav", ".webm"}


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
        mime_type=upload.content_type,
        file_size_bytes=file_size_bytes,
        storage_path=storage_path,
        relative_storage_path=storage_name,
    )


def convert_audio_to_wav(source_path: Path) -> Path:
    temp_dir = Path(tempfile.mkdtemp(prefix="trace_itself_audio_"))
    output_path = temp_dir / f"{source_path.stem}.wav"
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise RuntimeError(result.stderr.strip() or "Audio conversion failed.")
    return output_path


def delete_audio_file(path: Path | None) -> None:
    if path is not None:
        path.unlink(missing_ok=True)
