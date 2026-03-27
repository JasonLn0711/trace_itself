from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent
from app.models.user import User


def clean_text(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return normalized[:limit]


def create_audit_event(
    db: Session,
    *,
    event_type: str,
    request: Request | None = None,
    user: User | None = None,
    username: str | None = None,
    display_name: str | None = None,
    path: str | None = None,
    description: str | None = None,
) -> AuditEvent:
    event = AuditEvent(
        user_id=user.id if user else None,
        username=clean_text(username or (user.username if user else None), 100),
        display_name=clean_text(display_name or (user.display_name if user else None), 120),
        event_type=clean_text(event_type.lower(), 40) or "activity",
        path=clean_text(path, 255),
        description=clean_text(description, 255),
        ip_address=clean_text(request.client.host if request and request.client else None, 64),
        user_agent=clean_text(request.headers.get("user-agent") if request else None, 255),
    )
    db.add(event)
    db.flush()
    return event
