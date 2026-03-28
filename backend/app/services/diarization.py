from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()


class DiarizationServiceError(RuntimeError):
    pass


class DiarizationRuntimeUnavailableError(DiarizationServiceError):
    pass


@dataclass(slots=True)
class SpeakerTurn:
    speaker_label: str
    start_seconds: float
    end_seconds: float


class DiarizationService:
    def __init__(self) -> None:
        self._model = None
        self._resolved_model_name: str | None = None

    def ensure_model_ready(self) -> None:
        if not settings.asr_meeting_diarization_enabled:
            raise DiarizationRuntimeUnavailableError(
                "Meeting speaker diarization is disabled. Set ASR_MEETING_DIARIZATION_ENABLED=true to enable it."
            )
        self._get_model()

    def model_name(self) -> str:
        return self._resolved_model_name or settings.asr_meeting_diarizer_model

    def diarize_file(self, file_path: Path, *, max_speakers: int | None = None) -> list[SpeakerTurn]:
        diarizer = self._get_model()
        requested_speakers = max(2, min(max_speakers or settings.asr_meeting_diarization_default_max_speakers, 8))
        try:
            diarized = diarizer.diarize(
                audio=str(file_path),
                batch_size=1,
                num_workers=0,
                verbose=False,
                max_num_of_spks=requested_speakers,
            )
        except Exception as exc:
            raise DiarizationServiceError("Speaker diarization failed for this audio file.") from exc

        return self._parse_turns(diarized)

    def _get_model(self):
        desired_name = settings.asr_meeting_diarizer_model.strip()
        if self._model is not None and self._resolved_model_name == desired_name:
            return self._model

        try:
            import torch
            from nemo.collections.asr.models import SortformerEncLabelModel
        except Exception as exc:
            raise DiarizationRuntimeUnavailableError(
                "Speaker diarization requires NeMo. Install the backend dependency bundle with nemo_toolkit[asr]."
            ) from exc

        target_device = settings.asr_meeting_diarization_device.strip().lower()
        if target_device == "cuda" and not torch.cuda.is_available():
            raise DiarizationRuntimeUnavailableError(
                "CUDA diarization is configured but no GPU is visible for the NeMo diarizer runtime."
            )
        if target_device not in {"cpu", "cuda"}:
            raise DiarizationRuntimeUnavailableError(
                "ASR_MEETING_DIARIZATION_DEVICE must be either cpu or cuda."
            )

        try:
            model = SortformerEncLabelModel.from_pretrained(desired_name)
            model = model.to(target_device)
            model.eval()
        except Exception as exc:
            raise DiarizationRuntimeUnavailableError(
                "The NeMo speaker diarization model could not be loaded. Check the model name and runtime dependencies."
            ) from exc

        self._model = model
        self._resolved_model_name = desired_name
        return self._model

    @staticmethod
    def _parse_turns(payload: object) -> list[SpeakerTurn]:
        lines: list[str] = []
        if isinstance(payload, (list, tuple)):
            if payload and isinstance(payload[0], (list, tuple)):
                lines = [str(item).strip() for item in payload[0] if str(item).strip()]
            else:
                lines = [str(item).strip() for item in payload if str(item).strip()]

        turns: list[SpeakerTurn] = []
        for line in lines:
            parts = line.split(maxsplit=2)
            if len(parts) != 3:
                continue
            try:
                start_seconds = round(float(parts[0]), 3)
                end_seconds = round(float(parts[1]), 3)
            except ValueError:
                continue
            if end_seconds <= start_seconds:
                continue
            turns.append(
                SpeakerTurn(
                    speaker_label=parts[2].strip(),
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                )
            )
        return turns


service = DiarizationService()
