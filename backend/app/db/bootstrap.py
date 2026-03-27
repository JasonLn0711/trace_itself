from sqlalchemy import select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.product_update_catalog import PRODUCT_UPDATE_CATALOG
from app.core.enums import AIProviderDriver, AIProviderKind, UserRole
from app.models.access_group import AccessGroup
from app.models.ai_provider import AIProvider
from app.models.product_update import ProductUpdate
from app.models.user import User
from app.models.usage_policy import UsagePolicy
from app.services.secrets import encrypt_secret, make_secret_hint
from app.services.security import hash_password, normalize_username

settings = get_settings()


def apply_schema_upgrades(connection) -> None:
    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'product_update_type'
                ) THEN
                    CREATE TYPE product_update_type AS ENUM ('build', 'fix', 'update', 'security');
                END IF;
            END $$;
            """
        )
    )
    connection.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE milestones ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS access_group_id INTEGER"))
    connection.execute(text("ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_log_date_key"))
    connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS max_concurrent_sessions INTEGER"))
    connection.execute(text("ALTER TABLE users ALTER COLUMN max_concurrent_sessions SET DEFAULT 2"))
    connection.execute(text("UPDATE users SET max_concurrent_sessions = 2 WHERE max_concurrent_sessions IS NULL OR max_concurrent_sessions < 1"))
    connection.execute(text("ALTER TABLE asr_transcripts ADD COLUMN IF NOT EXISTS audio_storage_path VARCHAR(255)"))
    connection.execute(text("ALTER TABLE asr_transcripts ADD COLUMN IF NOT EXISTS audio_mime_type VARCHAR(120)"))
    connection.execute(text("ALTER TABLE asr_transcripts ADD COLUMN IF NOT EXISTS capture_mode VARCHAR(32)"))
    connection.execute(text("ALTER TABLE asr_transcripts ADD COLUMN IF NOT EXISTS transcript_entries_json TEXT"))
    connection.execute(text("ALTER TABLE meeting_records ADD COLUMN IF NOT EXISTS project_id INTEGER"))
    connection.execute(text("UPDATE asr_transcripts SET capture_mode = 'file' WHERE capture_mode IS NULL"))
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS user_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                session_token VARCHAR(64) NOT NULL,
                user_agent VARCHAR(255) NULL,
                ip_address VARCHAR(64) NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS asr_transcripts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(200) NOT NULL,
                original_filename VARCHAR(255) NOT NULL,
                audio_storage_path VARCHAR(255) NULL,
                audio_mime_type VARCHAR(120) NULL,
                language VARCHAR(32) NULL,
                duration_seconds DOUBLE PRECISION NULL,
                file_size_bytes BIGINT NOT NULL,
                model_name VARCHAR(120) NOT NULL,
                capture_mode VARCHAR(32) NOT NULL DEFAULT 'file',
                transcript_text TEXT NOT NULL,
                transcript_entries_json TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS meeting_records (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project_id INTEGER NULL REFERENCES projects(id) ON DELETE SET NULL,
                title VARCHAR(200) NOT NULL,
                audio_filename VARCHAR(255) NOT NULL,
                audio_storage_path VARCHAR(255) NOT NULL,
                audio_mime_type VARCHAR(120) NULL,
                file_size_bytes BIGINT NOT NULL,
                language VARCHAR(32) NULL,
                duration_seconds DOUBLE PRECISION NULL,
                transcript_text TEXT NOT NULL,
                minutes_text TEXT NOT NULL,
                summary_text TEXT NOT NULL,
                action_items_text TEXT NOT NULL,
                asr_model_name VARCHAR(120) NOT NULL,
                llm_model_name VARCHAR(120) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS product_updates (
                id SERIAL PRIMARY KEY,
                entry_key VARCHAR(120) NULL,
                version_tag VARCHAR(24) NULL,
                title VARCHAR(160) NOT NULL,
                summary TEXT NOT NULL,
                details TEXT NULL,
                area VARCHAR(80) NOT NULL,
                change_type product_update_type NOT NULL DEFAULT 'update',
                changed_at TIMESTAMPTZ NOT NULL,
                is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
                author_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
    )
    connection.execute(text("ALTER TABLE product_updates ADD COLUMN IF NOT EXISTS entry_key VARCHAR(120)"))
    connection.execute(text("ALTER TABLE product_updates ADD COLUMN IF NOT EXISTS version_tag VARCHAR(24)"))

    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_asr_transcripts_user_id ON asr_transcripts (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_asr_transcripts_created_at ON asr_transcripts (created_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_meeting_records_user_id ON meeting_records (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_meeting_records_project_id ON meeting_records (project_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_meeting_records_created_at ON meeting_records (created_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_milestones_user_id ON milestones (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_user_id ON tasks (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_logs_user_id ON daily_logs (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_users_access_group_id ON users (access_group_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_user_sessions_user_id ON user_sessions (user_id)"))
    connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_user_sessions_session_token ON user_sessions (session_token)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_area ON product_updates (area)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_change_type ON product_updates (change_type)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_changed_at ON product_updates (changed_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_version_tag ON product_updates (version_tag)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_author_user_id ON product_updates (author_user_id)"))
    connection.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_product_updates_entry_key
            ON product_updates (entry_key)
            WHERE entry_key IS NOT NULL
            """
        )
    )
    connection.execute(
        text("CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_logs_user_log_date ON daily_logs (user_id, log_date)")
    )

    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = 'meeting_records'
                      AND kcu.column_name = 'project_id'
                ) THEN
                    ALTER TABLE meeting_records
                    ADD CONSTRAINT fk_meeting_records_project_id
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL;
                END IF;
            END $$;
            """
        )
    )
    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = 'users'
                      AND kcu.column_name = 'access_group_id'
                ) THEN
                    ALTER TABLE users
                    ADD CONSTRAINT fk_users_access_group_id
                    FOREIGN KEY (access_group_id) REFERENCES access_groups (id) ON DELETE SET NULL;
                END IF;
            END $$;
            """
        )
    )
    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = 'projects'
                      AND kcu.column_name = 'user_id'
                ) THEN
                    ALTER TABLE projects
                    ADD CONSTRAINT fk_projects_user_id
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
                END IF;
            END $$;
            """
        )
    )
    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = 'milestones'
                      AND kcu.column_name = 'user_id'
                ) THEN
                    ALTER TABLE milestones
                    ADD CONSTRAINT fk_milestones_user_id
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
                END IF;
            END $$;
            """
        )
    )
    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = 'tasks'
                      AND kcu.column_name = 'user_id'
                ) THEN
                    ALTER TABLE tasks
                    ADD CONSTRAINT fk_tasks_user_id
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
                END IF;
            END $$;
            """
        )
    )
    connection.execute(
        text(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND tc.table_name = 'daily_logs'
                      AND kcu.column_name = 'user_id'
                ) THEN
                    ALTER TABLE daily_logs
                    ADD CONSTRAINT fk_daily_logs_user_id
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
                END IF;
            END $$;
            """
        )
    )


