"""Application commands shared by API routes and the existing page contract."""
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select

from app.config import settings
from app.jobs import ACTIVE, brand_snapshot, queue, save_checks, schedule_job
from app.models import ProviderAccount, Publication, StudioPost, User, WorkJob
from app.permissions import effective_permissions, require_permission
from app.providers import ProviderError, Zernio


def generation_command(db, user, command):
    action = command.get("action")
    permission = "ideas.suggest" if action in {"suggest", "new-angle"} else "media.generate" if action == "generate-media" else "content.generate"
    require_permission(user, permission)
    if action != "generate-media" and not (settings.openrouter_api_key and settings.openrouter_model):
        raise HTTPException(503, "Configure OPENROUTER_API_KEY and OPENROUTER_MODEL on Hostinger first.")
    policy = brand_snapshot(db)
    if action == "suggest":
        topics = db.scalars(select(StudioPost).where(StudioPost.stage == "idea").order_by(StudioPost.created_at.desc()).with_for_update()).all()
        manual = [{"id": post.id, "title": post.payload["title"], "note": post.payload.get("note", ""), "source": "team"}
                  for post in topics if post.payload.get("human")][:20]
        if not manual:
            raise HTTPException(422, "Add a manual topic before suggesting AI ideas.")
        queue(db, "suggest", "OpenRouter", user.id, payload={"topics": manual, "brand": policy})
    else:
        query = select(StudioPost).with_for_update()
        if action == "generate-all":
            query = query.where(StudioPost.stage == "selected")
        else:
            try:
                query = query.where(StudioPost.id == int(command.get("id")))
            except (TypeError, ValueError):
                raise HTTPException(422, "Invalid post ID") from None
        posts = list(db.scalars(query))
        if not posts:
            raise HTTPException(404, "No picked posts found")
        for post in posts:
            if db.scalar(select(WorkJob.id).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE))):
                raise HTTPException(409, "This post already has a background job running.")
            if command.get("version") is not None and command["version"] != post.version:
                raise HTTPException(409, "This post changed. Refresh and try again.")
            if action == "new-angle":
                if post.stage != "idea":
                    raise HTTPException(409, "New angles are available for ideas only.")
                queue(db, "new_angle", "OpenRouter", user.id, post.id,
                      {"topics": [{"id": post.id, "title": post.payload["title"], "note": post.payload.get("note", "")}], "brand": policy})
                continue
            if action == "generate-media":
                if post.stage not in {"selected", "review"}:
                    raise HTTPException(409, "Pick an idea and add a draft before generating media.")
                if not post.payload.get("caption"):
                    raise HTTPException(422, "Write or generate a caption first.")
                if not save_checks(db, post)["passed"]:
                    raise HTTPException(422, "Resolve the brand violations before generating media.")
                provider = "Creatify" if post.payload["format"] == "video" else "Predis"
                configured = (settings.creatify_api_key and settings.creatify_api_id) if provider == "Creatify" else (settings.predis_api_key and settings.predis_brand_id)
                if not configured:
                    requirement = "API credentials" if provider == "Creatify" else "API key and brand ID"
                    raise HTTPException(503, f"Configure {provider} {requirement} on Hostinger first.")
                if provider == "Creatify":
                    voiceover = post.payload.get("script") or post.payload["caption"]
                    direction = post.payload.get("videoDirection") or post.payload.get("mediaBrief") or ""
                    brief = ("[VISUAL]\n"
                             f"{direction}\n"
                             "Make this a cinematic vertical social video with 3 distinct shots: an establishing shot, a close detail/action shot, "
                             "and a closing shot. Use visible camera movement and a clear change in action or framing between shots. "
                             "If the direction above asks for words or labels, ignore that part and show blank, unmarked props. "
                             "Do not include any speech in this visual prompt.\n\n"
                             "[SOUNDS]\n"
                             "No extra speech or sound effects. The separately supplied voiceover audio is the only audio.\n\n"
                             "[TEXT]\n"
                             "None. Do not render any visible text, captions, subtitles, labels, signs, letters, numbers, or logos.\n\n"
                             f"Brand style: {policy['voice']}. Follow these brand rules: {policy['rules']}. "
                             "Use cinematic book-related b-roll, not a talking avatar.")
                    duration = max(10, min(60, (len(voiceover.split()) * 60 + 139) // 140))
                else:
                    # Give Predis both the post context and AI-authored visual direction.
                    # Treat caption facts as context only; do not ask the image model to
                    # reproduce claims or text that a human has not verified.
                    brief = "\n".join((
                        "Create one social image for BookLender using the following brief.",
                        f"Book/topic: {post.payload.get('title', '')}",
                        f"Additional idea input: {post.payload.get('note', '')}",
                        f"Caption context (do not copy claims or quotes into the image): {post.payload.get('caption', '')}",
                        f"Hashtags/context: {post.payload.get('tags', '')}",
                        f"Visual direction: {post.payload.get('mediaBrief') or post.payload.get('caption', '')}",
                        f"Style guidance for {post.payload.get('format', 'image')}: {(policy.get('formats') or {}).get(post.payload.get('format', 'image'), {}).get('guidance', '')}",
                        f"Brand voice: {policy['voice']}",
                        f"Brand rules: {policy['rules']}",
                        "Do not add text, quotes, prices, discounts, stock, availability, delivery, or other factual claims.",
                        "Do not imitate or invent an exact book cover. Use an uploaded approved cover only if one is provided.",
                    ))
                queue(db, "media", provider, user.id, post.id,
                      {"brief": brief, "brand": policy, **({"duration": duration, "voiceover": voiceover} if provider == "Creatify" else {})})
            else:
                if post.stage not in ({"review"} if action == "revise" else {"selected"}):
                    raise HTTPException(409, "Pick an idea before generation, or revise a post in Review.")
                note = "\n".join(str(command.get(key) or "").strip() for key in ("reason", "note")).strip()[:1000]
                queue(db, "revise" if action == "revise" else "write", "OpenRouter", user.id, post.id, {"note": note, "brand": policy})
            post.approved_version = None
            post.stage = "revision" if action == "revise" else "generating"
            post.payload = {**post.payload, "error": None}
    db.commit()
    return {"message": "Queued. Progress and failures will appear in Board and Logs."}


def accounts_dto(db):
    return [{"id": account.id, "platform": account.platform, "name": account.name, "active": account.active,
             "selected": account.selected, "syncedAt": account.synced_at.isoformat()}
            for account in db.scalars(select(ProviderAccount).order_by(ProviderAccount.platform, ProviderAccount.name))]


def sync_accounts(db):
    remote = Zernio().accounts()
    accounts = {account.id: account for account in db.scalars(select(ProviderAccount).with_for_update())}
    for account in accounts.values():
        account.active = False
    for entry in remote:
        platform = entry.get("platform")
        if platform not in {"facebook", "instagram"}:
            continue
        identifier = str(entry["_id"])
        account = accounts.get(identifier)
        if not account:
            account = ProviderAccount(id=identifier, platform=platform, selected=False)
            db.add(account)
        account.name = str(entry.get("displayName") or entry.get("username") or platform)[:180]
        account.active = entry.get("isActive") is True
        account.synced_at = datetime.now(UTC)
    db.commit()


def connections_dto(db):
    accounts = list(db.scalars(select(ProviderAccount)))
    result = []
    for platform, identifier in (("instagram", "ig"), ("facebook", "fb")):
        account = next((a for a in accounts if a.platform == platform and a.selected), None)
        result.append({"id": identifier, "name": platform.title(), "purpose": "Publishing",
                       "connected": bool(account and account.active), "detail": account.name if account else "Sync accounts, then select the correct publishing account."})
    for identifier, name, configured in (("openrouter", "OpenRouter", settings.openrouter_api_key and settings.openrouter_model),
                                       ("predis", "Predis", settings.predis_api_key and settings.predis_brand_id),
                                       ("creatify", "Creatify", settings.creatify_api_key and settings.creatify_api_id)):
        result.append({"id": identifier, "name": name, "purpose": "Generation", "connected": False,
                       "detail": "Configured; API access is verified when a job runs." if configured else "Server credentials missing."})
    return result


def parse_schedule(value: str):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        zone = ZoneInfo("America/New_York")
        if parsed.tzinfo is None:
            local = parsed.replace(tzinfo=zone)
            # Reject nonexistent and repeated wall times; an explicit offset resolves repeated hours.
            if local.astimezone(UTC).astimezone(zone).replace(tzinfo=None) != parsed:
                raise ValueError("This Eastern time does not exist because clocks change. Choose another time.")
            if local.utcoffset() != parsed.replace(tzinfo=zone, fold=1).utcoffset():
                raise ValueError("This Eastern time repeats when clocks change. Choose another hour.")
            parsed = local
        parsed = parsed.astimezone(UTC)
        if parsed <= datetime.now(UTC) + timedelta(minutes=2):
            raise ValueError("Choose a time at least two minutes in the future.")
        return parsed
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from None


def schedule_command(db, user, command):
    require_permission(user, "schedule.manage")
    try:
        post = db.scalar(select(StudioPost).where(StudioPost.id == int(command.get("id"))).with_for_update())
    except (TypeError, ValueError):
        raise HTTPException(422, "Choose a valid post") from None
    if not post:
        raise HTTPException(404, "Post not found")
    if command.get("version") != post.version:
        raise HTTPException(409, "This post changed. Refresh before scheduling.")
    if post.stage not in {"review", "scheduled"}:
        raise HTTPException(409, "Send the post to Review before choosing its schedule.")
    targets = list(db.scalars(select(Publication).where(Publication.post_id == post.id, Publication.status != "cancelled").with_for_update()))
    active_jobs = list(db.scalars(select(WorkJob).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE))))
    if any(job.status == "running" for job in active_jobs):
        raise HTTPException(409, "Wait for the current provider request before changing its schedule.")
    if any(job.kind == "publish" and job.attempts > 0 and not job.provider_id for job in active_jobs):
        raise HTTPException(409, "A Zernio request is being reconciled. Wait for its provider ID before changing or cancelling it.")
    if any(t.status == "publishing" for t in targets):
        raise HTTPException(409, "Wait for a publishing target to finish before changing the schedule.")
    action = command.get("action")
    if action not in {"save", "cancel", "retry"}:
        raise HTTPException(422, "Choose save, cancel or retry for a schedule.")
    if action == "cancel":
        require_permission(user, "publish.send")
        for target in targets:
            if target.status == "published":
                continue
            jobs = db.scalars(select(WorkJob).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE), WorkJob.payload["publicationId"].as_string() == str(target.id))).all()
            if any(job.status == "running" for job in jobs):
                raise HTTPException(409, "Publication is processing. Wait for its current status before cancelling.")
            for job in jobs:
                job.status = "cancelled"
            if target.provider_id:
                queue(db, "cancel", "Zernio", user.id, post.id, {"publicationId": str(target.id)})
                target.status = "cancelling"
            else:
                target.status = "cancelled"
        status = "cancelling" if any(t.status == "cancelling" for t in targets) else "published" if any(t.status == "published" for t in targets) else "held"
        if status == "published":
            post.stage = "published"
        post.payload = {**post.payload, "scheduledAt": None, "day": None, "time": None, "publicationStatus": status}
    elif action == "retry":
        require_permission(user, "publish.send")
        if post.approved_version != post.version:
            raise HTTPException(409, "Approve the current version before retrying publication.")
        for target in targets:
            if target.status == "published":
                continue
            if target.provider_id and target.status == "failed":
                if target.scheduled_at <= datetime.now(UTC) + timedelta(minutes=2):
                    raise HTTPException(409, "Choose a future time before retrying a failed publication.")
                queue(db, "reschedule", "Zernio", user.id, post.id, {"publicationId": str(target.id)})
                continue
            job = db.scalar(select(WorkJob).where(WorkJob.kind == "publish", WorkJob.payload["publicationId"].as_string() == str(target.id)).order_by(WorkJob.created_at.desc()))
            if job:
                job.status = "waiting" if job.provider_id else "queued"
                job.next_run = datetime.now(UTC)
                job.cause = job.fix = None
    else:
        scheduled_at = parse_schedule(str(command.get("scheduledAt", "")))
        platforms = command.get("platforms") or [post.payload["platform"]]
        if not isinstance(platforms, list) or not platforms or any(p not in {"Facebook", "Instagram"} for p in platforms):
            raise HTTPException(422, "Select Facebook and/or Instagram.")
        if post.approved_version == post.version and set(platforms) != set(post.payload.get("approvedPlatforms", [post.payload["platform"]])):
            if any(t.provider_id for t in targets):
                raise HTTPException(409, "Cancel the existing provider schedule before changing its approved platforms.")
            post.approved_version = None
            post.stage = "review"
        if any(target.status == "cancelling" for target in targets):
            raise HTTPException(409, "Wait for Zernio to confirm cancellation before scheduling again.")
        if targets and any(t.provider_id for t in targets):
            if {t.platform for t in targets} != {p.lower() for p in platforms}:
                raise HTTPException(409, "Cancel the existing schedule before changing its platforms.")
            require_permission(user, "publish.send")
            for target in targets:
                if target.status == "published":
                    continue
                jobs = list(db.scalars(select(WorkJob).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE), WorkJob.payload["publicationId"].as_string() == str(target.id))))
                if any(job.status == "running" for job in jobs):
                    raise HTTPException(409, "The provider is processing this post. Wait and try again.")
                for job in jobs:
                    job.status = "cancelled"
                target.scheduled_at = scheduled_at
                if target.provider_id:
                    queue(db, "reschedule", "Zernio", user.id, post.id, {"publicationId": str(target.id)})
                else:
                    schedule_job(db, target, user.id)
        else:
            for job in active_jobs:
                job.status = "cancelled"
            for target in targets:
                target.status = "cancelled"
            for name in set(platforms):
                account = db.scalar(select(ProviderAccount).where(ProviderAccount.platform == name.lower(), ProviderAccount.selected.is_(True), ProviderAccount.active.is_(True)))
                if not account:
                    raise HTTPException(422, f"Sync and select the {name} account first.")
                target = Publication(post_id=post.id, version=post.version, platform=name.lower(), account_id=account.id,
                                     scheduled_at=scheduled_at, status="held")
                db.add(target)
                db.flush()
                if post.approved_version == post.version and effective_permissions(user).get("publish.send"):
                    schedule_job(db, target, user.id)
                    target.status = "queued"
        post.payload = {**post.payload, "scheduledAt": scheduled_at.isoformat(), "platforms": platforms,
                        "scheduleRequestedBy": str(user.id), "autoSendAuthorized": effective_permissions(user).get("publish.send", False),
                        "publicationStatus": "queued" if post.approved_version == post.version and effective_permissions(user).get("publish.send") else "held"}
    db.commit()
    return {"message": "Schedule saved. Only approved versions with publishing permission are sent to Zernio."}


