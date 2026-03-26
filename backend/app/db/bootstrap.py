from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.product_update_catalog import PRODUCT_UPDATE_CATALOG
from app.core.enums import UserRole
from app.models.product_update import ProductUpdate
from app.models.user import User
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
    connection.execute(text("ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_log_date_key"))
    connection.execute(text("ALTER TABLE asr_transcripts ADD COLUMN IF NOT EXISTS audio_storage_path VARCHAR(255)"))
    connection.execute(text("ALTER TABLE asr_transcripts ADD COLUMN IF NOT EXISTS audio_mime_type VARCHAR(120)"))
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
                transcript_text TEXT NOT NULL,
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
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_meeting_records_created_at ON meeting_records (created_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_milestones_user_id ON milestones (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_user_id ON tasks (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_logs_user_id ON daily_logs (user_id)"))
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


def sync_product_updates_catalog(db: Session, admin_id: int) -> None:
    items = list(db.scalars(select(ProductUpdate).order_by(ProductUpdate.id.asc())).all())
    existing_by_key = {item.entry_key: item for item in items if item.entry_key}
    legacy_by_title = {item.title: item for item in items if not item.entry_key}

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

    if dirty:
        db.commit()


def backfill_existing_data(db: Session, admin_id: int) -> None:
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
    db.commit()


def finalize_schema_upgrades(connection) -> None:
    connection.execute(text("ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE milestones ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE tasks ALTER COLUMN user_id SET NOT NULL"))
    connection.execute(text("ALTER TABLE daily_logs ALTER COLUMN user_id SET NOT NULL"))
