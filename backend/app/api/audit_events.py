from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.schemas.audit_event import AuditEventPageViewCreate, AuditEventRead
from app.services.audit_events import create_audit_event

router = APIRouter(prefix="/audit-events", tags=["audit_events"])


@router.get("", response_model=list[AuditEventRead], dependencies=[Depends(require_admin)])
def list_audit_events(
    user_id: int | None = Query(default=None),
    event_type: str | None = Query(default=None, min_length=1, max_length=40),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[AuditEvent]:
    stmt = select(AuditEvent)
    if user_id is not None:
        stmt = stmt.where(AuditEvent.user_id == user_id)
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type.strip().lower())
    stmt = stmt.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit)
    return list(db.scalars(stmt).all())


@router.post("/page-view", response_model=AuditEventRead, status_code=status.HTTP_201_CREATED)
def track_page_view(
    payload: AuditEventPageViewCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditEvent:
    event = create_audit_event(
        db,
        event_type="page_view",
        request=request,
        user=current_user,
        path=payload.path,
        description="Viewed app page.",
    )
    db.commit()
    db.refresh(event)
    return event
