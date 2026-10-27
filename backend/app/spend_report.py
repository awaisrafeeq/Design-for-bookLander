"""Provider usage reporting. Amounts and credits are never mixed."""
from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SpendEntry, WorkJob


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


def read_spend_report(db: Session) -> dict:
    zone = ZoneInfo(settings.booklender_timezone)
    today = datetime.now(zone).date()
    first_day = today - timedelta(days=29)
    start = datetime.combine(first_day, time.min, tzinfo=zone).astimezone(UTC)
    days = [(first_day + timedelta(days=offset)).isoformat() for offset in range(30)]
    daily = {name: defaultdict(float) for name in ("OpenRouter", "Predis", "Creatify")}
    daily_credits = {name: defaultdict(float) for name in ("Predis", "Creatify")}
    totals = {name: {"usd": 0.0, "credits": 0.0, "jobs": 0, "creditReports": 0}
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
        known = [value for value in credits if value is not None]
        if known:
            totals[provider]["credits"] += sum(known)
            totals[provider]["creditReports"] += 1
            daily_credits[provider][day] += sum(known)

    return {
        "timezone": settings.booklender_timezone,
        "days": days,
        "providers": {
            "OpenRouter": {**totals["OpenRouter"], "daily": [daily["OpenRouter"][day] for day in days],
                           **_openrouter_balance()},
            "Predis": {**totals["Predis"], "daily": [daily["Predis"][day] for day in days],
                       "dailyCredits": [daily_credits["Predis"][day] for day in days],
                       "remainingCredits": None, "balanceStatus": "not_available"},
            "Creatify": {**totals["Creatify"], "daily": [daily["Creatify"][day] for day in days],
                         "dailyCredits": [daily_credits["Creatify"][day] for day in days],
                         **_creatify_balance()},
        },
    }