def release_approved(db, post):
    if not post.payload.get("autoSendAuthorized"):
        return
    actor = db.get(User, UUID(post.payload["scheduleRequestedBy"]))
    if not actor or not actor.active or not effective_permissions(actor).get("publish.send"):
        return
    for target in db.scalars(select(Publication).where(Publication.post_id == post.id, Publication.status == "held")):
        target.version = post.version
        schedule_job(db, target, actor.id)
        target.status = "queued"


def retry_job(db, user, command):
    require_permission(user, "jobs.retry")
    try:
        job = db.scalar(select(WorkJob).where(WorkJob.id == UUID(str(command.get("id")))).with_for_update())
    except ValueError:
        raise HTTPException(422, "Invalid job ID") from None
    if not job or job.status not in {"failed", "needs_attention"}:
        raise HTTPException(409, "Only failed jobs can be retried.")
    if job.kind == "invite_email":
        raise HTTPException(422, "Resend this invitation from Team to issue a fresh activation link.")
    if job.status == "needs_attention" and command.get("confirmedProviderCheck") is not True:
        raise HTTPException(409, "Inspect the provider dashboard first; this request may already have incurred a charge.")
    permission = "ideas.suggest" if job.kind in {"suggest", "new_angle"} else "media.generate" if job.kind == "media" else "publish.send" if job.provider == "Zernio" else "content.generate"
    require_permission(user, permission)
    if job.provider == "Zernio":
        raise HTTPException(422, "Retry or choose a future time from Schedule so approval and timing are checked.")
    post = db.scalar(select(StudioPost).where(StudioPost.id == job.post_id).with_for_update()) if job.post_id else None
    if post and post.stage not in {"selected", "review", "idea"}:
        raise HTTPException(409, "This post is no longer editable. Create a new draft instead.")
    if post and db.scalar(select(WorkJob.id).where(WorkJob.post_id == post.id, WorkJob.status.in_(ACTIVE))):
        raise HTTPException(409, "Another job is already processing this post.")
    job.actor_id = user.id
    job.status = "waiting" if job.provider_id and job.kind == "media" else "queued"
    job.next_run = datetime.now(UTC)
    job.cause = job.fix = None
    if post and job.kind in {"write", "revise", "media"}:
        post.stage = "generating"
        post.approved_version = None
        post.payload = {**post.payload, "error": None}
    db.commit()
    return {"message": "Retry queued"}
