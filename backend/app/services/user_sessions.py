from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user_session import UserSession


def create_user_session(
    db: Session,
    *,
    user_id: int,
    user_agent: str | None,
    ip_address: str | None,
) -> UserSession:
    session = UserSession(
        user_id=user_id,
        session_token=uuid4().hex,
        user_agent=(user_agent or "").strip()[:255] or None,
        ip_address=(ip_address or "").strip()[:64] or None,
    )
    db.add(session)
    db.flush()
    return session


def get_user_session(db: Session, *, user_id: int, session_token: str) -> UserSession | None:
    return db.scalar(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.session_token == session_token,
        )
    )


def delete_user_session(db: Session, *, user_id: int | None, session_token: str | None) -> None:
    if not session_token:
        return

    stmt = select(UserSession).where(UserSession.session_token == session_token)
    if user_id is not None:
        stmt = stmt.where(UserSession.user_id == user_id)

    session = db.scalar(stmt)
    if session is None:
        return

    db.delete(session)


def delete_all_user_sessions(
    db: Session,
    *,
    user_id: int,
    preserve_session_token: str | None = None,
) -> int:
    sessions = list(db.scalars(select(UserSession).where(UserSession.user_id == user_id)).all())
    removed = 0
    for session in sessions:
        if preserve_session_token and session.session_token == preserve_session_token:
            continue
        db.delete(session)
        removed += 1
    return removed


def enforce_concurrent_session_limit(
    db: Session,
    *,
    user_id: int,
    max_sessions: int,
    preserve_session_token: str | None = None,
) -> int:
    sessions = list(
        db.scalars(
            select(UserSession)
            .where(UserSession.user_id == user_id)
            .order_by(UserSession.last_seen_at.asc(), UserSession.created_at.asc(), UserSession.id.asc())
        ).all()
    )
    excess = max(0, len(sessions) - max(1, max_sessions))
    if excess <= 0:
        return 0

    removed = 0
    for session in sessions:
        if preserve_session_token and session.session_token == preserve_session_token:
            continue
        db.delete(session)
        removed += 1
        if removed >= excess:
            break

    if removed < excess and preserve_session_token:
        for session in sessions:
            if session.session_token == preserve_session_token:
                continue
            if session in db.deleted:
                continue
            db.delete(session)
            removed += 1
            if removed >= excess:
                break
    return removed


def touch_user_session(session: UserSession, *, now: datetime | None = None) -> None:
    session.last_seen_at = now or datetime.now(timezone.utc)
