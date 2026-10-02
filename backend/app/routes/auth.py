import hashlib
import ipaddress
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import clear_session_cookie, get_current_session, require_csrf, set_session_cookie
from app.config import settings
from app.db import get_db
from app.models import AuditEvent, AuthSession, Invitation, User
from app.schemas import InvitationActivationRequest, LoginRequest, PasswordChangeRequest, ProfileUpdateRequest, SessionResponse, UserResponse
from app.security import hash_password, hash_session_token, new_session_material, password_hasher, verify_password
from app.permissions import effective_permissions

router = APIRouter(prefix="/auth", tags=["auth"])
ROLE_MODULES = {
    "admin": ["Board", "Ideas", "Review", "Schedule", "Results", "Sources", "Brand", "AI spend", "Team", "Logs"],
    "campaigns_manager": ["Board", "Ideas", "Review", "Schedule", "Results", "Sources", "Brand", "AI spend", "Logs"],
    "approver": ["Board", "Ideas", "Review", "Schedule", "Results", "Logs"],
    "editor": ["Board", "Ideas", "Schedule", "Sources", "Brand", "Logs"],
    "viewer": ["Board", "Schedule", "Results"],
}
DUMMY_PASSWORD_HASH = password_hasher.hash(secrets.token_urlsafe(32))
redis_client = Redis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
RATE_LIMIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
"""


def enforce_auth_rate_limit(request: Request, action: str) -> str:
    supplied_ip = request.headers.get("x-client-ip")
    if supplied_ip:
        try:
            address = str(ipaddress.ip_address(supplied_ip.strip()))
        except ValueError:
            address = "invalid-forwarded-address"
    else:
        address = request.client.host if request.client else "unknown"
    key = f"auth:{action}:{hashlib.sha256(address.encode()).hexdigest()}"
    try:
        count = int(redis_client.eval(RATE_LIMIT_SCRIPT, 1, key, settings.auth_login_window_seconds))
    except RedisError as exc:
        raise HTTPException(status_code=503, detail="Authentication protection is temporarily unavailable") from exc
    if count > settings.auth_login_max_attempts:
        raise HTTPException(status_code=429, detail="Too many attempts. Wait before trying again.", headers={"Retry-After": str(settings.auth_login_window_seconds)})
    return key


def user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        is_approver=user.is_approver,
        modules=user.module_access if user.role != "admin" else ROLE_MODULES["admin"],
        permissions=effective_permissions(user),
    )


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> SessionResponse:
    rate_limit_key = enforce_auth_rate_limit(request, "login")
    email = str(payload.email).strip().casefold()
    user = db.scalar(select(User).where(User.email == email, User.active.is_(True)))
    password_matches = verify_password(user.password_hash, payload.password) if user else verify_password(DUMMY_PASSWORD_HASH, payload.password)
    if user is None or not password_matches:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect")

    raw_token, csrf_token, expires_at = new_session_material()
    session = AuthSession(user_id=user.id, token_hash=hash_session_token(raw_token), csrf_token=csrf_token, expires_at=expires_at)
    db.add(session)
    db.add(AuditEvent(actor_user_id=user.id, action="auth.login", resource_type="session", request_id=request.headers.get("x-request-id")))
    db.commit()
    try:
        redis_client.delete(rate_limit_key)
    except RedisError:
        pass
    set_session_cookie(response, raw_token, expires_at)
    return SessionResponse(user=user_response(user), csrf_token=csrf_token)


@router.post("/activate-invitation")
def activate_invitation(payload: InvitationActivationRequest, request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    enforce_auth_rate_limit(request, "activation")
    invitation = db.scalar(select(Invitation).where(Invitation.token_hash == hash_session_token(payload.token)).with_for_update())
    if invitation is None or invitation.consumed_at is not None or invitation.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=400, detail="This invitation link is invalid or expired")
    user = db.scalar(select(User).where(User.id == invitation.user_id).with_for_update())
    if user is None or user.active:
        raise HTTPException(status_code=400, detail="This invitation link is invalid or expired")
    name = payload.name.strip() if payload.name else None
    if name is not None and len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least 2 characters")
    user.password_hash = hash_password(payload.password)
    user.active = True
    user.invited = False
    if name:
        user.name = name
    invitation.consumed_at = datetime.now(UTC)
    db.add(AuditEvent(actor_user_id=user.id, action="team.invitation_accepted", resource_type="user", resource_id=str(user.id), request_id=request.headers.get("x-request-id")))
    db.commit()
    return {"message": "Account activated. You can now sign in."}


@router.get("/me", response_model=UserResponse)
def me(session_data: tuple[User, AuthSession] = Depends(get_current_session)) -> UserResponse:
    return user_response(session_data[0])


@router.get("/csrf")
def csrf(session_data: tuple[User, AuthSession] = Depends(get_current_session)) -> dict[str, str]:
    return {"csrf_token": session_data[1].csrf_token}


@router.post("/profile", response_model=UserResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    request: Request,
    session_data: tuple[User, AuthSession] = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> UserResponse:
    user, session = session_data
    require_csrf(request, session)
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least 2 characters")
    user.name = name
    db.add(AuditEvent(actor_user_id=user.id, action="profile.name_updated", resource_type="user", resource_id=str(user.id), request_id=request.headers.get("x-request-id")))
    db.commit()
    db.refresh(user)
    return user_response(user)


@router.post("/password", response_model=SessionResponse)
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    session_data: tuple[User, AuthSession] = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> SessionResponse:
    user, session = session_data
    require_csrf(request, session)
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different new password")

    user.password_hash = hash_password(payload.new_password)
    raw_token, csrf_token, expires_at = new_session_material()
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.id != session.id))
    session.token_hash = hash_session_token(raw_token)
    session.csrf_token = csrf_token
    session.expires_at = expires_at
    db.add(AuditEvent(actor_user_id=user.id, action="profile.password_changed", resource_type="user", resource_id=str(user.id), request_id=request.headers.get("x-request-id")))
    db.commit()
    db.refresh(user)
    set_session_cookie(response, raw_token, expires_at)
    return SessionResponse(user=user_response(user), csrf_token=csrf_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    session_data: tuple[User, AuthSession] = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> Response:
    user, session = session_data
    require_csrf(request, session)
    db.add(AuditEvent(actor_user_id=user.id, action="auth.logout", resource_type="session", resource_id=str(session.id), request_id=request.headers.get("x-request-id")))
    db.delete(session)
    db.commit()
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
