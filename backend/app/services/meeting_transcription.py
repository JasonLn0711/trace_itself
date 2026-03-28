from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.services.asr import AsrSegment, AsrTranscriptionResult, service as asr_service
from app.services.diarization import SpeakerTurn, service as diarization_service

settings = get_settings()


@dataclass(slots=True)
class MeetingTranscriptEntry:
    id: str
    speaker_label: str | None
    started_at_seconds: float | None
    ended_at_seconds: float | None
    text: str


@dataclass(slots=True)
class MeetingTranscriptionResult:
    transcript_text: str
    language: str | None
    duration_seconds: float | None
    asr_model_name: str
    transcript_entries: list[MeetingTranscriptEntry]
    speaker_diarization_enabled: bool
    speaker_count: int | None
    speaker_diarization_model_name: str | None

    def llm_transcript_text(self) -> str:
        if not self.transcript_entries:
            return self.transcript_text

        lines: list[str] = []
        for entry in self.transcript_entries:
            timestamp = format_seconds_label(entry.started_at_seconds)
            speaker = entry.speaker_label or "Speaker"
            label = f"{speaker} [{timestamp}]" if timestamp else speaker
            lines.append(f"{label}: {entry.text}")
        return "\n".join(lines).strip() or self.transcript_text


class MeetingTranscriptionService:
    def transcribe(
        self,
        file_path: Path,
        *,
        language: str | None,
        model_name: str,
        enable_speaker_diarization: bool,
        max_speaker_count: int | None,
    ) -> MeetingTranscriptionResult:
        transcription = asr_service.transcribe_file(
            file_path,
            language=language,
            model_name=model_name,
            word_timestamps=False,
        )
        if not enable_speaker_diarization:
            return MeetingTranscriptionResult(
                transcript_text=transcription.text,
                language=transcription.language,
                duration_seconds=transcription.duration_seconds,
                asr_model_name=transcription.model_name,
                transcript_entries=[],
                speaker_diarization_enabled=False,
                speaker_count=None,
                speaker_diarization_model_name=None,
            )

        turns = diarization_service.diarize_file(file_path, max_speakers=max_speaker_count)
        entries = build_meeting_entries(transcription, turns)
        detected_speakers = sorted(
            {entry.speaker_label for entry in entries if entry.speaker_label}
            or {normalize_speaker_label(turn.speaker_label) for turn in turns if turn.speaker_label}
        )
        return MeetingTranscriptionResult(
            transcript_text=transcription.text,
            language=transcription.language,
            duration_seconds=transcription.duration_seconds,
            asr_model_name=transcription.model_name,
            transcript_entries=entries,
            speaker_diarization_enabled=True,
            speaker_count=len(detected_speakers) or None,
            speaker_diarization_model_name=diarization_service.model_name(),
        )


def build_meeting_entries(
    transcription: AsrTranscriptionResult,
    speaker_turns: list[SpeakerTurn],
) -> list[MeetingTranscriptEntry]:
    timed_units = _build_timed_units(transcription.segments)
    if not timed_units:
        return []

    entries: list[MeetingTranscriptEntry] = []
    current: MeetingTranscriptEntry | None = None
    previous_speaker: str | None = None

    for unit_text, start_seconds, end_seconds in timed_units:
        speaker_label = resolve_speaker_label(
            start_seconds=start_seconds,
            end_seconds=end_seconds,
            speaker_turns=speaker_turns,
            fallback_label=previous_speaker,
        )

        if current and current.speaker_label == speaker_label and _should_merge_entry(current, start_seconds):
            current.ended_at_seconds = end_seconds or current.ended_at_seconds
            current.text = merge_unit_text(current.text, unit_text)
            continue

        if current:
            entries.append(normalize_entry(current))

        current = MeetingTranscriptEntry(
            id=uuid4().hex,
            speaker_label=speaker_label,
            started_at_seconds=start_seconds,
            ended_at_seconds=end_seconds,
            text=unit_text,
        )
        previous_speaker = speaker_label

    if current:
        entries.append(normalize_entry(current))

    return reindex_speaker_labels(smooth_short_speaker_turns([entry for entry in entries if entry.text]))


