import hashlib
import hmac
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from app.auth import get_current_session, require_csrf
from app.config import settings
from app.db import get_db
from app.jobs import ACTIVE, save_checks, snapshot_post
from app.media import asset_dto, asset_from_file, root, verify_signature
from app.models import AuditEvent, MediaAsset, StudioPost, WebhookInbox, WorkJob
from app.permissions import require_permission

router = APIRouter(tags=["media and provider callbacks"])


@router.post("/studio/media")
async def upload_media(request: Request, post_id: int = Form(...), version: int = Form(...),
                       file: UploadFile = File(...), session_data=Depends(get_current_session), db=Depends(get_db)):
    user, session = session_data
    require_csrf(request, session)
    require_permission(user, "media.upload")
    post = db.scalar(select(StudioPost).where(StudioPost.id == post_id).with_for_update())
    if not post or post.stage not in {"selected", "review"}:
        raise HTTPException(409, "Media can be attached to editable drafts only.")
    if post.version != version:
        raise HTTPException(409, "The draft changed. Refresh before uploading.")
    if db.scalar(select(WorkJob.id).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE))):
        raise HTTPException(409, "Wait for generation to finish before uploading.")
    path = root() / f"{uuid4().hex}.asset"
    try:
        size = 0
        with path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.media_max_upload_mb * 1024 * 1024:
                    raise HTTPException(413, f"Maximum upload size is {settings.media_max_upload_mb} MB.")
                target.write(chunk)
        try:
            asset = asset_from_file(db, post.id, path)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        if (post.payload["format"] == "video") != (asset.kind == "video"):
            raise HTTPException(422, "Choose the matching post format before uploading this file.")
        media = post.payload.get("media", []) if post.payload["format"] == "carousel" else []
        if len(media) >= 10:
            raise HTTPException(422, "A carousel can have at most 10 attachments.")
        snapshot_post(post, "Media uploaded")
        post.version += 1
        post.approved_version = None
        post.payload = {**post.payload, "media": [*media, asset_dto(asset)], "versionReason": "Media uploaded"}
        post.stage = "review"
        save_checks(db, post)
        db.add(AuditEvent(actor_user_id=user.id, action="media.uploaded", resource_type="media_asset", resource_id=str(asset.id)))
        db.commit()
        return {"message": "Media attached", "asset": asset_dto(asset)}
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/studio/media/{asset_id}")
def preview(asset_id: UUID, session_data=Depends(get_current_session), db=Depends(get_db)):
    return serve_asset(db, asset_id)


@router.get("/media/public/{asset_id}")
def public_media(asset_id: UUID, expires: int, signature: str, db=Depends(get_db)):
    if not verify_signature(str(asset_id), expires, signature):
        raise HTTPException(403, "Media link expired or invalid")
    return serve_asset(db, asset_id)


def serve_asset(db, asset_id):
    asset = db.get(MediaAsset, asset_id)
    if not asset:
        raise HTTPException(404, "Media not found")
    path = root() / asset.filename
    if not path.is_file():
        raise HTTPException(404, "Media file unavailable")
    return FileResponse(path, media_type=asset.mime, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=60"})


@router.post("/webhooks/zernio")
async def zernio_webhook(request: Request, db=Depends(get_db)):
    body = await request.body()
    if len(body) > 1024 * 1024:
        raise HTTPException(413, "Webhook too large")
    if not settings.zernio_webhook_secret:
        raise HTTPException(503, "Webhook secret not configured")
    expected = hmac.new(settings.zernio_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("x-zernio-signature", "")):
        raise HTTPException(401, "Invalid webhook signature")
    try:
        payload = json.loads(body)
        identifier = payload["id"]
        if not isinstance(identifier, str) or len(identifier) > 100:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, "Invalid webhook event") from None
    db.execute(insert(WebhookInbox).values(id=identifier, payload=payload, processed=False).on_conflict_do_nothing(index_elements=["id"]))
    db.commit()
    return {"accepted": True}


@router.post("/webhooks/predis")
async def predis_webhook(request: Request, db=Depends(get_db)):
    """Wake the media poller when Predis completes a generation.

    Predis documents no signature header and sends each terminal callback once.
    Treat the callback as a notification only: the worker fetches authoritative
    state from Predis before changing the post or attaching media.
    """
    body = await request.body()
    if len(body) > 1024 * 1024:
        raise HTTPException(413, "Webhook too large")
    try:
        payload = json.loads(body)
        post_id = payload["post_id"]
        status = payload["status"]
        if not isinstance(post_id, str) or not post_id or len(post_id) > 160:
            raise ValueError()
        if status not in {"completed", "error"}:
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise HTTPException(422, "Invalid Predis webhook event") from None

    # Never trust callback contents as media/status data. Only wake the job;
    # the worker will fetch the post through the authenticated Predis API.
    job = db.scalar(select(WorkJob).where(
        WorkJob.provider == "Predis", WorkJob.kind == "media",
        WorkJob.provider_id == post_id, WorkJob.status.in_(ACTIVE),
    ).with_for_update())
    if job:
        job.next_run = datetime.now(UTC)
        db.commit()
    return {"accepted": True}
