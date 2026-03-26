from pydantic import BaseModel, Field, field_validator

from app.schemas.user import UserRead


def normalize_username(value: str) -> str:
    return value.strip().lower()


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=1)

    @field_validator("username")
    @classmethod
    def normalize_login_username(cls, value: str) -> str:
        return normalize_username(value)


class AuthStatus(BaseModel):
    authenticated: bool
    user: UserRead | None = None
