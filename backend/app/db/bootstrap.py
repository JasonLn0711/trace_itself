from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import UserRole
from app.models.user import User
from app.services.security import hash_password, normalize_username

settings = get_settings()


def apply_schema_upgrades(connection) -> None:
    connection.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE milestones ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS user_id INTEGER"))
    connection.execute(text("ALTER TABLE daily_logs DROP CONSTRAINT IF EXISTS daily_logs_log_date_key"))

    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_milestones_user_id ON milestones (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_user_id ON tasks (user_id)"))
    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_daily_logs_user_id ON daily_logs (user_id)"))
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
