from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AuthStatus, LoginRequest
from app.services.audit_events import create_audit_event
from app.services.security import normalize_username, verify_password
from app.services.user_sessions import create_user_session, delete_user_session, enforce_concurrent_session_limit

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/login", response_model=AuthStatus)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> AuthStatus:
    previous_user_id = request.session.get("user_id")
    previous_session_token = request.session.get("session_token")
    username = normalize_username(payload.username)
    user = db.scalar(select(User).where(User.username == username))
    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
    )

    if not user:
        create_audit_event(
            db,
            event_type="login_failed",
            request=request,
            username=username,
            description="Unknown username.",
        )
        db.commit()
        raise invalid_credentials

    if not user.is_active:
        create_audit_event(
            db,
            event_type="login_failed",
            request=request,
            user=user,
            description="Account disabled.",
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is disabled.")

    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until > now:
        create_audit_event(
            db,
            event_type="login_failed",
            request=request,
            user=user,
            description="Account locked.",
        )
        db.commit()
        remaining = int((user.locked_until - now).total_seconds())
        minutes = max(1, remaining // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Try again in about {minutes} minute(s).",
        )
    if user.locked_until and user.locked_until <= now:
        user.locked_until = None
        user.failed_login_attempts = 0

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= settings.auth_max_failed_attempts:
            user.locked_until = now + timedelta(minutes=settings.auth_lockout_minutes)
            db.add(user)
            create_audit_event(
                db,
                event_type="login_failed",
                request=request,
                user=user,
                description="Invalid password. Account locked.",
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed attempts. Try again in about {settings.auth_lockout_minutes} minute(s).",
            )

        db.add(user)
        create_audit_event(
            db,
            event_type="login_failed",
            request=request,
            user=user,
            description="Invalid password.",
        )
        db.commit()
        raise invalid_credentials

    delete_user_session(db, user_id=previous_user_id, session_token=previous_session_token)

    auth_session = create_user_session(
        db,
        user_id=user.id,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    enforce_concurrent_session_limit(
        db,
        user_id=user.id,
        max_sessions=user.max_concurrent_sessions,
        preserve_session_token=auth_session.session_token,
    )

    request.session.clear()
    request.session["authenticated"] = True
    request.session["user_id"] = user.id
    request.session["session_token"] = auth_session.session_token

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    db.add(user)
    create_audit_event(
        db,
        event_type="login_success",
        request=request,
        user=user,
        description="Signed in.",
    )
    db.commit()
    db.refresh(user)
    return AuthStatus(authenticated=True, user=user)


@router.post("/logout", response_model=AuthStatus)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthStatus:
    current_user = db.get(User, request.session.get("user_id")) if request.session.get("user_id") else None
    if current_user:
        create_audit_event(
            db,
            event_type="logout",
            request=request,
            user=current_user,
            description="Signed out.",
        )
    delete_user_session(
        db=db,
        user_id=request.session.get("user_id"),
        session_token=request.session.get("session_token"),
    )
    db.commit()
    request.session.clear()
    response.delete_cookie(settings.session_cookie_name)
    return AuthStatus(authenticated=False, user=None)


@router.get("/me", response_model=AuthStatus)
def me(current_user: User = Depends(get_current_user)) -> AuthStatus:
    return AuthStatus(authenticated=True, user=current_user)
