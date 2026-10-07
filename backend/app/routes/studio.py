import secrets
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from uuid import UUID
from zoneinfo import ZoneInfo

from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_session, require_csrf
from app.db import get_db
from app.models import AuditEvent, AuthSession, BrandPolicyVersion, BrandRule, Invitation, SourceSetting, SpendEntry, SpendSettings, StudioPost, User
from app.security import hash_password, hash_session_token
from app.jobs import ACTIVE, job_dto, save_checks, snapshot_post, editable_stage, workflow_stage
from app.models import WorkJob, Publication
from app.permissions import PERMISSIONS, effective_permissions, require_permission
from app.workflow import generation_command, connections_dto, schedule_command, sync_accounts, accounts_dto

router = APIRouter(prefix="/studio", tags=["studio settings"])

ROLE_TO_API = {
    "Super admin": "admin",
    "Campaigns manager": "campaigns_manager",
    "Approver": "approver",
    "Editor": "editor",
    "Viewer": "viewer",
    "admin": "admin",
    "campaigns_manager": "campaigns_manager",
    "approver": "approver",
    "editor": "editor",
    "viewer": "viewer",
}
ROLE_TO_LABEL = {value: key for key, value in ROLE_TO_API.items() if key[0].isupper()}
MODULES = ["Board", "Ideas", "Review", "Schedule", "Results", "Sources", "Brand", "AI spend", "Team", "Logs"]
ROLE_MODULES = {
    "admin": MODULES,
    "campaigns_manager": ["Board", "Ideas", "Review", "Schedule", "Results", "Sources", "Brand", "AI spend", "Logs"],
    "approver": ["Board", "Ideas", "Review", "Schedule", "Results", "Logs"],
    "editor": ["Board", "Ideas", "Schedule", "Sources", "Brand", "Logs"],
    "viewer": ["Board", "Schedule", "Results"],
}


def current_user_and_session(session_data: tuple[User, AuthSession] = Depends(get_current_session)) -> tuple[User, AuthSession]:
    return session_data


def require_role(user: User, *roles: str) -> None:
    if user.role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission for this action")


def require_admin(user: User) -> None:
    require_role(user, "admin")


def active_brand(db: Session, *, lock: bool = False) -> BrandPolicyVersion:
    query = select(BrandPolicyVersion).where(BrandPolicyVersion.active.is_(True)).order_by(BrandPolicyVersion.version.desc())
    if lock:
        query = query.with_for_update()
    policy = db.scalar(query)
    if policy is None:
        raise HTTPException(status_code=503, detail="Brand policy has not been configured")
    return policy


def read_brand(db: Session) -> dict:
    policy = active_brand(db)
    rules = db.scalars(select(BrandRule).where(BrandRule.policy_version_id == policy.id).order_by(BrandRule.created_at, BrandRule.id)).all()
    guidance = policy.format_guidance or {}
    return {
        "voice": policy.voice,
        "never": [rule.rule for rule in rules],
        "styles": [
            {"format": key, "name": guidance.get(key, {}).get("name", key.title()), "guidance": guidance.get(key, {}).get("guidance", "")}
            for key in ("video", "carousel", "image")
        ],
        "reference": {"postId": 0, "note": ""},
        "version": policy.version,
    }


