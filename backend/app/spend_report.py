"""Provider usage reporting. Amounts and credits are never mixed."""
from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SpendEntry, StudioPost, WorkJob
from app.predis_account import read_predis_balance


def _number(value):
    try:
        result = float(value)
        return result if 0 <= result < 1_000_000_000 else None
    except (TypeError, ValueError):
        return None


def _openrouter_balance() -> dict:
    balance = {"remainingUsd": None, "balanceScope": None, "usageTodayUsd": None,
               "status": "unavailable"}
    if not settings.openrouter_api_key:
        balance["status"] = "not_configured"
        return balance
    try:
        with httpx.Client(timeout=8) as client:
            key_response = client.get("https://openrouter.ai/api/v1/key", headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}"})
            key_response.raise_for_status()
            key_data = key_response.json().get("data") or {}
            balance["usageTodayUsd"] = _number(key_data.get("usage_daily"))
            if settings.openrouter_management_key:
                credits_response = client.get("https://openrouter.ai/api/v1/credits", headers={
                    "Authorization": f"Bearer {settings.openrouter_management_key}"})
                credits_response.raise_for_status()
                credits = credits_response.json().get("data") or {}
                total = _number(credits.get("total_credits"))
                used = _number(credits.get("total_usage"))
                if total is not None and used is not None:
                    balance.update(remainingUsd=max(0, total - used), balanceScope="account")
            elif key_data.get("limit") is not None:
                balance.update(remainingUsd=_number(key_data.get("limit_remaining")), balanceScope="key limit")
            balance["status"] = "ok"
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        balance["status"] = "unavailable"
    return balance


def _creatify_balance() -> dict:
    """Read the documented Workspace credit balance without guessing from plan size."""
    if not settings.creatify_api_id or not settings.creatify_api_key:
        return {"remainingCredits": None, "balanceStatus": "not_configured"}
    try:
        with httpx.Client(timeout=8) as client:
            response = client.get("https://api.creatify.ai/api/remaining_credits/", headers={
                "X-API-ID": settings.creatify_api_id,
                "X-API-KEY": settings.creatify_api_key,
            })
            response.raise_for_status()
            remaining = _number(response.json().get("remaining_credits"))
            if remaining is not None:
                return {"remainingCredits": remaining, "balanceStatus": "ok"}
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        pass
    return {"remainingCredits": None, "balanceStatus": "unavailable"}


def _historical_predis_credits(job: WorkJob, post: StudioPost | None) -> float | None:
    """Estimate a legacy job only when its generated media can be recovered."""
    if not post or not job.updated_at:
        return None
    snapshots = post.version_history or []
    generation = []
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        if snapshot.get("reason") != "AI media generated":
            continue
        try:
            at = datetime.fromisoformat(snapshot["at"])
            distance = abs((job.updated_at - at).total_seconds())
        except (KeyError, TypeError, ValueError):
            continue
        if distance <= 300:
            generation.append((distance, snapshot))
    if not generation:
        return None
    snapshot = min(generation, key=lambda item: item[0])[1]
    if not isinstance(snapshot.get("version"), int):
        return None
    output_version = snapshot["version"] + 1
    if post.version == output_version:
        media = (post.payload or {}).get("media")
    else:
        next_snapshot = next((item for item in snapshots if item.get("version") == output_version), None)
        media = ((next_snapshot or {}).get("payload") or {}).get("media")
    if not isinstance(media, list) or not media:
        return None
    return float(15 * len(media))


def read_spend_report(db: Session) -> dict:
    zone = ZoneInfo(settings.booklender_timezone)
    today = datetime.now(zone).date()
    # Keep a full quarter available for the 7/30/90 day dashboard filter.
    first_day = today - timedelta(days=89)
    start = datetime.combine(first_day, time.min, tzinfo=zone).astimezone(UTC)
    days = [(first_day + timedelta(days=offset)).isoformat() for offset in range(90)]
    daily = {name: defaultdict(float) for name in ("OpenRouter", "Predis", "Creatify")}
    daily_credits = {name: defaultdict(float) for name in ("Predis", "Creatify")}
    daily_estimated_credits = {"Predis": defaultdict(float)}
    totals = {name: {"usd": 0.0, "credits": 0.0, "creditReports": 0,
                     "estimatedCredits": 0.0, "estimatedCreditReports": 0, "jobs": 0}
              for name in daily}

    for entry in db.scalars(select(SpendEntry).where(SpendEntry.created_at >= start,
                                                    SpendEntry.provider == "OpenRouter")):
        day = entry.created_at.astimezone(zone).date().isoformat()
        amount = float(entry.amount_usd)
        daily["OpenRouter"][day] += amount
        totals["OpenRouter"]["usd"] += amount

    jobs = db.scalars(select(WorkJob).where(WorkJob.kind == "media",
                                             WorkJob.provider.in_(["Predis", "Creatify"]),
                                             WorkJob.updated_at >= start)).all()
    legacy_post_ids = {job.post_id for job in jobs if job.provider == "Predis"
                       and job.status == "completed" and getattr(job, "post_id", None)
                       and _number((job.result or {}).get("credits")) is None}
    legacy_posts = {post.id: post for post in db.scalars(select(StudioPost).where(StudioPost.id.in_(legacy_post_ids)))} if legacy_post_ids else {}
    for job in jobs:
        provider = job.provider
        result = job.result or {}
        day = job.updated_at.astimezone(zone).date().isoformat()
        if job.status == "completed":
            totals[provider]["jobs"] += 1
            daily[provider][day] += 1
        credits = [_number(result.get("credits"))]
        if provider == "Creatify":
            credits.append(_number(result.get("ttsCredits")))
        elif provider == "Predis" and job.status == "completed" and credits[0] is None:
            credits[0] = _historical_predis_credits(job, legacy_posts.get(getattr(job, "post_id", None)))
        known = [value for value in credits if value is not None]
        if known:
            amount = sum(known)
            if provider == "Predis" and (result.get("creditsEstimated") or result.get("credits") is None):
                totals[provider]["estimatedCredits"] += amount
                totals[provider]["estimatedCreditReports"] += 1
                daily_estimated_credits[provider][day] += amount
            else:
                totals[provider]["credits"] += amount
                totals[provider]["creditReports"] += 1
                daily_credits[provider][day] += amount

    return {
        "timezone": settings.booklender_timezone,
        "days": days,
        "providers": {
            "OpenRouter": {**totals["OpenRouter"], "daily": [daily["OpenRouter"][day] for day in days],
                           **_openrouter_balance()},
            "Predis": {**totals["Predis"], "daily": [daily["Predis"][day] for day in days],
                       "dailyCredits": [daily_credits["Predis"][day] for day in days],
                       "dailyEstimatedCredits": [daily_estimated_credits["Predis"][day] for day in days],
                       **read_predis_balance(db)},
            "Creatify": {**totals["Creatify"], "daily": [daily["Creatify"][day] for day in days],
                         "dailyCredits": [daily_credits["Creatify"][day] for day in days],
                         **_creatify_balance()},
        },
    }
