"""Zernio analytics for posts published by BookLender only.

The provider dashboard includes unrelated posts on the same account. Matching each
publication by its saved Zernio post ID keeps the Results page scoped to this studio.
"""
import logging
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AccountFollowerAnalytics, ProviderAccount, Publication, PublicationAnalytics, StudioPost
from app.providers import ProviderError, Zernio

log = logging.getLogger(__name__)
METRIC_NAMES = ("impressions", "reach", "likes", "comments", "shares", "saves", "clicks", "views")


def _datetime(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except ValueError:
        return None


def _metrics(value):
    source = value if isinstance(value, dict) else {}
    result = {}
    for key in METRIC_NAMES:
        raw = source.get(key)
        result[key] = max(0, int(raw)) if isinstance(raw, (int, float)) and not isinstance(raw, bool) else None
    return result


def sync_publication_analytics(db: Session, *, force: bool = False):
    """Refresh a bounded batch so many historic posts never exhaust provider quota."""
    if not settings.zernio_api_key:
        return {"synced": 0, "pending": 0, "failed": 0}
    now = datetime.now(UTC)
    stale = now - timedelta(minutes=30)
    query = (select(Publication, PublicationAnalytics)
             .outerjoin(PublicationAnalytics, PublicationAnalytics.publication_id == Publication.id)
             .where(Publication.status == "published", Publication.provider_id.is_not(None))
             .where(or_(PublicationAnalytics.publication_id.is_(None), PublicationAnalytics.synced_at.is_(None),
                        PublicationAnalytics.synced_at < stale if force else PublicationAnalytics.synced_at < now - timedelta(hours=2)))
             .order_by(PublicationAnalytics.synced_at.asc().nulls_first(), Publication.scheduled_at.desc())
             .limit(15))
    counts = {"synced": 0, "pending": 0, "failed": 0}
    provider = Zernio()
    for publication, stored in db.execute(query).all():
        stored = stored or PublicationAnalytics(publication_id=publication.id, metrics={})
        try:
            response = provider.post_analytics(publication.provider_id)
            platform_rows = response.get("platformAnalytics")
            platform_row = next((item for item in platform_rows if isinstance(item, dict) and
                                 item.get("accountId") == publication.account_id and
                                 item.get("platform", "").lower() == publication.platform.lower()), None) if isinstance(platform_rows, list) else None
            # Top-level metrics are safe only for an unambiguous single-platform post.
            source = platform_row or (response if not platform_rows and response.get("platform", "").lower() == publication.platform.lower() else None)
            if source and isinstance(source.get("analytics"), dict):
                stored.metrics = _metrics(source["analytics"])
                stored.sync_status = "synced"
                stored.data_as_of = _datetime(source["analytics"].get("lastUpdated"))
                stored.published_at = _datetime(response.get("publishedAt")) or stored.published_at
                stored.error = None
                day = now.date().isoformat()
                history = [item for item in (stored.daily_history or []) if isinstance(item, dict) and item.get("date") != day]
                history.append({"date": day, "metrics": stored.metrics})
                stored.daily_history = history[-45:]
            else:
                stored.sync_status = "pending"
                stored.error = None
        except ProviderError as exc:
            stored.sync_status = "pending" if exc.status in {202, 404, 424} else "failed"
            stored.error = "Analytics are pending at Zernio." if stored.sync_status == "pending" else f"Zernio analytics request failed (HTTP {exc.status})."
            log.warning("Analytics sync failed for publication %s: HTTP %s", publication.id, exc.status)
        except Exception:
            stored.sync_status = "failed"
            stored.error = "Analytics could not be refreshed."
            log.exception("Analytics sync failed for publication %s", publication.id)
        stored.synced_at = datetime.now(UTC)
        db.add(stored)
        db.commit()
        counts[stored.sync_status] += 1
        time.sleep(0.25)
    return counts


def sync_follower_analytics(db: Session):
    """Account metrics are stored separately from BookLender post metrics."""
    if not settings.zernio_api_key:
        return 0
    accounts = db.scalars(select(ProviderAccount).where(ProviderAccount.active.is_(True))).all()
    if not accounts:
        return 0
    now = datetime.now(UTC)
    saved = {row.account_id: row for row in db.scalars(select(AccountFollowerAnalytics).where(
        AccountFollowerAnalytics.account_id.in_([account.id for account in accounts]))).all()}
    if saved and all(account.id in saved and saved[account.id].synced_at > now - timedelta(hours=12) for account in accounts):
        return 0
    response = Zernio().follower_stats([account.id for account in accounts],
                                      (now.date() - timedelta(days=365)).isoformat(), now.date().isoformat())
    stats = response.get("stats") if isinstance(response.get("stats"), dict) else {}
    summaries = {item.get("_id"): item for item in response.get("accounts", []) if isinstance(item, dict)}
    updated = 0
    for account in accounts:
        summary = summaries.get(account.id)
        if not summary:
            continue
        history = [item for item in stats.get(account.id, []) if isinstance(item, dict) and
                   isinstance(item.get("date"), str) and isinstance(item.get("followers"), (int, float))]
        current = summary.get("currentFollowers")
        row = saved.get(account.id) or AccountFollowerAnalytics(account_id=account.id, history=[], synced_at=now)
        row.current_followers = int(current) if isinstance(current, (int, float)) else None
        row.history = history
        row.synced_at = now
        db.add(row)
        updated += 1
    db.commit()
    return updated


def read_results(db: Session, params):
    today = datetime.now(UTC).date()
    try:
        end = date.fromisoformat(params.get("toDate", today.isoformat()))
        start = date.fromisoformat(params.get("fromDate", (end - timedelta(days=29)).isoformat()))
    except ValueError:
        raise HTTPException(422, "Use YYYY-MM-DD for Results dates") from None
    if end < start or (end - start).days > 365 or end > today:
        raise HTTPException(422, "Choose a Results range of at most 366 days ending today or earlier")
    platform = params.get("platform", "all").lower()
    account_id = params.get("accountId", "all")
    format_name = params.get("format", "all").lower()
    accounts = db.scalars(select(ProviderAccount).where(ProviderAccount.active.is_(True)).order_by(ProviderAccount.platform, ProviderAccount.name)).all()
    if platform != "all" and platform not in {account.platform.lower() for account in accounts}:
        raise HTTPException(422, "Choose a connected platform")
    if account_id != "all" and account_id not in {account.id for account in accounts}:
        raise HTTPException(422, "Choose a connected account")
    if format_name not in {"all", "image", "video", "carousel", "text"}:
        raise HTTPException(422, "Choose a valid post format")

    rows = db.execute(select(Publication, StudioPost, PublicationAnalytics)
                      .join(StudioPost, StudioPost.id == Publication.post_id)
                      .outerjoin(PublicationAnalytics, PublicationAnalytics.publication_id == Publication.id)
                      .where(Publication.status == "published", Publication.provider_id.is_not(None),
                             func.coalesce(PublicationAnalytics.published_at, Publication.scheduled_at) >= datetime.combine(start, datetime.min.time(), UTC),
                             func.coalesce(PublicationAnalytics.published_at, Publication.scheduled_at) < datetime.combine(end + timedelta(days=1), datetime.min.time(), UTC))
                      .order_by(func.coalesce(PublicationAnalytics.published_at, Publication.scheduled_at).desc())).all()
    daily = { (start + timedelta(days=offset)).isoformat(): {"date": (start + timedelta(days=offset)).isoformat(), "posts": 0, "syncedPosts": 0, "engagement": 0, "platforms": {}}
              for offset in range((end - start).days + 1) }
    totals = {key: 0 for key in METRIC_NAMES}
    available = {key: 0 for key in METRIC_NAMES}
    def empty_group():
        return {"posts": 0, "syncedPosts": 0, "engagement": 0, "metricCoverage": {key: 0 for key in METRIC_NAMES},
                **{key: 0 for key in METRIC_NAMES}}
    groups = {"platform": defaultdict(empty_group), "format": defaultdict(empty_group)}
    posts = []
    for publication, post, snapshot in rows:
        post_format = str((post.payload or {}).get("format") or "unknown").lower()
        if platform != "all" and publication.platform.lower() != platform:
            continue
        if account_id != "all" and publication.account_id != account_id:
            continue
        if format_name != "all" and post_format != format_name:
            continue
        is_synced = bool(snapshot and snapshot.sync_status == "synced")
        metrics = snapshot.metrics if is_synced else {}
        engagement = sum(metrics.get(key) or 0 for key in ("likes", "comments", "shares", "saves"))
        published_date = (snapshot.published_at if snapshot and snapshot.published_at else publication.scheduled_at).astimezone(UTC).date().isoformat()
        if published_date in daily:
            entry = daily[published_date]
            entry["posts"] += 1
            platform_day = entry["platforms"].setdefault(publication.platform, {"posts": 0, "syncedPosts": 0, "engagement": 0})
            platform_day["posts"] += 1
            if is_synced:
                entry["syncedPosts"] += 1
                entry["engagement"] += engagement
                platform_day["syncedPosts"] += 1
                platform_day["engagement"] += engagement
        for key in METRIC_NAMES:
            if isinstance(metrics.get(key), (int, float)):
                totals[key] += metrics[key]
                available[key] += 1
        for dimension, group_key in (("platform", publication.platform), ("format", post_format)):
            group = groups[dimension][group_key]
            group["posts"] += 1
            if is_synced:
                group["syncedPosts"] += 1
                group["engagement"] += engagement
            for metric in METRIC_NAMES:
                if isinstance(metrics.get(metric), (int, float)):
                    group[metric] += metrics[metric]
                    group["metricCoverage"][metric] += 1
        posts.append({"id": post.id, "publicationId": str(publication.id), "title": post.payload.get("title") or "Untitled post",
                      "platform": publication.platform, "accountId": publication.account_id, "format": post_format,
                      "publishedAt": snapshot.published_at.isoformat() if snapshot and snapshot.published_at else None,
                      "scheduledAt": publication.scheduled_at.isoformat(), "postUrl": publication.post_url,
                      "status": snapshot.sync_status if snapshot else "pending", "metrics": {key: metrics.get(key) for key in METRIC_NAMES},
                      "engagement": engagement if metrics else None, "dataAsOf": snapshot.data_as_of.isoformat() if snapshot and snapshot.data_as_of else None})
    synced = sum(item["status"] == "synced" for item in posts)
    reach = totals["reach"] if available["reach"] else None
    engagement_total = sum(totals[key] for key in ("likes", "comments", "shares", "saves")) if synced else None
    rate = round(engagement_total / reach * 100, 2) if reach and engagement_total is not None else None
    def serialize_groups(dimension):
        values = []
        for key, value in sorted(groups[dimension].items()):
            item = {"name": key, **value}
            for metric in METRIC_NAMES:
                if not value["metricCoverage"][metric]:
                    item[metric] = None
            metric_reach = item["reach"]
            item["engagementRate"] = round(value["engagement"] / metric_reach * 100, 2) if metric_reach and value["metricCoverage"]["reach"] else None
            values.append(item)
        return values
    by_platform = serialize_groups("platform")
    by_format = serialize_groups("format")
    followers = []
    account_by_id = {account.id: account for account in accounts}
    follower_rows = db.scalars(select(AccountFollowerAnalytics).where(
        AccountFollowerAnalytics.account_id.in_(list(account_by_id)))).all() if accounts else []
    for row in follower_rows:
        account = account_by_id[row.account_id]
        if platform != "all" and account.platform.lower() != platform:
            continue
        if account_id != "all" and account.id != account_id:
            continue
        history = sorted((item for item in row.history if start.isoformat() <= item.get("date", "")[:10] <= end.isoformat()), key=lambda item: item["date"])
        growth = int(history[-1]["followers"] - history[0]["followers"]) if len(history) >= 2 else None
        followers.append({"accountId": account.id, "name": account.name, "platform": account.platform,
                          "current": row.current_followers, "growth": growth, "syncedAt": row.synced_at.isoformat()})
    latest_sync = max((snapshot.synced_at for _, _, snapshot in rows if snapshot and snapshot.synced_at), default=None)
    return {"scope": "booklender", "fromDate": start.isoformat(), "toDate": end.isoformat(),
            "accounts": [{"id": account.id, "name": account.name, "platform": account.platform} for account in accounts],
            "publishedPosts": len(posts), "syncedPosts": synced, "pendingPosts": len(posts) - synced,
            "totals": {key: totals[key] if available[key] else None for key in METRIC_NAMES},
            "metricCoverage": available, "engagement": engagement_total, "engagementRate": rate,
            "daily": list(daily.values()), "byPlatform": by_platform, "byFormat": by_format, "followers": followers,
            "topPosts": sorted((item for item in posts if item["status"] == "synced"), key=lambda item: (item["engagement"] or 0, item["metrics"].get("reach") or 0), reverse=True)[:10],
            "recentPosts": posts[:20], "lastSyncedAt": latest_sync.isoformat() if latest_sync else None,
            "note": "Metrics are the latest lifetime totals for BookLender posts in the selected dates, not engagement received during those dates. Pending posts use their scheduled date until Zernio supplies a publication date. Summed reach can count the same person more than once."}