def _build_timed_units(segments: list[AsrSegment]) -> list[tuple[str, float | None, float | None]]:
    return [
        ((segment.text or "").strip(), segment.start_seconds, segment.end_seconds)
        for segment in segments
        if (segment.text or "").strip()
    ]


def resolve_speaker_label(
    *,
    start_seconds: float | None,
    end_seconds: float | None,
    speaker_turns: list[SpeakerTurn],
    fallback_label: str | None,
) -> str | None:
    if not speaker_turns:
        return fallback_label

    start_value = start_seconds if start_seconds is not None else end_seconds
    end_value = end_seconds if end_seconds is not None else start_seconds
    if start_value is None or end_value is None:
        return fallback_label
    if end_value < start_value:
        start_value, end_value = end_value, start_value

    best_label: str | None = None
    best_overlap = 0.0
    midpoint = (start_value + end_value) / 2
    nearest_turn: SpeakerTurn | None = None
    nearest_distance: float | None = None

    for turn in speaker_turns:
        overlap = max(0.0, min(end_value, turn.end_seconds) - max(start_value, turn.start_seconds))
        if overlap > best_overlap:
            best_overlap = overlap
            best_label = turn.speaker_label

        if midpoint < turn.start_seconds:
            distance = turn.start_seconds - midpoint
        elif midpoint > turn.end_seconds:
            distance = midpoint - turn.end_seconds
        else:
            distance = 0.0
        if nearest_distance is None or distance < nearest_distance:
            nearest_distance = distance
            nearest_turn = turn

    if best_label and best_overlap >= min_required_overlap_seconds(start_value, end_value):
        return best_label
    if nearest_turn and nearest_distance is not None and nearest_distance <= settings.asr_meeting_diarization_gap_tolerance_seconds:
        return nearest_turn.speaker_label
    return fallback_label


def _should_merge_entry(current: MeetingTranscriptEntry, next_start_seconds: float | None) -> bool:
    if current.ended_at_seconds is None or next_start_seconds is None:
        return True
    return (next_start_seconds - current.ended_at_seconds) <= settings.asr_meeting_diarization_merge_gap_seconds


def smooth_short_speaker_turns(entries: list[MeetingTranscriptEntry]) -> list[MeetingTranscriptEntry]:
    smoothed = [normalize_entry(entry) for entry in entries if entry.text]
    if len(smoothed) < 3:
        return smoothed

    while True:
        replaced = False
        for index in range(1, len(smoothed) - 1):
            previous_entry = smoothed[index - 1]
            current_entry = smoothed[index]
            next_entry = smoothed[index + 1]
            if not should_smooth_short_turn(previous_entry, current_entry, next_entry):
                continue

            merged = merge_entries(previous_entry, current_entry, speaker_label=previous_entry.speaker_label)
            merged = merge_entries(merged, next_entry, speaker_label=previous_entry.speaker_label)
            smoothed = [
                *smoothed[: index - 1],
                normalize_entry(merged),
                *smoothed[index + 2 :],
            ]
            replaced = True
            break
        if not replaced:
            return smoothed


def reindex_speaker_labels(entries: list[MeetingTranscriptEntry]) -> list[MeetingTranscriptEntry]:
    remapped_labels: dict[str, str] = {}
    next_index = 1
    normalized_entries: list[MeetingTranscriptEntry] = []
    for entry in entries:
        normalized_label = normalize_speaker_label(entry.speaker_label)
        if normalized_label:
            normalized_label = remapped_labels.setdefault(normalized_label, f"Speaker {next_index}")
            if normalized_label == f"Speaker {next_index}":
                next_index += 1
        normalized_entries.append(
            MeetingTranscriptEntry(
                id=entry.id,
                speaker_label=normalized_label,
                started_at_seconds=entry.started_at_seconds,
                ended_at_seconds=entry.ended_at_seconds,
                text=entry.text,
            )
        )
    return normalized_entries


