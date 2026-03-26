from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import ProductUpdateType, UserRole
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
    connection.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS product_updates (
                id SERIAL PRIMARY KEY,
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

    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_milestones_user_id ON milestones (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_user_id ON tasks (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_logs_user_id ON daily_logs (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_area ON product_updates (area)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_change_type ON product_updates (change_type)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_changed_at ON product_updates (changed_at)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_product_updates_author_user_id ON product_updates (author_user_id)"))
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


def ensure_default_product_updates(db: Session, admin_id: int) -> None:
    existing_update = db.query(ProductUpdate).order_by(ProductUpdate.id.asc()).first()
    if existing_update:
        return

    entries = [
        ProductUpdate(
            title="Next.js app runtime",
            summary="The frontend now runs on Next.js App Router with the same private session flow.",
            details="We replaced the old SPA shell with Next.js routes, protected layouts, and a same-origin API proxy so the product is easier to evolve without changing the deployment model.",
            area="frontend",
            change_type=ProductUpdateType.BUILD,
            changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
            is_pinned=True,
            author_user_id=admin_id,
        ),
        ProductUpdate(
            title="Shared account system",
            summary="Multiple users can sign in with isolated data and admin-managed access.",
            details="This added user management, account roles, password resets, and temporary lockouts after repeated failed login attempts.",
            area="users",
            change_type=ProductUpdateType.SECURITY,
            changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
            author_user_id=admin_id,
        ),
        ProductUpdate(
            title="Progress dashboard refresh",
            summary="The dashboard now uses clearer dark-mode visuals, progress bars, and tighter task focus.",
            details="We simplified page copy, reduced visual noise, and kept the main questions visible: what is active, what is overdue, and what to do next.",
            area="dashboard",
            change_type=ProductUpdateType.UPDATE,
            changed_at=datetime.fromisoformat("2026-03-26T00:00:00+00:00"),
            author_user_id=admin_id,
        ),
    ]
    db.add_all(entries)
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