def mutate_brand(db: Session, user: User, request: Request, command: dict) -> dict:
    require_permission(user, "brand.edit")
    policy = active_brand(db, lock=True)
    old_rules = db.scalars(select(BrandRule).where(BrandRule.policy_version_id == policy.id).order_by(BrandRule.created_at, BrandRule.id)).all()
    voice = policy.voice
    guidance = dict(policy.format_guidance or {})
    rule_values = [item.rule for item in old_rules]
    action = command.get("action")
    key = command.get("key")
    value = command.get("value")

    if key == "voice":
        voice = str(value or "").strip()
        if not voice:
            raise HTTPException(status_code=422, detail="Brand voice cannot be empty")
    elif isinstance(key, str) and key.startswith("style:"):
        format_name = key.split(":", 1)[1]
        if format_name not in {"video", "carousel", "image"}:
            raise HTTPException(status_code=422, detail="Unknown post format")
        entry = dict(guidance.get(format_name) or {})
        entry["guidance"] = str(value or "").strip()
        entry.setdefault("name", format_name.title())
        guidance[format_name] = entry
    elif action == "add-rule":
        rule = str(value or "").strip()
        if not rule:
            raise HTTPException(status_code=422, detail="Rule cannot be empty")
        rule_values.append(rule)
    elif action == "remove-rule":
        try:
            index = int(command.get("id"))
            rule_values.pop(index)
        except (TypeError, ValueError, IndexError):
            raise HTTPException(status_code=404, detail="Brand rule not found") from None
    else:
        raise HTTPException(status_code=422, detail="Unknown brand setting")

    db.query(BrandPolicyVersion).filter(BrandPolicyVersion.active.is_(True)).update({"active": False}, synchronize_session=False)
    updated = BrandPolicyVersion(version=policy.version + 1, voice=voice, format_guidance=guidance, active=True, created_by=user.id)
    db.add(updated)
    db.flush()
    db.add_all([BrandRule(policy_version_id=updated.id, rule=rule) for rule in rule_values])
    db.add(AuditEvent(actor_user_id=user.id, action="brand.policy_updated", resource_type="brand_policy", resource_id=str(updated.id), request_id=request.headers.get("x-request-id"), details={"version": updated.version, "change": key or action}))
    db.commit()
    return {"message": "Brand settings saved"}


def spend_today(db: Session, zone: ZoneInfo) -> tuple[datetime, datetime]:
    local_now = datetime.now(zone)
    start_local = datetime.combine(local_now.date(), time.min, tzinfo=zone)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def read_spend(db: Session) -> dict:
    cfg = db.scalar(select(SpendSettings).order_by(SpendSettings.updated_at.desc()))
    if cfg is None:
        raise HTTPException(status_code=503, detail="Spend settings have not been configured")
    zone = ZoneInfo(cfg.timezone)
    start, end = spend_today(db, zone)
    entries = db.scalars(select(SpendEntry).where(SpendEntry.created_at >= start, SpendEntry.created_at < end)).all()
    totals = {"text": 0.0, "video": 0.0, "image": 0.0}
    for entry in entries:
        if entry.category in totals:
            totals[entry.category] += float(entry.amount_usd)
    local_today = datetime.now(zone).date()
    week: list[float] = []
    for offset in range(6, -1, -1):
        day = local_today - timedelta(days=offset)
        day_start = datetime.combine(day, time.min, tzinfo=zone).astimezone(UTC)
        day_end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=zone).astimezone(UTC)
        total = db.scalar(select(func.coalesce(func.sum(SpendEntry.amount_usd), 0)).where(SpendEntry.created_at >= day_start, SpendEntry.created_at < day_end))
        week.append(float(total or 0))
    return {"cap": float(cfg.daily_cap_usd), **totals, "efficientModel": cfg.efficient_model, "week": week, "timezone": cfg.timezone}


def mutate_spend(db: Session, user: User, request: Request, command: dict) -> dict:
    require_permission(user, "spend.edit")
    if command.get("key") not in {"cap", "efficientModel"}:
        raise HTTPException(status_code=422, detail="Unknown spend setting")
    cfg = db.scalar(select(SpendSettings).order_by(SpendSettings.updated_at.desc()).with_for_update())
    if cfg is None:
        raise HTTPException(status_code=503, detail="Spend settings have not been configured")
    if command["key"] == "cap":
        try:
            cap = Decimal(str(command.get("value"))).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            raise HTTPException(status_code=422, detail="Daily cap must be a valid dollar amount") from None
        if not Decimal("1") <= cap <= Decimal("1000"):
            raise HTTPException(status_code=422, detail="Daily cap must be between $1 and $1,000")
        cfg.daily_cap_usd = cap
    else:
        if not isinstance(command.get("value"), bool):
            raise HTTPException(status_code=422, detail="Efficient model setting must be true or false")
        cfg.efficient_model = command["value"]
    cfg.updated_by = user.id
    db.add(AuditEvent(actor_user_id=user.id, action="spend.settings_updated", resource_type="spend_settings", resource_id=str(cfg.id), request_id=request.headers.get("x-request-id"), details={"key": command["key"]}))
    db.commit()
    return {"message": "Spend settings saved"}