def should_smooth_short_turn(
    previous_entry: MeetingTranscriptEntry,
    current_entry: MeetingTranscriptEntry,
    next_entry: MeetingTranscriptEntry,
) -> bool:
    if not previous_entry.speaker_label or not current_entry.speaker_label or not next_entry.speaker_label:
        return False
    if previous_entry.speaker_label != next_entry.speaker_label:
        return False
    if current_entry.speaker_label == previous_entry.speaker_label:
        return False
    duration_seconds = entry_duration_seconds(current_entry)
    if duration_seconds is None or duration_seconds > settings.asr_meeting_diarization_short_turn_seconds:
        return False
    if entry_gap_seconds(previous_entry, current_entry) > settings.asr_meeting_diarization_merge_gap_seconds:
        return False
    if entry_gap_seconds(current_entry, next_entry) > settings.asr_meeting_diarization_merge_gap_seconds:
        return False
    return True


def entry_duration_seconds(entry: MeetingTranscriptEntry) -> float | None:
    if entry.started_at_seconds is None or entry.ended_at_seconds is None:
        return None
    return max(0.0, entry.ended_at_seconds - entry.started_at_seconds)


def entry_gap_seconds(left: MeetingTranscriptEntry, right: MeetingTranscriptEntry) -> float:
    if left.ended_at_seconds is None or right.started_at_seconds is None:
        return 0.0
    return max(0.0, right.started_at_seconds - left.ended_at_seconds)


def merge_entries(
    left: MeetingTranscriptEntry,
    right: MeetingTranscriptEntry,
    *,
    speaker_label: str | None,
) -> MeetingTranscriptEntry:
    return MeetingTranscriptEntry(
        id=left.id,
        speaker_label=speaker_label,
        started_at_seconds=left.started_at_seconds,
        ended_at_seconds=right.ended_at_seconds if right.ended_at_seconds is not None else left.ended_at_seconds,
        text=merge_unit_text(left.text, right.text),
    )


def min_required_overlap_seconds(start_seconds: float, end_seconds: float) -> float:
    duration_seconds = max(0.0, end_seconds - start_seconds)
    return min(
        settings.asr_meeting_diarization_min_overlap_seconds,
        max(0.08, duration_seconds * settings.asr_meeting_diarization_min_overlap_ratio),
    )


def merge_unit_text(existing: str, addition: str) -> str:
    if not addition.strip():
        return existing.strip()
    if not existing:
        return addition
    stripped_addition = addition.lstrip()
    if addition[:1].isspace() or stripped_addition[:1] in {".", ",", "!", "?", ";", ":", "%", ")", "]", "}"}:
        return f"{existing}{addition}"
    return f"{existing.rstrip()} {stripped_addition}"


def normalize_entry(entry: MeetingTranscriptEntry) -> MeetingTranscriptEntry:
    compact_text = " ".join(entry.text.split()).strip()
    return MeetingTranscriptEntry(
        id=entry.id,
        speaker_label=normalize_speaker_label(entry.speaker_label),
        started_at_seconds=round(entry.started_at_seconds, 3) if entry.started_at_seconds is not None else None,
        ended_at_seconds=round(entry.ended_at_seconds, 3) if entry.ended_at_seconds is not None else None,
        text=compact_text,
    )


def normalize_speaker_label(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    raw_lower = raw.lower()
    if raw_lower.startswith("speaker_"):
        suffix = raw.rsplit("_", maxsplit=1)[-1]
        if suffix.isdigit():
            return f"Speaker {int(suffix) + 1}"
    if raw_lower.startswith("speaker ") and raw == raw.lower():
        suffix = raw.split()[-1]
        if suffix.isdigit():
            return f"Speaker {int(suffix) + 1}"
    if raw_lower.startswith("speaker ") and raw[:1].isupper():
        return raw
    return raw.replace("_", " ").title()


def format_seconds_label(value: float | None) -> str:
    if value is None:
        return ""
    whole_seconds = max(0, int(round(value)))
    minutes, seconds = divmod(whole_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


service = MeetingTranscriptionService()
