"""Authenticated, narrowly scoped access to Zernio's inbox."""
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import select

from app.config import settings
from app.models import AuditEvent, ProviderAccount
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
    return Zernio().request("GET", path, params=query, timeout=30)


def mutate_inbox(db, user, request, command):
    access(user)
    require_permission(user, "inbox.reply")
    action = command.get("action")
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
        # Slack expects named emoji, while the UI uses Unicode for every platform.
        emoji = {"👍": ":thumbsup:", "❤️": ":heart:", "😂": ":joy:"}.get(emoji, emoji)
        path = f"/inbox/conversations/{encoded}/messages/{message_id}/reactions"
        if command.get("remove") is True:
            result = Zernio().request("DELETE", path, params=body, timeout=30)
        else:
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