def initials(name: str) -> str:
    return "".join(part[0] for part in name.split()[:2]).upper()


def user_dto(user: User) -> dict:
    return {
        "id": str(user.id),
        "name": user.name,
        "initials": initials(user.name),
        "email": user.email,
        "role": ROLE_TO_LABEL.get(user.role, "Viewer"),
        "modules": MODULES if user.role == "admin" else user.module_access,
        "invited": user.invited,
        "isApprover": user.is_approver,
        "permissions": effective_permissions(user),
        "roleTitles": user.role_titles,
        "active": user.active,
    }


def read_team(db: Session, user: User) -> list[dict]:
    require_admin(user)
    users = db.scalars(select(User).order_by(User.created_at, User.email)).all()
    return [user_dto(item) for item in users]


POST_DEFAULTS = {
    "book": "Team topic", "author": "BookLender", "cover": "#44546A", "accent": "#F2C14E",
    "source": "team", "event": "Team topic", "reason": "Added by you",
    "format": "image", "platform": "Instagram", "human": True, "bookId": None,
}


def post_dto(post: StudioPost) -> dict:
    payload = dict(post.payload)
    if payload.get("scheduledAt"):
        local = datetime.fromisoformat(payload["scheduledAt"]).astimezone(ZoneInfo("America/New_York"))
        payload["day"] = (local.date() - datetime.now(ZoneInfo("America/New_York")).date()).days
        payload["time"] = local.strftime("%H:%M")
    stage = workflow_stage(post)
    return {**payload, "id": post.id, "stage": stage, "version": post.version,
            "history": [{"version": item.get("version"), "reason": item.get("reason", "Updated"), "note": item.get("note", ""),
                         "stage": item.get("stage"), "at": item.get("at"), "payload": item.get("payload")}
                        for item in post.version_history], "approvedVersion": post.approved_version}


def read_posts(db: Session) -> list[dict]:
    posts = db.scalars(select(StudioPost).order_by(StudioPost.created_at.desc(), StudioPost.id.desc())).all()
    publications = list(db.scalars(select(Publication)))
    return [{**post_dto(post), "publicationTargets": [{"id": str(t.id), "platform": t.platform,
              "status": t.status, "postUrl": t.post_url, "error": t.error}
              for t in publications if t.post_id == post.id and t.status != "cancelled"]} for post in posts]


def read_sources(db: Session) -> dict:
    defaults = {"calendar": False, "news": False, "team": True}
    rows = db.scalars(select(SourceSetting)).all()
    for row in rows: defaults[row.key] = row.enabled
    return {"sources": defaults, "connections": connections_dto(db), "events": [], "accounts": accounts_dto(db)}


