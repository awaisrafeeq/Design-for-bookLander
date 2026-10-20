"""Grounded answers for the studio Help page."""
import json
import re
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SpendEntry, SpendSettings
from app.providers import parse_generated_json, text_completion


ARTICLES = [
    ("How do ideas become published posts?", "Enable and sync sources in Sources & events. Request suggestions on Ideas, pick one, create a caption and media, review and approve it, then save a posting schedule. Published posts appear in Results."),
    ("How do I add my own topic?", "On Ideas, choose Add, enter a topic and optional input in the popup, then save. Your input stays with that idea."),
    ("How do I pause suggestions or limit the backlog?", "Turn off a source in Sources & events to pause it. Set its idea backlog limit there; zero prevents new AI suggestions from that source. Existing ideas remain until you pick, close or archive them. Suggestions run when someone requests them."),
    ("Can I close or archive an idea?", "On Ideas, close a selected idea. On Board, archive posts from any stage except Scheduled. The Archive can restore them later."),
    ("Can a post publish without approval?", "A person must approve a post in Review before it can be scheduled. Approval alone does not schedule it; save a posting time to move it to Scheduled."),
    ("Where do published posts go?", "Published posts move to Results, where available Zernio metrics and the original post link appear. Metrics may remain pending until the provider supplies them."),
    ("How do I choose or change the media type?", "Choose Image, Carousel or Video when adding an idea. You can change Format in an editable draft. Changing format clears incompatible attached media."),
    ("How do I write a media brief?", "Describe the subject, setting, composition, lighting and two topic-specific visual details. Avoid invented book covers, visible text, prices, stock and delivery claims."),
    ("How do I guide an AI caption?", "Use Instructions for AI in the draft, for example: Write a warm, short caption about the verified theme and end with a question. Review the generated copy before approval."),
    ("How do I choose a video voice?", "In a video draft, choose a Creatify voice and play its sample. Keep spoken words in Voiceover script and visual directions in Video direction, then generate the video."),
    ("How do I reuse my own media?", "Upload an image or video to Media library. In an editable draft, choose Attach from library and select an asset matching the post format. You can also upload directly."),
    ("Why did a job fail?", "Open Logs for the failed job, its cause and attempt history. Check the provider key, account, quota and service status, then retry after resolving the issue."),
    ("What happens at the AI spend limit?", "New AI generation is stopped when its configured daily budget is reached. Existing approved scheduled posts can still publish."),
    ("What does it cost to make a post?", "AI spend records the provider-reported cost for generated text, images and video when that provider supplies a cost. Review AI spend and Logs for recorded usage. A manual draft has no AI generation charge."),
    ("How do revisions and approvals work?", "You can edit or regenerate an editable draft. A content change creates a new version and requires approval again. The revised version must be approved before its schedule is saved."),
    ("How do I cancel or change a schedule?", "Open Schedule and select the future post. You can update its time. Cancelling a schedule returns the post to Review so it remains findable."),
    ("Where do book details come from?", "The Catalogue contains imported and manually added book details. Matching titles can enrich draft context. Stock, rental availability and exact cover art are not verified by this integration."),
    ("How do I add or update a catalogue book?", "Open Catalogue and choose Add book for a manual entry. Search by title, author or ISBN. You can edit or archive books added there; imported catalogue rows remain read-only."),
    ("How does post learning work?", "Results shows published post metrics. Strong performance summaries need enough comparable data. You can choose Learn from this post to add reusable style guidance to Brand & styles. A weekly top-post suggestion also waits for your approval before changing brand guidance."),
]

STOP = {"a", "an", "and", "are", "can", "do", "does", "for", "from", "how", "i", "in", "is", "my", "of", "or", "the", "to", "what", "where", "why", "with"}


def ai_budget_available(db: Session) -> bool:
    limit = db.scalar(select(SpendSettings).order_by(SpendSettings.updated_at.desc()))
    if limit is None:
        return False
    now = datetime.now(ZoneInfo(limit.timezone))
    start = datetime.combine(now.date(), time.min, tzinfo=now.tzinfo).astimezone(UTC)
    end = (datetime.combine(now.date(), time.min, tzinfo=now.tzinfo) + timedelta(days=1)).astimezone(UTC)
    used = db.scalar(select(func.coalesce(func.sum(SpendEntry.amount_usd), 0)).where(
        SpendEntry.created_at >= start, SpendEntry.created_at < end))
    return Decimal(str(used or 0)) < limit.daily_cap_usd


def _tokens(value: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", value.casefold())
    aliases = {"failed": "fail", "fails": "fail", "errors": "error", "ideas": "idea",
               "posts": "post", "books": "book", "approved": "approve", "approvals": "approve",
               "scheduling": "schedule", "scheduled": "schedule", "revisions": "revision",
               "captions": "caption", "templates": "template"}
    return {aliases.get(word, word) for word in words if len(word) > 2 and word not in STOP}


def answer_help(db: Session, question: object) -> dict:
    if not isinstance(question, str) or not 2 <= len(question.strip()) <= 500:
        raise HTTPException(422, "Ask a question of 2 to 500 characters")
    query = _tokens(question)
    ranked = sorted(((3 * len(query & _tokens(title)) + len(query & _tokens(answer)), title, answer) for title, answer in ARTICLES), reverse=True)
    matches = [(title, answer) for score, title, answer in ranked[:3] if score >= 3 or (score >= 1 and len(query) <= 2)]
    if not matches:
        return {"answer": "I don't have a verified answer for that yet. Try a more specific question or check the workflow questions below.", "sources": [], "grounded": False}
    fallback = matches[0][1]
    if not settings.openrouter_api_key or not settings.openrouter_model or not ai_budget_available(db):
        return {"answer": fallback, "sources": [title for title, _ in matches], "grounded": True}
    schema = {"type": "object", "additionalProperties": False,
              "properties": {"answer": {"type": "string"}}, "required": ["answer"]}
    instruction = ("Answer the user's BookLender Studio question using ONLY the supplied verified Help articles. "
                   "Combine relevant steps in plain language. Do not invent product capabilities, providers, links or policies. "
                   "If the articles do not answer the question, say that clearly. Keep the answer under 120 words.")
    try:
        content, usage, provider_id = text_completion(json.dumps({"question": question, "articles": [
            {"title": title, "answer": answer} for title, answer in matches]}), instruction, schema)
        if usage.get("cost") is not None:
            db.add(SpendEntry(provider="OpenRouter", category="text", amount_usd=Decimal(str(usage["cost"])),
                              model=settings.openrouter_model, provider_job_id=provider_id))
            db.commit()
        parsed = parse_generated_json(content)
        response = str(parsed.get("answer") or "").strip()[:1000] or fallback
        return {"answer": response, "sources": [title for title, _ in matches], "grounded": True}
    except Exception:
        db.rollback()
        return {"answer": fallback, "sources": [matches[0][0]], "grounded": True}
