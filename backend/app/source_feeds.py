"""Fetch and cache external material used only as evidence for idea generation."""
import hashlib
import logging
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SourceItem, SourceSetting, SourceSyncRun

logger = logging.getLogger(__name__)
NEWS_QUERY = "books OR authors OR publishing OR novels OR reading"
SOURCE_LABELS = {
    "calendarific": ("calendar", "Calendarific"),
    "nyt_books": ("books", "The New York Times Books"),
    "currents": ("news", "Currents"),
    "newsdata": ("news", "NewsData.io"),
}


def _safe_url(value):
    if not isinstance(value, str) or len(value) > 2000:
        return None
    parsed = urlparse(value)
    return value if parsed.scheme in {"http", "https"} and parsed.netloc else None


def _text(value, limit=1500):
    return " ".join(str(value or "").split())[:limit]


def _date(value):
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def _datetime(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed
    except ValueError:
        return None


def configured_providers():
    return {
        "calendarific": bool(settings.calendarific_api_key),
        "nyt_books": bool(settings.nyt_api_key),
        "currents": bool(settings.currents_api_key),
        "newsdata": bool(settings.newsdata_api_key),
    }


def _get_json(url, *, params, headers=None):
    try:
        response = httpx.get(url, params=params, headers=headers, timeout=25, follow_redirects=True)
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Provider response bodies may include credentials or request URLs; never echo them.
        raise RuntimeError(f"Provider request failed ({type(exc).__name__}). Check the API key, quota, and provider status.") from None
    if not isinstance(result, dict):
        raise RuntimeError("Provider returned an unexpected response format.")
    return result


def _fetch_calendar(year):
    result = _get_json("https://calendarific.com/api/v2/holidays", params={
        "api_key": settings.calendarific_api_key, "country": "US", "year": year,
    })
    if (result.get("meta") or {}).get("code") not in {None, 200} or result.get("error"):
        raise RuntimeError("Calendarific rejected the request. Check its key and monthly quota.")
    holidays = (result.get("response") or {}).get("holidays") or []
    rows = []
    for item in holidays:
        title = _text(item.get("name"), 500)
        event_date = _date((item.get("date") or {}).get("iso"))
        if not title or not event_date:
            continue
        external_id = f"US:{event_date.isoformat()}:{title.casefold()}"
        rows.append({"external_id": external_id, "title": title,
            "summary": _text(item.get("description")), "url": _safe_url(item.get("canonical_url")),
            "event_date": event_date, "published_at": None, "country": "US",
            "metadata": {"type": item.get("type", []), "provider": "Calendarific"}})
    return rows


def _fetch_books():
    result = _get_json("https://api.nytimes.com/svc/books/v3/lists/overview.json", params={
        "api-key": settings.nyt_api_key,
    })
    if result.get("status") not in {None, "OK"} or result.get("fault"):
        raise RuntimeError("The New York Times Books API rejected the request. Check its key and quota.")
    listing = result.get("results") or {}
    rows = []
    for book_list in listing.get("lists") or []:
        for book in book_list.get("books") or []:
            details = (book.get("book_details") or [{}])[0]
            title = _text(details.get("title") or book.get("title"), 500)
            if not title:
                continue
            isbn = str(book.get("primary_isbn13") or book.get("primary_isbn10") or "").strip()
            external_id = isbn or hashlib.sha256(f"{book_list.get('list_name')}:{title}".encode()).hexdigest()
            rows.append({"external_id": external_id, "title": title,
                "summary": _text(details.get("description"), 1500),
                "url": _safe_url(book.get("amazon_product_url")), "event_date": None,
                "published_at": _datetime(listing.get("bestsellers_date")), "country": "US",
                "metadata": {"author": _text(details.get("author"), 180), "list": _text(book_list.get("display_name"), 180),
                    "rank": book.get("rank"), "weeksOnList": book.get("weeks_on_list"), "isbn": isbn}})
    return rows[:100]


def _fetch_currents():
    result = _get_json("https://api.currentsapi.services/v1/search", params={
        "query": NEWS_QUERY, "language": "en", "country": "US", "page_size": 50,
    }, headers={"Authorization": f"Bearer {settings.currents_api_key}"})
    if result.get("status") in {"error", "failed"} or result.get("message") and not result.get("news"):
        raise RuntimeError("Currents rejected the request. Check its key and daily quota.")
    rows = []
    for item in result.get("news") or []:
        external_id = _text(item.get("id"), 240)
        title = _text(item.get("title"), 500)
        if not external_id or not title:
            continue
        rows.append({"external_id": external_id, "title": title,
            "summary": _text(item.get("description")), "url": _safe_url(item.get("url")),
            "event_date": None, "published_at": _datetime(item.get("published")), "country": None,
            "metadata": {"author": _text(item.get("author"), 180), "category": item.get("category", [])}})
    return rows


def _fetch_newsdata():
    result = _get_json("https://newsdata.io/api/1/latest", params={
        "apikey": settings.newsdata_api_key, "q": NEWS_QUERY, "country": "us", "language": "en",
    })
    if result.get("status") == "error" or result.get("results") is None and result.get("message"):
        raise RuntimeError("NewsData.io rejected the request. Check its key and daily quota.")
    rows = []
    for item in result.get("results") or []:
        external_id = _text(item.get("article_id"), 240)
        title = _text(item.get("title"), 500)
        if not external_id or not title:
            continue
        rows.append({"external_id": external_id, "title": title,
            "summary": _text(item.get("description") or item.get("content")), "url": _safe_url(item.get("link")),
            "event_date": None, "published_at": _datetime(item.get("pubDate")), "country": "US",
            "metadata": {"creator": item.get("creator"), "category": item.get("category", []),
                "source": _text(item.get("source_name"), 180)}})
    return rows


FETCHERS = {"calendarific": lambda: [*_fetch_calendar(datetime.now(ZoneInfo(settings.booklender_timezone)).year),
                                     *_fetch_calendar(datetime.now(ZoneInfo(settings.booklender_timezone)).year + 1)], "nyt_books": _fetch_books,
            "currents": _fetch_currents, "newsdata": _fetch_newsdata}


def sync_source_feeds(db: Session, *, force=False):
    settings_rows = {row.key: row for row in db.scalars(select(SourceSetting)).all()}
    enabled = {key: bool((settings_rows.get(key) and settings_rows[key].enabled)) for key in ("calendar", "news", "books")}
    active_news = (settings_rows.get("news").provider if settings_rows.get("news") else None) or settings.news_source_provider
    configured = configured_providers()
    targets = []
    if enabled["calendar"]:
        targets.append(("calendarific", "calendar"))
    if enabled["books"]:
        targets.append(("nyt_books", "books"))
    if enabled["news"]:
        targets.append((active_news, "news"))
    outcomes = []
    now = datetime.now(UTC)
    for provider, category in targets:
        if not configured.get(provider, False):
            outcomes.append({"provider": provider, "status": "not_configured", "new": 0})
            continue
        latest = db.scalar(select(SourceSyncRun).where(SourceSyncRun.provider == provider)
                           .order_by(SourceSyncRun.started_at.desc()).limit(1))
        interval = timedelta(hours=6) if category == "news" else timedelta(hours=24)
        if force and latest and latest.finished_at and now - latest.finished_at < timedelta(minutes=10):
            outcomes.append({"provider": provider, "status": "recently_synced", "new": 0})
            continue
        if not force and latest and latest.status == "succeeded" and latest.finished_at and now - latest.finished_at < interval:
            outcomes.append({"provider": provider, "status": "recently_synced", "new": 0})
            continue
        active_run = db.scalar(select(SourceSyncRun).where(SourceSyncRun.provider == provider,
            SourceSyncRun.status == "running").order_by(SourceSyncRun.started_at.desc()).limit(1))
        if active_run and now - active_run.started_at < timedelta(minutes=10):
            outcomes.append({"provider": provider, "status": "running", "new": 0})
            continue
        run = SourceSyncRun(provider=provider, status="running", started_at=now)
        db.add(run)
        db.commit()
        run_id = run.id
        try:
            items = FETCHERS[provider]()
            added = 0
            for item in items:
                existing = db.scalar(select(SourceItem).where(SourceItem.provider == provider,
                    SourceItem.external_id == item["external_id"]))
                if existing:
                    existing.title = item["title"]
                    existing.summary = item["summary"]
                    existing.url = item["url"]
                    existing.event_date = item["event_date"]
                    existing.published_at = item["published_at"]
                    existing.country = item["country"]
                    existing.metadata_json = item["metadata"]
                    existing.active = True
                else:
                    db.add(SourceItem(category=category, provider=provider, active=True,
                        external_id=item["external_id"], title=item["title"], summary=item["summary"], url=item["url"],
                        event_date=item["event_date"], published_at=item["published_at"], country=item["country"],
                        metadata_json=item["metadata"]))
                    added += 1
            run.status = "succeeded"
            run.fetched_count = len(items)
            run.new_count = added
            run.finished_at = datetime.now(UTC)
            db.commit()
            outcomes.append({"provider": provider, "status": "succeeded", "new": added})
        except Exception as exc:
            db.rollback()
            run = db.get(SourceSyncRun, run_id)
            run.status = "failed"
            run.error = str(exc)[:500] if isinstance(exc, RuntimeError) else "Feed data could not be processed. Check provider configuration and worker logs."
            run.finished_at = datetime.now(UTC)
            db.commit()
            logger.warning("Source feed sync failed for %s: %s", provider, type(exc).__name__)
            outcomes.append({"provider": provider, "status": "failed", "new": 0})
    return outcomes


def source_feed_status(db: Session):
    configured = configured_providers()
    settings_rows = {row.key: row for row in db.scalars(select(SourceSetting)).all()}
    news_provider = (settings_rows.get("news").provider if settings_rows.get("news") else None) or settings.news_source_provider
    providers = {}
    for provider, (category, label) in SOURCE_LABELS.items():
        latest = db.scalar(select(SourceSyncRun).where(SourceSyncRun.provider == provider)
                           .order_by(SourceSyncRun.started_at.desc()).limit(1))
        providers[provider] = {"label": label, "configured": configured[provider],
            "enabled": (settings_rows.get(category).enabled if settings_rows.get(category) else False)
                       and (provider == news_provider if category == "news" else True),
            "status": latest.status if latest else "not_synced",
            "error": latest.error if latest and latest.status == "failed" else None,
            "lastSyncedAt": latest.finished_at.isoformat() if latest and latest.finished_at else None,
            "items": db.scalar(select(func.count()).select_from(SourceItem).where(
                SourceItem.provider == provider, SourceItem.active.is_(True))) or 0}
    return providers, news_provider


def source_events(db: Session):
    today = datetime.now(ZoneInfo(settings.booklender_timezone)).date()
    recent = datetime.now(UTC) - timedelta(days=30)
    rows = db.scalars(select(SourceItem).where(SourceItem.active.is_(True),
        ((SourceItem.event_date.is_not(None)) & (SourceItem.event_date >= today)) |
        ((SourceItem.event_date.is_(None)) & ((SourceItem.published_at.is_(None)) | (SourceItem.published_at >= recent)))).order_by(
        SourceItem.event_date.asc().nullslast(), SourceItem.published_at.desc().nullslast()).limit(60)).all()
    result = []
    for item in rows:
        item_date = item.event_date or (item.published_at.date() if item.published_at else item.created_at.date())
        delta = (item_date - today).days
        result.append({"id": str(item.id), "name": item.title, "source": item.category,
            "date": item_date.isoformat(), "days": delta, "titles": 1, "url": item.url,
            "summary": (item.summary or "")[:400], "provider": SOURCE_LABELS.get(item.provider, ("", item.provider))[1]})
    return result
