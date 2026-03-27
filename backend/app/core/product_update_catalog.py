from dataclasses import dataclass
from datetime import datetime

from app.core.enums import ProductUpdateType


@dataclass(frozen=True, slots=True)
class ProductUpdateCatalogEntry:
    entry_key: str
    version_tag: str
    title: str
    summary: str
    details: str | None
    area: str
    change_type: ProductUpdateType
    changed_at: datetime
    is_pinned: bool = False


PRODUCT_UPDATE_CATALOG: tuple[ProductUpdateCatalogEntry, ...] = (
    ProductUpdateCatalogEntry(
        entry_key="nextjs-runtime",
        version_tag="v1.0.48",
        title="Next.js app runtime",
        summary="The frontend now runs on Next.js App Router with the same private session flow.",
        details=(
            "We replaced the old SPA shell with Next.js routes, protected layouts, "
            "and a same-origin API proxy so the product is easier to evolve without "
            "changing the deployment model."
        ),
        area="frontend",
        change_type=ProductUpdateType.BUILD,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="shared-accounts",
        version_tag="v1.0.49",
        title="Shared account system",
        summary="Multiple users can sign in with isolated data and admin-managed access.",
        details=(
            "This added user management, account roles, password resets, "
            "and temporary lockouts after repeated failed login attempts."
        ),
        area="users",
        change_type=ProductUpdateType.SECURITY,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
    ),
    ProductUpdateCatalogEntry(
        entry_key="dashboard-refresh",
        version_tag="v1.0.50",
        title="Progress dashboard refresh",
        summary="The dashboard now uses clearer dark-mode visuals, progress bars, and tighter task focus.",
        details=(
            "We simplified page copy, reduced visual noise, and kept the main questions visible: "
            "what is active, what is overdue, and what to do next."
        ),
        area="dashboard",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
    ),
    ProductUpdateCatalogEntry(
        entry_key="breeze-asr-workspace",
        version_tag="v1.0.51",
        title="Private ASR workspace",
        summary="Users can record or upload audio and save transcripts inside the app.",
        details=(
            "The ASR page now supports local recording, compact audio uploads, "
            "saved playback, and per-user transcript history powered by Breeze ASR."
        ),
        area="asr",
        change_type=ProductUpdateType.BUILD,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
    ),
    ProductUpdateCatalogEntry(
        entry_key="meeting-notes",
        version_tag="v1.0.52",
        title="Meeting notes workflow",
        summary="Meetings can now save transcript, minutes, summary, and action items.",
        details=(
            "The Meetings page runs local ASR first, then generates concise notes and to-do lists "
            "when a Gemini API key is configured."
        ),
        area="meetings",
        change_type=ProductUpdateType.BUILD,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
    ),
    ProductUpdateCatalogEntry(
        entry_key="updates-read-only",
        version_tag="v1.0.53",
        title="Read-only updates feed",
        summary="The Updates page now acts as a release log instead of editable app data.",
        details=(
            "Users can read what changed, but the page no longer allows create, edit, or delete actions."
        ),
        area="updates",
        change_type=ProductUpdateType.FIX,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
    ),
    ProductUpdateCatalogEntry(
        entry_key="versioned-release-log",
        version_tag="v1.0.54",
        title="Versioned release log",
        summary="Each shipped update can now show a release version and date in the updates feed.",
        details=(
            "The update log is now source-controlled so future product changes can be recorded "
            "with version labels such as v1.0.53."
        ),
        area="updates",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="control-plane-access",
        version_tag="v1.0.55",
        title="Control panel and feature access",
        summary="Admins can now manage access groups, provider secrets, and feature access from one place.",
        details=(
            "The new Control page stores ASR and LLM provider settings, assigns users to feature groups, "
            "and lets each page show only the tools a user is allowed to use."
        ),
        area="admin",
        change_type=ProductUpdateType.BUILD,
        changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="cost-policy-guardrails",
        version_tag="v1.0.56",
        title="API budget guardrails",
        summary="Admins can now cap text AI runs and max audio length to protect the wallet.",
        details=(
            "The Control page now includes a policy tab, meetings respect a rolling 24-hour LLM budget, "
            "and ASR or meeting uploads are rejected when a file exceeds the configured audio cap."
        ),
        area="admin",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="faster-whisper-breeze",
        version_tag="v1.0.57",
        title="Faster Whisper ASR runtime",
        summary="The local ASR engine now runs the Breeze ASR 25 CTranslate2 model through faster-whisper.",
        details=(
            "We replaced the heavier Transformers runtime with faster-whisper and switched the default local model "
            "to SoybeanMilk/faster-whisper-Breeze-ASR-25 for a cleaner self-hosted transcription path."
        ),
        area="asr",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="live-asr-streaming",
        version_tag="v1.0.58",
        title="Live streaming ASR",
        summary="The ASR page now supports real-time transcript updates with noise-aware live capture.",
        details=(
            "Live ASR now streams normalized mic audio in rolling chunks, uses faster-whisper with Silero VAD-backed "
            "speech gating, and auto-saves a compact recording with the finished transcript."
        ),
        area="asr",
        change_type=ProductUpdateType.BUILD,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="docs-mermaid-maps",
        version_tag="v1.0.59",
        title="Architecture diagrams in docs",
        summary="The repo docs now include Mermaid diagrams for structure, workflow, deployment, and SOPs.",
        details=(
            "README, deployment, Tailscale, and frontend docs now show visual maps for the system layout, "
            "update flow, private access path, and runtime structure to make onboarding and operations easier."
        ),
        area="docs",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=False,
    ),
    ProductUpdateCatalogEntry(
        entry_key="asr-upload-hardening",
        version_tag="v1.0.60",
        title="ASR upload hardening",
        summary="Remote ASR uploads now accept a wider set of audio files more safely.",
        details=(
            "The backend now recognizes .opus files, falls back to MIME type inference when browsers or proxies send "
            "generic upload metadata, and keeps the live and saved ASR paths stable for remote clients."
        ),
        area="asr",
        change_type=ProductUpdateType.FIX,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=False,
    ),
    ProductUpdateCatalogEntry(
        entry_key="cuda-asr-runtime",
        version_tag="v1.0.61",
        title="CUDA Breeze ASR runtime",
        summary="The local Breeze ASR path is now wired for NVIDIA CUDA instead of CPU-only inference.",
        details=(
            "The backend image now includes the CUDA libraries required by faster-whisper, the repo ships a "
            "docker-compose.cuda.yml GPU overlay, and ASR endpoints return a clear service error if Docker "
            "cannot yet reach the NVIDIA runtime."
        ),
        area="asr",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="idle-session-timeout",
        version_tag="v1.0.62",
        title="Idle session timeout",
        summary="Accounts now sign out after 5 minutes of inactivity.",
        details=(
            "The frontend now tracks page activity, keeps the session alive while uploads or recordings are actively "
            "running, and returns the user to login with a short timeout message after 5 idle minutes."
        ),
        area="security",
        change_type=ProductUpdateType.SECURITY,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="idle-timeout-countdown",
        version_tag="v1.0.63",
        title="Visible timeout countdown",
        summary="The sidebar now shows a live session timeout clock.",
        details=(
            "Users can now see the remaining auto sign-out time at a glance, and the countdown pauses cleanly "
            "while recordings or active page operations are keeping the session alive."
        ),
        area="security",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="merged-audio-workspace",
        version_tag="v1.0.64",
        title="Unified audio workspace",
        summary="ASR now lives inside the Meetings page so transcript and notes start from one simpler flow.",
        details=(
            "The separate ASR navigation has been folded into one Audio workspace with a compact mode switch, "
            "shared provider setup, live transcript support, and a shorter path to either transcript-only or "
            "meeting-note output."
        ),
        area="frontend",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="meeting-language-preset-list",
        version_tag="v1.0.65",
        title="Meeting language preset list",
        summary="The audio page now uses a short language picker instead of free text.",
        details=(
            "Users can now choose from auto, zh-tw, jp, kr, and en in the transcript and meeting flows, "
            "while the app maps those choices to ASR-safe language codes behind the scenes."
        ),
        area="frontend",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=False,
    ),
    ProductUpdateCatalogEntry(
        entry_key="live-asr-timestamped-lines",
        version_tag="v1.0.66",
        title="Timestamped live transcript lines",
        summary="Live ASR now keeps each timestamped utterance in a running on-screen transcript log.",
        details=(
            "The live transcription view now preserves each recognized segment instead of replacing one preview block, "
            "shows a timestamp ahead of each line, and keeps the newest line at the top while the session is active."
        ),
        area="asr",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
    ProductUpdateCatalogEntry(
        entry_key="cuda-asr-verification-helper",
        version_tag="v1.0.67",
        title="CUDA ASR verification helper",
        summary="The repo now includes a one-step script to verify GPU ASR on the lab machine.",
        details=(
            "The new helper checks host GPU visibility, Docker GPU access, the backend CTranslate2 CUDA runtime, "
            "and a short Breeze ASR transcription probe so GPU bring-up on the RTX 5080 is easier to confirm."
        ),
        area="asr",
        change_type=ProductUpdateType.UPDATE,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=False,
    ),
    ProductUpdateCatalogEntry(
        entry_key="cuda-default-compose-startup",
        version_tag="v1.0.68",
        title="Default Docker startup now keeps CUDA ASR attached",
        summary="The standard docker compose startup path now requests the NVIDIA GPU for the backend.",
        details=(
            "The main docker-compose file now carries the backend GPU request directly, so the usual "
            "docker compose up --build -d command keeps Breeze ASR on the RTX 5080 without requiring a separate overlay command."
        ),
        area="asr",
        change_type=ProductUpdateType.FIX,
        changed_at=datetime.fromisoformat("2026-03-27T00:00:00+00:00"),
        is_pinned=True,
    ),
)
