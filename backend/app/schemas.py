from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class InvitationActivationRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    password: str = Field(min_length=12, max_length=256)
    name: str | None = Field(default=None, min_length=2, max_length=160)


class ProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    name: str
    role: str
    is_approver: bool
    modules: list[str]
    permissions: dict[str, bool] = {}


class SessionResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class HealthResponse(BaseModel):
    status: str
    service: str
