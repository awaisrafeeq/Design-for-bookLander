"""Administrator controlled Predis account authorization for live credit balance."""

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import get_current_session, require_csrf
from app.config import settings
from app.db import get_db
from app.models import AuthSession, User
from app.predis_account import (
    PredisConnectionError,
    disconnect,
    finish_connection,
    start_connection,
)

router = APIRouter(prefix="/predis", tags=["Predis account"])


def _admin(
    session_data: tuple[User, AuthSession] = Depends(get_current_session),
) -> tuple[User, AuthSession]:
    if session_data[0].role != "admin":
        raise HTTPException(403, "Administrator access required")
    return session_data


@router.post("/connect")
def connect(request: Request, session_data: tuple[User, AuthSession] = Depends(_admin)) -> dict:
    user, session = session_data
    require_csrf(request, session)
    try:
        return {"authorizationUrl": start_connection(str(user.id), str(session.id))}
    except PredisConnectionError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/oauth/callback")
def callback(
    state: str = "",
    code: str = "",
    iss: str | None = None,
    error: str | None = None,
    session_data: tuple[User, AuthSession] = Depends(_admin),
    db: Session = Depends(get_db),
):
    if error:
        return RedirectResponse(
            f"{settings.public_app_url.rstrip('/')}/spend?predis=cancelled", status_code=303
        )
    user, session = session_data
    try:
        finish_connection(
            db, state=state, code=code, issuer=iss, user_id=str(user.id), session_id=str(session.id)
        )
    except PredisConnectionError:
        return RedirectResponse(
            f"{settings.public_app_url.rstrip('/')}/spend?predis=failed", status_code=303
        )
    return RedirectResponse(
        f"{settings.public_app_url.rstrip('/')}/spend?predis=connected", status_code=303
    )


@router.post("/disconnect")
def remove_connection(
    request: Request,
    session_data: tuple[User, AuthSession] = Depends(_admin),
    db: Session = Depends(get_db),
) -> dict:
    require_csrf(request, session_data[1])
    disconnect(db)
    return {"status": "disconnected"}
