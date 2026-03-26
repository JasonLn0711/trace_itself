from time import sleep

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.base import Base
from app.db.bootstrap import (
    apply_schema_upgrades,
    backfill_existing_data,
    ensure_default_product_updates,
    ensure_initial_admin,
    finalize_schema_upgrades,
)

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    for attempt in range(1, settings.db_connect_max_attempts + 1):
        try:
            with engine.begin() as connection:
                connection.execute(text("SELECT 1"))
                Base.metadata.create_all(bind=connection)
                apply_schema_upgrades(connection)
            with SessionLocal() as db:
                admin = ensure_initial_admin(db)
                backfill_existing_data(db, admin.id)
                ensure_default_product_updates(db, admin.id)
            with engine.begin() as connection:
                finalize_schema_upgrades(connection)
            return
        except OperationalError as exc:
            if attempt == settings.db_connect_max_attempts:
                raise RuntimeError("Database connection failed during startup.") from exc
            sleep(settings.db_connect_retry_seconds)