def ensure_initial_admin(db: Session) -> User:
    existing_user = db.query(User).order_by(User.id.asc()).first()
    if existing_user:
        return existing_user

    admin = User(
        username=normalize_username(settings.initial_admin_username),
        display_name=settings.initial_admin_display_name,
        password_hash=hash_password(settings.bootstrap_admin_password),
        role=UserRole.ADMIN,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def ensure_default_access_groups(db: Session) -> AccessGroup:
    groups = list(db.scalars(select(AccessGroup).order_by(AccessGroup.id.asc())).all())
    existing_by_name = {group.name: group for group in groups}

    seed_groups = [
        {
            "name": "Full access",
            "description": "Project tracker, ASR, and LLM features.",
            "can_use_project_tracer": True,
            "can_use_asr": True,
            "can_use_llm": True,
        },
        {
            "name": "Projects only",
            "description": "Project tracking only.",
            "can_use_project_tracer": True,
            "can_use_asr": False,
            "can_use_llm": False,
        },
        {
            "name": "Audio workspace",
            "description": "Transcript and meeting notes.",
            "can_use_project_tracer": False,
            "can_use_asr": True,
            "can_use_llm": True,
        },
    ]

    dirty = False
    for seed in seed_groups:
        group = existing_by_name.get(seed["name"])
        if group is None:
            db.add(AccessGroup(**seed))
            dirty = True
            continue

        for field, value in seed.items():
            if getattr(group, field) != value:
                setattr(group, field, value)
                dirty = True

    if dirty:
        db.commit()

    full_access = db.scalar(select(AccessGroup).where(AccessGroup.name == "Full access"))
    if full_access is None:
        raise RuntimeError("Full access group is missing after bootstrap.")

    audio_workspace = db.scalar(select(AccessGroup).where(AccessGroup.name == "Audio workspace"))
    if audio_workspace is None:
        raise RuntimeError("Audio workspace group is missing after bootstrap.")

    legacy_group_names = ("ASR only", "Meetings")
    legacy_groups = list(db.scalars(select(AccessGroup).where(AccessGroup.name.in_(legacy_group_names))).all())
    if legacy_groups:
        legacy_group_ids = [group.id for group in legacy_groups]
        db.execute(
            update(User)
            .where(User.access_group_id.in_(legacy_group_ids))
            .values(access_group_id=audio_workspace.id)
        )
        for group in legacy_groups:
            db.delete(group)
        db.commit()

    return full_access


def ensure_default_ai_providers(db: Session) -> None:
    created = False

    local_asr = db.scalar(select(AIProvider).where(AIProvider.name == "Local Breeze ASR"))
    if local_asr is None:
        db.add(
            AIProvider(
                name="Local Breeze ASR",
                kind=AIProviderKind.ASR,
                driver=AIProviderDriver.LOCAL_BREEZE,
                model_name=settings.asr_model_name,
                description="Runs faster-whisper Breeze ASR locally on the server.",
                is_active=True,
            )
        )
        created = True
    else:
        updated = False
        if local_asr.model_name != settings.asr_model_name:
            local_asr.model_name = settings.asr_model_name
            updated = True
        if local_asr.driver != AIProviderDriver.LOCAL_BREEZE:
            local_asr.driver = AIProviderDriver.LOCAL_BREEZE
            updated = True
        if local_asr.kind != AIProviderKind.ASR:
            local_asr.kind = AIProviderKind.ASR
            updated = True
        expected_description = "Runs faster-whisper Breeze ASR locally on the server."
        if local_asr.description != expected_description:
            local_asr.description = expected_description
            updated = True
        if updated:
            db.add(local_asr)
            created = True

    if settings.gemini_api_key:
        gemini = db.scalar(select(AIProvider).where(AIProvider.name == "Gemini Meeting Notes"))
        if gemini is None:
            api_key = settings.gemini_api_key.strip()
            db.add(
                AIProvider(
                    name="Gemini Meeting Notes",
                    kind=AIProviderKind.LLM,
                    driver=AIProviderDriver.GEMINI,
                    model_name=settings.gemini_model,
                    base_url="https://generativelanguage.googleapis.com/v1beta",
                    api_key_encrypted=encrypt_secret(api_key),
                    api_key_hint=make_secret_hint(api_key),
                    description="Gemini provider for meeting summaries and action items.",
                    is_active=True,
                )
            )
            created = True

    if created:
        db.commit()


def ensure_usage_policy(db: Session) -> UsagePolicy:
    policy = db.scalar(select(UsagePolicy).order_by(UsagePolicy.id.asc()).limit(1))
    if policy is not None:
        return policy

    policy = UsagePolicy(
        id=1,
        llm_runs_per_24h=settings.default_llm_runs_per_24h,
        max_audio_seconds_per_request=settings.default_max_audio_seconds_per_request,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


def sync_product_updates_catalog(db: Session, admin_id: int) -> None:
    items = list(db.scalars(select(ProductUpdate).order_by(ProductUpdate.id.asc())).all())
    existing_by_key = {item.entry_key: item for item in items if item.entry_key}
    legacy_by_title = {item.title: item for item in items if not item.entry_key}
    catalog_keys = {entry.entry_key for entry in PRODUCT_UPDATE_CATALOG}

    dirty = False
    for entry in PRODUCT_UPDATE_CATALOG:
        item = existing_by_key.get(entry.entry_key) or legacy_by_title.get(entry.title)
        if item is None:
            item = ProductUpdate(entry_key=entry.entry_key)
            db.add(item)

        item.entry_key = entry.entry_key
        item.version_tag = entry.version_tag
        item.title = entry.title
        item.summary = entry.summary
        item.details = entry.details
        item.area = entry.area
        item.change_type = entry.change_type
        item.changed_at = entry.changed_at
        item.is_pinned = entry.is_pinned
        item.author_user_id = admin_id
        dirty = True

    for item in items:
        if item.entry_key and item.entry_key not in catalog_keys:
            db.delete(item)
            dirty = True

    if dirty:
        db.commit()


def backfill_existing_data(db: Session, admin_id: int, full_access_group_id: int) -> None:
    db.execute(text("UPDATE projects SET user_id = :admin_id WHERE user_id IS NULL"), {"admin_id": admin_id})
    db.execute(
        text(
            """
            UPDATE milestones AS milestone
            SET user_id = project.user_id
            FROM projects AS project
            WHERE milestone.project_id = project.id
              AND milestone.user_id IS NULL
            """
        )
    )
    db.execute(
        text(
            """
            UPDATE tasks AS task
            SET user_id = project.user_id
            FROM projects AS project
            WHERE task.project_id = project.id
              AND task.user_id IS NULL
            """
        )
    )
    db.execute(text("UPDATE daily_logs SET user_id = :admin_id WHERE user_id IS NULL"), {"admin_id": admin_id})
    db.execute(
        text("UPDATE users SET access_group_id = :group_id WHERE access_group_id IS NULL"),
        {"group_id": full_access_group_id},
    )
    db.commit()


def finalize_schema_upgrades(connection) -> None:
    connection.execute(text("ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE milestones ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE tasks ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE daily_logs ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE users ALTER COLUMN max_concurrent_sessions SET NOT NULL"))