def read_logs(db: Session) -> list[dict]:
    since = datetime.now(UTC) - timedelta(hours=24)
    rows = db.execute(select(AuditEvent, User.name).outerjoin(User, AuditEvent.actor_user_id == User.id)
                      .where(AuditEvent.created_at >= since).order_by(AuditEvent.created_at.desc()).limit(200)).all()
    logs = []
    for event, actor_name in rows:
        action = event.action.replace("_", " ").replace(".", " · ")
        level = "success" if event.action.endswith((".approve", ".login", ".created")) else "info"
        logs.append({"id": str(event.id), "at": event.created_at.isoformat(), "actor": actor_name or "System", "level": level,
                     "message": action[:1].upper() + action[1:], "detail": event.resource_type,
                     "cause": None, "fix": None, "done": True})
    jobs = db.execute(select(WorkJob, User.name).outerjoin(User, WorkJob.actor_id == User.id).where(WorkJob.updated_at >= since).order_by(WorkJob.updated_at.desc()).limit(200)).all()
    return sorted([*logs, *({**job_dto(job), "actor": actor_name or "System"} for job, actor_name in jobs)], key=lambda item: item["at"], reverse=True)[:300]


def mutate_sources(db: Session, user: User, request: Request, command: dict) -> dict:
    require_permission(user, "sources.manage")
    if command.get("action") == "sync-accounts":
        sync_accounts(db)
        audit(db, user, request, "provider.accounts_synced", "zernio", "accounts", {})
        db.commit()
        return {"message": "Accounts synced. Select the exact Facebook and Instagram accounts to use."}
    if command.get("action") == "select-account":
        from app.models import ProviderAccount
        target = db.get(ProviderAccount, str(command.get("id")))
        if not target or not target.active:
            raise HTTPException(422, "Choose an active synced account.")
        accounts = db.scalars(select(ProviderAccount).where(ProviderAccount.platform == target.platform).with_for_update()).all()
        for account in accounts:
            account.selected = account.id == target.id
        audit(db, user, request, "provider.account_selected", "zernio", target.id, {})
        db.commit()
        return {"message": "Publishing account selected"}
    if command.get("action") == "reconnect":
        return {"message": "Open Zernio Connections to reconnect the account, then Sync accounts here.", "url": "https://zernio.com/dashboard/connections"}
    if command.get("action") != "toggle":
        raise HTTPException(status_code=503, detail="Provider connection changes are not synced with the app yet.")
    key = command.get("key")
    value = command.get("value")
    if key not in {"calendar", "news", "team"} or not isinstance(value, bool):
        raise HTTPException(status_code=422, detail="Choose a valid source and enabled state")
    if key != "team" and value:
        raise HTTPException(422, "External sources are deferred. Manual team topics are available now.")
    setting = db.get(SourceSetting, key)
    if setting is None:
        setting = SourceSetting(key=key, enabled=value, updated_by=user.id)
        db.add(setting)
    else:
        setting.enabled = value; setting.updated_by = user.id
    audit(db, user, request, "source.setting_updated", "source_setting", str(key), {"enabled": value})
    db.commit()
    return {"message": "Source preference saved. Feed ingestion is a separate integration step."}


