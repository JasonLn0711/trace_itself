from secrets import compare_digest

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.schemas.auth import AuthStatus, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/login", response_model=AuthStatus)
def login(payload: LoginRequest, request: Request) -> AuthStatus:
    if not compare_digest(payload.password, settings.app_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid password.")

    request.session.clear()
    request.session["authenticated"] = True
    return AuthStatus(authenticated=True)


@router.post("/logout", response_model=AuthStatus)
def logout(request: Request, response: Response) -> AuthStatus:
    request.session.clear()
    response.delete_cookie(settings.session_cookie_name)
    return AuthStatus(authenticated=False)


@router.get("/me", response_model=AuthStatus)
def me(request: Request) -> AuthStatus:
    authenticated = bool(request.session.get("authenticated"))
    if not authenticated:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    return AuthStatus(authenticated=True)
