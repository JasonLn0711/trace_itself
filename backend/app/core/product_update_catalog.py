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
)
