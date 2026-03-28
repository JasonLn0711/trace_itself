from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

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
            with self._prepare_audio_for_diarization(file_path) as prepared_file:
                diarized = diarizer.diarize(
                    audio=str(prepared_file),
                    override_config=self._build_diarize_config(requested_speakers),
                )
        except (DiarizationRuntimeUnavailableError, DiarizationServiceError):
            raise
        except Exception as exc:
            raise DiarizationServiceError("Speaker diarization failed for this audio file.") from exc

        return self._normalize_turns(self._enforce_speaker_cap(self._parse_turns(diarized), requested_speakers))

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
    def _build_diarize_config(max_speakers: int):
        from nemo.collections.asr.parts.mixins.diarization import DiarizeConfig, InternalDiarizeConfig

        config = DiarizeConfig(
            batch_size=1,
            num_workers=0,
            verbose=False,
            max_num_of_spks=max_speakers,
        )
        config._internal = InternalDiarizeConfig(max_num_of_spks=max_speakers)
        return config

    @staticmethod
    @contextmanager
    def _prepare_audio_for_diarization(file_path: Path):
        try:
            with TemporaryDirectory(prefix="meeting-diarization-") as temp_dir:
                prepared_path = Path(temp_dir) / f"{file_path.stem}.wav"
                subprocess.run(
                    [
                        "ffmpeg",
                        "-nostdin",
                        "-y",
                        "-i",
                        str(file_path),
                        "-ac",
                        "1",
                        "-ar",
                        "16000",
                        str(prepared_path),
                    ],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                yield prepared_path
        except FileNotFoundError as exc:
            raise DiarizationRuntimeUnavailableError(
                "Speaker diarization requires ffmpeg in the backend runtime."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise DiarizationServiceError("Speaker diarization failed for this audio file.") from exc

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
        return sorted(turns, key=lambda turn: (turn.start_seconds, turn.end_seconds, turn.speaker_label))

    @staticmethod
    def _enforce_speaker_cap(turns: list[SpeakerTurn], max_speakers: int) -> list[SpeakerTurn]:
        unique_labels = {turn.speaker_label for turn in turns if turn.speaker_label}
        if len(unique_labels) <= max_speakers:
            return turns

        durations: dict[str, float] = {}
        for turn in turns:
            durations[turn.speaker_label] = durations.get(turn.speaker_label, 0.0) + max(
                0.0, turn.end_seconds - turn.start_seconds
            )
        kept_labels = {
            label
            for label, _ in sorted(
                durations.items(),
                key=lambda item: (-item[1], item[0]),
            )[:max_speakers]
        }
        fallback_label = next(iter(sorted(kept_labels))) if kept_labels else None
        if fallback_label is None:
            return turns

        kept_turns = [turn for turn in turns if turn.speaker_label in kept_labels]
        constrained: list[SpeakerTurn] = []
        for turn in turns:
            if turn.speaker_label in kept_labels:
                constrained.append(turn)
                continue
            constrained.append(
                SpeakerTurn(
                    speaker_label=DiarizationService._nearest_kept_label(
                        turn,
                        kept_turns,
                        fallback_label=fallback_label,
                    ),
                    start_seconds=turn.start_seconds,
                    end_seconds=turn.end_seconds,
                )
            )
        return constrained

    @staticmethod
    def _nearest_kept_label(
        target_turn: SpeakerTurn,
        kept_turns: list[SpeakerTurn],
        *,
        fallback_label: str,
    ) -> str:
        best_label = fallback_label
        best_distance: float | None = None
        best_duration = -1.0
        for turn in kept_turns:
            overlap = max(0.0, min(target_turn.end_seconds, turn.end_seconds) - max(target_turn.start_seconds, turn.start_seconds))
            if overlap > 0:
                distance = 0.0
            elif target_turn.end_seconds <= turn.start_seconds:
                distance = turn.start_seconds - target_turn.end_seconds
            else:
                distance = target_turn.start_seconds - turn.end_seconds
            duration = max(0.0, turn.end_seconds - turn.start_seconds)
            if best_distance is None or distance < best_distance or (distance == best_distance and duration > best_duration):
                best_label = turn.speaker_label
                best_distance = distance
                best_duration = duration
        return best_label

    @staticmethod
    def _normalize_turns(turns: list[SpeakerTurn]) -> list[SpeakerTurn]:
        normalized: list[SpeakerTurn] = []
        for turn in sorted(turns, key=lambda item: (item.start_seconds, item.end_seconds, item.speaker_label)):
            if not normalized:
                normalized.append(turn)
                continue
            previous = normalized[-1]
            gap_seconds = max(0.0, turn.start_seconds - previous.end_seconds)
            if previous.speaker_label == turn.speaker_label and gap_seconds <= settings.asr_meeting_diarization_merge_gap_seconds:
                normalized[-1] = SpeakerTurn(
                    speaker_label=previous.speaker_label,
                    start_seconds=previous.start_seconds,
                    end_seconds=max(previous.end_seconds, turn.end_seconds),
                )
                continue
            normalized.append(turn)
        return normalized


service = DiarizationService()
