from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    password: str = Field(..., min_length=1)


class AuthStatus(BaseModel):
    authenticated: bool
    username: str = "owner"
