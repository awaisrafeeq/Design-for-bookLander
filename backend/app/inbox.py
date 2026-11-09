"""Authenticated, narrowly scoped access to Zernio's inbox."""
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import select

from app.config import settings
from app.models import AuditEvent, ProviderAccount, WebhookInbox
from app.permissions import require_permission
from app.providers import Zernio


def access(user):
    if user.role != "admin" and "Inbox" not in (user.module_access or []):
        raise HTTPException(403, "Inbox access required")


def identifier(value, name):
    if not isinstance(value, str) or not value.strip() or len(value) > 500:
        raise HTTPException(422, f"Valid {name} required")
    return value.strip()


def account(db, value):
    account_id = identifier(value, "account")
    item = db.get(ProviderAccount, account_id)
    if not item or not item.active:
        raise HTTPException(404, "Account is unavailable. Sync accounts in Sources & events.")
    return account_id


def _reaction_events(db, account_id, conversation_id):
    """Return this thread's received reaction events in chronological order."""
    rows = db.scalars(
        select(WebhookInbox)
        .where(WebhookInbox.payload["event"].as_string() == "reaction.received")
        .where(WebhookInbox.payload["account"]["id"].as_string() == account_id)
        .where(WebhookInbox.payload["conversation"]["id"].as_string() == conversation_id)
        .order_by(WebhookInbox.created_at.desc())
        .limit(500)
    ).all()
    events = []
    for row in reversed(rows):
        payload = row.payload or {}
        reaction = payload.get("reaction") or {}
        conversation = payload.get("conversation") or {}
        event_account = payload.get("account") or {}
        if str(conversation.get("id") or "") != conversation_id:
            continue
        if str(event_account.get("id") or "") != account_id:
            continue
        events.append(payload)
    return events


def _apply_reaction_events(data, events, platform):
    """Overlay webhook-confirmed own reactions, including removals, on the thread read."""
    if not isinstance(data, dict) or not events:
        return data
    messages = data.get("messages")
    container = data
    if not isinstance(messages, list) and isinstance(data.get("data"), dict):
        container = data["data"]
        messages = container.get("messages")
    if not isinstance(messages, list):
        messages = data.get("items")
        container = data
    if not isinstance(messages, list):
        return data

    message_by_id = {}
    for message in messages:
        if not isinstance(message, dict):
            continue
        for key in ("id", "platformMessageId", "platformId"):
            value = message.get(key)
            if value is not None:
                message_by_id[str(value)] = message
    meta_platform = platform.casefold().replace("_", "").replace("-", "") in {"instagram", "facebook", "facebookmessenger"}
    for payload in events:
        reaction = payload.get("reaction") or {}
        sender = reaction.get("sender") or {}
        conversation = payload.get("conversation") or {}
        sender_id = str(sender.get("id") or "")
        participant_id = str(conversation.get("participantId") or "")
        own = sender.get("isOwnAccount")
        if not isinstance(own, bool) and sender_id and participant_id:
            own = sender_id != participant_id
        if own is not True:
            continue
        message_id = str(reaction.get("platformMessageId") or reaction.get("messageId") or "")
        message = message_by_id.get(message_id)
        if not message:
            continue
        current = message.get("reactions") if isinstance(message.get("reactions"), list) else []
        emoji = str(reaction.get("emoji") or "")
        action = str(reaction.get("action") or "").casefold()
        mine = [item for item in current if isinstance(item, dict) and item.get("fromMe") is True]
        others = [item for item in current if not (isinstance(item, dict) and item.get("fromMe") is True)]
        if action == "removed":
            # Meta may omit the removed emoji; in that case it means this actor's
            # reaction was cleared. On Instagram/Messenger a sender has one active
            # reaction per message, so clear the prior own reaction either way.
            if emoji and not meta_platform:
                mine = [item for item in mine if str(item.get("emoji") or "") != emoji]
            else:
                mine = []
        elif action == "added" and emoji:
            if meta_platform:
                mine = []
            if not any(str(item.get("emoji") or "") == emoji for item in mine):
                mine.append({"emoji": emoji, "fromMe": True, "reactedAt": reaction.get("reactedAt")})
        message["reactions"] = others + mine
    container["messages"] = messages
    return data


def read_inbox(db, user, params):
    access(user)
    detail = params.get("detail", "conversations")
    if detail == "accounts":
        rows = db.scalars(select(ProviderAccount).where(ProviderAccount.active.is_(True)).order_by(ProviderAccount.name)).all()
        return {"accounts": [{"id": row.id, "platform": row.platform, "name": row.name} for row in rows]}
    query = {"limit": 50}
    for key in ("accountId", "platform", "cursor"):
        if params.get(key):
            query[key] = params[key]
    if query.get("accountId"):
        account(db, query["accountId"])
    if settings.zernio_profile_id:
        query["profileId"] = settings.zernio_profile_id
    if detail in {"conversations", "posts"}:
        path = "/inbox/conversations" if detail == "conversations" else "/inbox/comments"
        if detail == "posts":
            query.update(sortBy="date", sortOrder="desc")
    elif detail in {"messages", "comments", "ad_comments", "attachment"}:
        query.pop("profileId", None)
        query.pop("platform", None)
        query["accountId"] = account(db, params.get("accountId"))
        item_id = quote(identifier(params.get("id"), "thread"), safe="")
        path = f"/inbox/conversations/{item_id}/messages" if detail == "messages" else f"/inbox/comments/{item_id}"
        if detail == "attachment":
            message_id = quote(identifier(params.get("messageId"), "message"), safe="")
            try:
                attachment_index = int(params.get("index", ""))
            except ValueError:
                raise HTTPException(422, "Valid attachment index required") from None
            if not 0 <= attachment_index < 10:
                raise HTTPException(422, "Attachment index is out of range")
            path = f"/inbox/conversations/{item_id}/messages/{message_id}/attachments/{attachment_index}"
            return Zernio().request("GET", path, params={"accountId": query["accountId"], "format": "json"}, timeout=30)
        if detail == "ad_comments":
            path = f"/ads/{item_id}/comments"
            placement = params.get("placement")
            if placement not in {"facebook", "instagram"}:
                raise HTTPException(422, "Invalid ad placement")
            query["placement"] = placement
        if detail == "messages":
            query["sortOrder"] = "desc"
        elif params.get("commentId"):
            query["commentId"] = identifier(params.get("commentId"), "comment")
    else:
        raise HTTPException(422, "Unknown inbox view")
    data = Zernio().request("GET", path, params=query, timeout=30)
    if detail == "messages":
        linked = db.get(ProviderAccount, query["accountId"])
        events = _reaction_events(db, query["accountId"], params["id"])
        data = _apply_reaction_events(data, events, linked.platform if linked else "")
    return data


