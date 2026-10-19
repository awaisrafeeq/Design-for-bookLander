"""Weekly, evidence-based suggestions for improving BookLender's brand style."""
import json
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (Publication, PublicationAnalytics, SpendEntry, StudioPost,
                        WeeklyStyleLearning)
from app.providers import parse_generated_json, text_completion

log = logging.getLogger(__name__)
INTERACTIONS = ("likes", "comments", "shares", "saves")


def _weekly_change(history: list[dict], start: date, end: date):
    points = sorted((item for item in history if isinstance(item, dict)
                     and start.isoformat() <= str(item.get("date", "")) <= end.isoformat()),
                    key=lambda item: item["date"])
    if len(points) < 3 or len({item["date"] for item in points}) < 3 or points[0]["date"] == points[-1]["date"]:
        return None
    first, last = points[0].get("metrics") or {}, points[-1].get("metrics") or {}
    if any(not isinstance(first.get(key), (int, float)) or not isinstance(last.get(key), (int, float)) for key in INTERACTIONS):
        return None
    if not isinstance(last.get("reach"), (int, float)) or last["reach"] < 20:
        return None
    engagement_start = sum(first[key] for key in INTERACTIONS)
    engagement_end = sum(last[key] for key in INTERACTIONS)
    gain = max(0, engagement_end - engagement_start)
    rate = gain / last["reach"] * 100
    if gain <= 0:
        return None
    return {"engagementAtStart": engagement_start, "engagementAtEnd": engagement_end,
            "engagementGain": gain, "reachAtEnd": last["reach"],
            "weeklyGainRate": round(rate, 3), "samples": len(points)}


def create_weekly_style_learning(db: Session, *, today: date | None = None):
    """Create one pending learning proposal for the previous complete UTC week.

    Called daily so temporary provider/model failures can be retried on a later run.
    No eligible weekly analytics means no proposal is created.
    """
    today = today or datetime.now(UTC).date()
    this_monday = today - timedelta(days=today.weekday())
    week_start, week_end = this_monday - timedelta(days=7), this_monday - timedelta(days=1)
    db.execute(text("SELECT pg_advisory_xact_lock(1852778491)"))
    if db.scalar(select(WeeklyStyleLearning.id).where(WeeklyStyleLearning.week_start == week_start)):
        db.rollback()
        return {"status": "already_created", "weekStart": week_start.isoformat()}
    rows = db.execute(select(Publication, StudioPost, PublicationAnalytics)
                      .join(StudioPost, StudioPost.id == Publication.post_id)
                      .join(PublicationAnalytics, PublicationAnalytics.publication_id == Publication.id)
                      .where(Publication.status == "published", PublicationAnalytics.sync_status == "synced")).all()
    candidates = []
    for publication, post, analytics in rows:
        if not str((post.payload or {}).get("caption") or "").strip():
            continue
        change = _weekly_change(analytics.daily_history or [], week_start, week_end)
        if change:
            candidates.append((change["weeklyGainRate"], change["engagementGain"], publication, post, change))
    if not candidates:
        db.rollback()
        return {"status": "no_eligible_analytics", "weekStart": week_start.isoformat()}
    _, _, publication, post, evidence = max(candidates, key=lambda item: (item[0], item[1]))
    caption = str((post.payload or {}).get("caption") or "")[:1800]
    title = str((post.payload or {}).get("title") or "Untitled post")[:300]
    prompt = json.dumps({"title": title, "platform": publication.platform,
                         "format": (post.payload or {}).get("format", "unknown"),
                         "caption": caption, "weeklyAnalytics": evidence}, ensure_ascii=False)
    schema = {"type": "object", "additionalProperties": False,
              "properties": {"guidance": {"type": "string"}, "rationale": {"type": "string"}},
              "required": ["guidance", "rationale"]}
    instruction = ("Analyze the supplied published social post as a writing-style example. Return concise, reusable brand guidance "
                   "that describes structural or tonal traits only. Never copy text, infer facts, invent performance causes, or claim "
                   "the post succeeded because of a specific wording choice. Mention uncertainty in rationale. Keep guidance under 500 characters and rationale under 300 characters.")
    content, usage, provider_id = text_completion(prompt, instruction, schema)
    cost = usage.get("cost")
    if cost is not None:
        db.add(SpendEntry(provider="OpenRouter", category="text", amount_usd=Decimal(str(cost)),
                          model=settings.openrouter_model, provider_job_id=provider_id))
    result = parse_generated_json(content)
    guidance = str(result.get("guidance") or "").strip()[:500]
    rationale = str(result.get("rationale") or "").strip()[:300]
    if not guidance or not rationale:
        db.commit()
        raise ValueError("Style learning returned incomplete guidance")
    suggestion = WeeklyStyleLearning(week_start=week_start, week_end=week_end,
                                     publication_id=publication.id, post_id=post.id,
                                     platform=publication.platform,
                                     post_format=str((post.payload or {}).get("format") or "image"),
                                     evidence={**evidence, "postTitle": title, "providerJobId": provider_id,
                                               "model": settings.openrouter_model, "cost": cost},
                                     guidance=guidance, rationale=rationale, status="pending")
    db.add(suggestion)
    db.commit()
    return {"status": "created", "weekStart": week_start.isoformat(), "postId": post.id}