def mutate_post(db: Session, user: User, request: Request, command: dict) -> dict:
    action = command.get("action")
    if action in {"generate", "generate-all", "revise", "new-angle", "suggest", "generate-media"}:
        return generation_command(db, user, command)
    permissions = {"create": "ideas.create", "pick": "ideas.pick", "unpick": "ideas.pick", "note": "content.edit",
                   "update": "content.edit", "configure": "content.edit", "remove-media": "media.upload", "reopen": "content.edit", "approve": "review.approve", "reject": "review.approve",
                   "archive": "content.archive", "restore": "content.archive", "skip": "content.archive"}
    if action in permissions:
        require_permission(user, permissions[action])
    module = "Review" if action in {"approve", "reject", "revise"} else "Board" if action in {"archive", "restore", "unpick"} else "Ideas"
    if action == "create":
        title = str(command.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=422, detail="Type a topic first")
        if len(title) > 180:
            raise HTTPException(status_code=422, detail="Topic must be 180 characters or fewer")
        note = command.get("note", "")
        if not isinstance(note, str) or len(note.strip()) > 1000:
            raise HTTPException(422, "Optional input must be 1,000 characters or fewer")
        payload = {**POST_DEFAULTS, "title": title, "note": note.strip()}
        post = StudioPost(stage="idea", version=1, payload=payload, version_history=[], created_by=user.id, updated_by=user.id)
        db.add(post)
        db.flush()
        audit(db, user, request, "post.idea_created", "studio_post", str(post.id), {})
        db.commit()
        return {"message": "Added to Ideas"}

    try:
        post_id = int(command.get("id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid post ID") from None
    post = db.scalar(select(StudioPost).where(StudioPost.id == post_id).with_for_update())
    if post is None:
        raise HTTPException(status_code=404, detail="Post not found")
    post.stage = workflow_stage(post)
    if db.scalar(select(WorkJob.id).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE))):
        raise HTTPException(409, "Wait for the current background job before changing this post.")
    if action == "update" and post.stage == "review" and user.role != "admin" and "Review" not in user.module_access:
        raise HTTPException(status_code=403, detail="You do not have permission to edit a post in Review")
    if command.get("version") is not None:
        try:
            expected_version = int(command["version"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Invalid post version") from None
        if expected_version != post.version:
            raise HTTPException(status_code=409, detail="This post changed in another session. Refresh and try again.")

    message = ""
    if action == "reopen":
        if post.stage != "scheduled" and not (post.stage == "review" and post.approved_version == post.version):
            raise HTTPException(409, "Only an approved post can be reopened.")
        targets = db.scalars(select(Publication).where(Publication.post_id == post.id, Publication.status != "cancelled")).all()
        if any(t.provider_id or t.status != "held" for t in targets):
            raise HTTPException(409, "Cancel the provider schedule and wait for confirmation before editing this post.")
        post.stage = "review"
        post.approved_version = None
        message = "Reopened for editing. Approval is required again."
    elif action == "configure":
        if post.stage not in {"idea", "selected", "review"}:
            raise HTTPException(409, "Format and platform can be changed before approval only.")
        if command.get("format") not in {"image", "carousel", "video"} or command.get("platform") not in {"Facebook", "Instagram"}:
            raise HTTPException(422, "Choose a valid format and platform.")
        targets = db.scalars(select(Publication).where(Publication.post_id == post.id, Publication.status != "cancelled")).all()
        for target in targets:
            target.status = "cancelled"
        snapshot_post(post, "Format or platform changed")
        post.payload = {**post.payload, "format": command["format"], "platform": command["platform"], "scheduledAt": None,
                        "platforms": [command["platform"]], "media": [] if command["format"] != post.payload["format"] else post.payload.get("media", [])}
        post.version += 1
        post.approved_version = None
        if post.stage != "idea":
            post.stage = editable_stage(post)
        message = "Format and platform saved"
    elif action == "remove-media":
        if post.stage not in {"selected", "review"}:
            raise HTTPException(409, "Attachments can only be changed before approval.")
        media = post.payload.get("media", [])
        kept = [item for item in media if item["id"] != command.get("assetId")]
        if len(kept) == len(media):
            raise HTTPException(404, "Attachment not found")
        snapshot_post(post, "Attachment removed")
        post.version += 1
        post.approved_version = None
        post.payload = {**post.payload, "media": kept}
        post.stage = editable_stage(post)
        message = "Attachment removed"
    elif action == "pick":
        if post.stage != "idea":
            raise HTTPException(status_code=409, detail="Only an idea can be picked")
        post.stage = "selected"
        message = "Picked. Add a draft caption or connect AI generation next."
    elif action == "unpick":
        if post.stage != "selected":
            raise HTTPException(status_code=409, detail="Only a picked idea can be moved back")
        post.stage = "idea"
        message = "Moved back to Ideas"
    elif action in {"skip", "archive", "reject"}:
        if post.stage in {"scheduled", "published"}:
            raise HTTPException(status_code=409, detail="Scheduled or published posts cannot be archived here")
        if action == "reject" and post.stage != "review":
            raise HTTPException(status_code=409, detail="Only a post in review can be rejected")
        if action == "reject":
            require_approver(user)
        post.stage = "archived"
        for target in db.scalars(select(Publication).where(Publication.post_id == post.id, Publication.status == "held")):
            target.status = "cancelled"
        post.payload = {**post.payload, "scheduledAt": None, "day": None, "time": None, "archiveReason": "Rejected by approver" if action == "reject" else "Skipped by team"}
        message = "Moved to Archive"
    elif action == "restore":
        if post.stage != "archived":
            raise HTTPException(status_code=409, detail="Only archived posts can be restored")
        post.stage = "idea"
        post.approved_version = None
        post.payload = {key: value for key, value in post.payload.items() if key != "archiveReason"}
        message = "Back in Ideas"
    elif action == "note":
        note = str(command.get("note") or "").strip()
        if not note:
            raise HTTPException(status_code=422, detail="Type your input first")
        if len(note) > 1000:
            raise HTTPException(status_code=422, detail="Notes must be 1,000 characters or fewer")
        snapshot_post(post, "Idea input edited")
        post.version += 1
        post.payload = {**post.payload, "note": note, "versionReason": "Idea input edited"}
        message = "Input saved"
    elif action == "update":
        if post.stage not in {"selected", "review"}:
            raise HTTPException(status_code=409, detail="Drafts can only be edited after picking an idea")
        changed = {key: command[key].strip() for key in ("caption", "tags", "script", "mediaBrief", "videoDirection", "note") if isinstance(command.get(key), str)}
        if not changed:
            raise HTTPException(status_code=422, detail="Add a caption or tags before saving")
        if "caption" in changed and (not changed["caption"] or len(changed["caption"]) > 5000):
            raise HTTPException(status_code=422, detail="Caption must contain 1 to 5,000 characters")
        if "tags" in changed and len(changed["tags"]) > 500:
            raise HTTPException(status_code=422, detail="Hashtags must be 500 characters or fewer")
        if any(len(changed.get(key, "")) > 5000 for key in ("script", "mediaBrief", "videoDirection")):
            raise HTTPException(422, "Script and media directions must be 5,000 characters or fewer")
        if len(changed.get("note", "")) > 1000:
            raise HTTPException(422, "Idea input must be 1,000 characters or fewer")
        snapshot_post(post, "Content edited")
        post.version += 1
        post.approved_version = None
        post.payload = {**post.payload, **changed, "versionReason": "Content edited"}
        post.stage = editable_stage(post)
        save_checks(db, post)
        message = "Draft saved to Review" if post.stage == "review" else "Draft saved. Add media to send it to Review."
    elif action == "approve":
        require_approver(user)
        if post.stage != "review":
            raise HTTPException(status_code=409, detail="Only a post in Review can be approved")
        if not str(post.payload.get("caption") or "").strip():
            raise HTTPException(status_code=422, detail="Add a caption before approval")
        if not post.payload.get("media"):
            raise HTTPException(422, "Attach or generate media before approval.")
        if not save_checks(db, post)["passed"]:
            db.commit()
            raise HTTPException(422, "Resolve the brand violations before approval.")
        post.stage = "review"
        post.approved_version = post.version
        post.payload = {**post.payload, "approvedBy": user.name, "approvedPlatforms": post.payload.get("platforms", [post.payload["platform"]])}
        message = "Approved. Choose a posting slot and save the schedule to move this post to Scheduled."
    else:
        raise HTTPException(status_code=422, detail="Unknown post command")

    post.updated_by = user.id
    audit(db, user, request, f"post.{action}", "studio_post", str(post.id), {"stage": post.stage, "version": post.version})
    db.commit()
    return {"message": message, "version": post.version}


def audit(db: Session, user: User, request: Request, action: str, resource_type: str, resource_id: str, details: dict) -> None:
    db.add(AuditEvent(actor_user_id=user.id, action=action, resource_type=resource_type, resource_id=resource_id,
                      request_id=request.headers.get("x-request-id"), details=details))


def require_approver(user: User) -> None:
    require_permission(user, "review.approve")


def mutate_team(db: Session, user: User, request: Request, command: dict) -> dict:
    require_admin(user)
    action = command.get("action")
    if action in {"invite", "resend"}:
        if action == "resend":
            try:
                target = db.get(User, UUID(str(command.get("id"))))
            except ValueError:
                raise HTTPException(422, "Invalid user ID") from None
            if not target or target.active:
                raise HTTPException(409, "Only pending users can be invited again.")
            command = {**command, "email": target.email, "name": target.name, "role": target.role, "isApprover": target.is_approver}
        try:
            email = validate_email(str(command.get("email") or "").strip(), check_deliverability=False).normalized.casefold()
        except EmailNotValidError:
            raise HTTPException(status_code=422, detail="Enter a valid email address") from None
        role = ROLE_TO_API.get(str(command.get("role") or ""))
        if role is None or (role == "admin" and action != "resend"):
            raise HTTPException(status_code=422, detail="Choose a non-admin role")
        existing = db.scalar(select(User).where(User.email == email).with_for_update())
        if existing and (existing.active or not existing.invited):
            raise HTTPException(status_code=409, detail="A user with this email already exists")
        name = str(command.get("name") or email.split("@", 1)[0]).strip()[:160]
        approver_flag = command.get("isApprover", False)
        if not isinstance(approver_flag, bool):
            raise HTTPException(status_code=422, detail="Approver setting must be true or false")
        new_user = existing or User(email=email, name=name or email, role=role, password_hash=hash_password(secrets.token_urlsafe(32)), active=False, invited=True, module_access=ROLE_MODULES[role])
        new_user.name = name or email
        new_user.role = role
        new_user.active = False
        new_user.invited = True
        new_user.is_approver = approver_flag or role == "approver"
        if not existing:
            new_user.module_access = ROLE_MODULES[role]
        db.add(new_user)
        db.flush()
        token = secrets.token_urlsafe(32)
        invitation = db.scalar(select(Invitation).where(Invitation.user_id == new_user.id).with_for_update())
        if invitation is None:
            invitation = Invitation(user_id=new_user.id, token_hash=hash_session_token(token), expires_at=datetime.now(UTC) + timedelta(hours=48), created_by=user.id)
            db.add(invitation)
        else:
            invitation.token_hash = hash_session_token(token)
            invitation.expires_at = datetime.now(UTC) + timedelta(hours=48)
            invitation.consumed_at = None
            invitation.created_by = user.id
        db.add(AuditEvent(actor_user_id=user.id, action="team.invitation_created", resource_type="user", resource_id=str(new_user.id), request_id=request.headers.get("x-request-id"), details={"email": email, "role": role}))
        db.commit()
        from app.mail import send_invitation
        try:
            sent = send_invitation(email, token)
            mail_status = "completed" if sent else "failed"
            cause = None if sent else "SMTP sender configuration is missing."
        except Exception:
            sent, mail_status, cause = False, "failed", "Invite email delivery failed."
        db.add(WorkJob(kind="invite_email", provider="SMTP", actor_id=user.id, status=mail_status, attempts=1,
            payload={}, result={}, history=[], cause=cause, fix=None if sent else "Check SMTP settings, then resend the invitation from Team.", next_run=datetime.now(UTC)))
        db.commit()
        return {"message": "Invitation emailed" if sent else "Invite created. Email unavailable; copy the link or configure SMTP and resend.",
                "activationToken": None if sent else token, "emailSent": sent, "expiresInHours": 48}

    try:
        target_id = UUID(str(command.get("id")))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid team member ID") from None
    target = db.get(User, target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Team member not found")
    if action == "role":
        role = ROLE_TO_API.get(str(command.get("role") or ""))
        if role is None:
            raise HTTPException(status_code=422, detail="Unknown team role")
        if target.role == "admin" and role != "admin" and db.scalar(select(User.id).where(User.role == "admin", User.active.is_(True), User.id != target.id).limit(1)) is None:
            raise HTTPException(status_code=409, detail="The last active admin cannot be demoted")
        target.role = role
        target.module_access = ROLE_MODULES[role]
        target.is_approver = target.is_approver or role == "approver"
    elif action == "access":
        module = str(command.get("module") or "")
        if module not in MODULES:
            raise HTTPException(status_code=422, detail="Unknown module")
        access = list(target.module_access)
        access = [item for item in access if item != module] if module in access else [*access, module]
        target.module_access = access
    elif action == "approver":
        if not isinstance(command.get("value"), bool):
            raise HTTPException(status_code=422, detail="Approver setting must be true or false")
        target.is_approver = command["value"]
        target.permissions = {**target.permissions, "review.approve": command["value"]}
    elif action == "permission":
        key = command.get("permission")
        if key not in PERMISSIONS or not isinstance(command.get("value"), bool):
            raise HTTPException(422, "Choose a valid action permission")
        if target.role == "admin":
            raise HTTPException(409, "Super admins always retain full access.")
        target.permissions = {**target.permissions, key: command["value"]}
        if key == "review.approve":
            target.is_approver = command["value"]
    else:
        raise HTTPException(status_code=422, detail="Unknown team command")
    db.add(AuditEvent(actor_user_id=user.id, action=f"team.{action}_updated", resource_type="user", resource_id=str(target.id), request_id=request.headers.get("x-request-id"), details={"role": target.role, "isApprover": target.is_approver}))
    db.commit()
    return {"message": "Team settings saved"}


@router.get("/{resource}")
def get_setting_resource(
    resource: str,
    request: Request,
    session_data: tuple[User, AuthSession] = Depends(current_user_and_session),
    db: Session = Depends(get_db),
):
    user = session_data[0]
    if resource == "brand":
        return read_brand(db)
    if resource == "spend":
        return read_spend(db)
    if resource == "team":
        return read_team(db, user)
    if resource == "posts":
        return read_posts(db)
    if resource == "sources":
        return read_sources(db)
    if resource == "logs":
        require_permission(user, "logs.view")
        return read_logs(db)
    if resource == "schedule":
        return read_posts(db)
    if resource == "calendar":
        if user.role != "admin" and "Schedule" not in user.module_access:
            raise HTTPException(403, "Schedule access required")
        try:
            start = datetime.fromisoformat(request.query_params["start"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(request.query_params["end"].replace("Z", "+00:00"))
            if not start.tzinfo or not end.tzinfo or not timedelta(0) < end - start <= timedelta(days=63):
                raise ValueError()
        except (ValueError, KeyError):
            raise HTTPException(422, "Provide a valid calendar range of at most 63 days with timezone offsets.") from None
        return [post for post in read_posts(db) if post.get("scheduledAt") and start <= datetime.fromisoformat(post["scheduledAt"]) < end]
    raise HTTPException(status_code=404, detail="Settings resource not found")


@router.post("/{resource}")
def post_setting_resource(
    resource: str,
    request: Request,
    command: dict,
    session_data: tuple[User, AuthSession] = Depends(current_user_and_session),
    db: Session = Depends(get_db),
):
    user, session = session_data
    require_csrf(request, session)
    if resource == "brand":
        return mutate_brand(db, user, request, command)
    if resource == "spend":
        return mutate_spend(db, user, request, command)
    if resource == "team":
        return mutate_team(db, user, request, command)
    if resource == "posts":
        return mutate_post(db, user, request, command)
    if resource == "sources":
        return mutate_sources(db, user, request, command)
    if resource == "schedule":
        return schedule_command(db, user, command)
    if resource == "logs":
        from app.workflow import retry_job
        return retry_job(db, user, command)
    raise HTTPException(status_code=404, detail="Settings resource not found")