def mutate_inbox(db, user, request, command):
    access(user)
    action = command.get("action")
    if action == "configure_reaction_sync":
        if user.role != "admin":
            raise HTTPException(403, "Only an administrator can enable reaction syncing.")
        if not settings.zernio_webhook_secret or not settings.public_app_url:
            raise HTTPException(503, "Set the webhook secret and public app URL in the server settings first.")
        webhook_url = f"{settings.public_app_url.rstrip('/')}{settings.api_prefix}/webhooks/zernio"
        zernio = Zernio()
        current = zernio.request("GET", "/webhooks/settings")
        webhooks = current.get("webhooks") or current.get("items") or current.get("data") or []
        if isinstance(webhooks, dict):
            webhooks = webhooks.get("webhooks") or webhooks.get("items") or []
        existing = next((item for item in webhooks if isinstance(item, dict) and item.get("url", "").rstrip("/") == webhook_url.rstrip("/")), None) if isinstance(webhooks, list) else None
        events = list(existing.get("events") or []) if existing else []
        if "reaction.received" not in events:
            events.append("reaction.received")
        webhook_body = {"name": (existing or {}).get("name") or "BookLender Studio", "url": webhook_url,
                        "secret": settings.zernio_webhook_secret, "events": events, "isActive": True}
        if existing and existing.get("profileIds") is not None:
            webhook_body["profileIds"] = existing["profileIds"]
        if existing and existing.get("accountIds") is not None:
            webhook_body["accountIds"] = existing["accountIds"]
        if existing:
            webhook_body["webhookId"] = existing.get("webhookId") or existing.get("_id") or existing.get("id")
            result = zernio.request("PUT", "/webhooks/settings", json=webhook_body, timeout=30)
        else:
            result = zernio.request("POST", "/webhooks/settings", json=webhook_body, timeout=30)
        db.add(AuditEvent(actor_user_id=user.id, action="inbox.reaction_sync_enabled", resource_type="inbox", resource_id="zernio-webhook", request_id=request.headers.get("x-request-id"), details={"url": webhook_url}))
        db.commit()
        return {"message": "Instagram and Messenger reaction sync is enabled.", "webhook": result}
    require_permission(user, "inbox.reply")
    if action not in {"send_message", "send_comment", "like_comment", "hide_comment", "pin_comment", "react_message"}:
        raise HTTPException(422, "Unknown inbox action")
    account_id = account(db, command.get("accountId"))
    target = identifier(command.get("id"), "thread")
    encoded = quote(target, safe="")
    body = {"accountId": account_id}
    if action in {"send_message", "send_comment"}:
        text = identifier(command.get("message"), "message")
        if len(text) > 10000:
            raise HTTPException(422, "Message is too long")
        body["message"] = text
        path = f"/inbox/conversations/{encoded}/messages" if action == "send_message" else f"/inbox/comments/{encoded}"
        if action == "send_comment" and command.get("commentId"):
            body["commentId"] = identifier(command["commentId"], "comment")
        result = Zernio().request("POST", path, json=body, timeout=30)
    elif action == "react_message":
        message_id = quote(identifier(command.get("messageId"), "message"), safe="")
        emoji = identifier(command.get("emoji"), "reaction")
        if len(emoji) > 32:
            raise HTTPException(422, "Reaction is too long")
        path = f"/inbox/conversations/{encoded}/messages/{message_id}/reactions"
        if command.get("remove") is True:
            result = Zernio().request("DELETE", path, params=body, timeout=30)
        else:
            # Slack requires named emoji codes; Meta/WhatsApp/Telegram use the Unicode emoji.
            linked_account = db.get(ProviderAccount, account_id)
            if linked_account and (linked_account.platform or "").casefold() == "slack":
                emoji = {"👍": ":thumbsup:", "❤️": ":heart:", "😂": ":joy:"}.get(emoji, emoji)
            body["emoji"] = emoji
            result = Zernio().request("POST", path, json=body, timeout=30)
    else:
        comment = quote(identifier(command.get("commentId"), "comment"), safe="")
        operation = {"like_comment": "like", "hide_comment": "hide", "pin_comment": "pin"}[action]
        path = f"/inbox/comments/{encoded}/{comment}/{operation}"
        if command.get("remove") is True:
            result = Zernio().request("DELETE", path, params=body, timeout=30)
        else:
            if command.get("cid") and action == "like_comment":
                body["cid"] = identifier(command["cid"], "content identifier")
            result = Zernio().request("POST", path, json=body, timeout=30)
    db.add(AuditEvent(actor_user_id=user.id, action=f"inbox.{action}", resource_type="inbox", resource_id=target[:255], request_id=request.headers.get("x-request-id"), details={"accountId": account_id}))
    db.commit()
    return result
