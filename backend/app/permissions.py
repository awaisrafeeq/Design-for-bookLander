"""Action permissions are enforced in the API; admins can grant individual overrides."""
from fastapi import HTTPException
from app.models import User

PERMISSIONS = {
    "ideas.create": "Add topics", "ideas.suggest": "Suggest AI ideas", "ideas.pick": "Pick ideas",
    "content.edit": "Edit content", "content.generate": "Generate AI content", "media.upload": "Upload media",
    "media.generate": "Generate media", "content.archive": "Archive and restore",
    "review.approve": "Approve and reject", "schedule.manage": "Manage schedules",
    "publish.send": "Send approved posts to Zernio", "brand.edit": "Change brand rules",
    "spend.edit": "Change AI budget", "sources.manage": "Manage connections",
    "jobs.retry": "Retry background jobs", "logs.view": "View logs",
    "catalogue.manage": "Manage catalogue books",
    "campaigns.manage": "Create and edit campaign drafts", "campaigns.approve": "Review campaign drafts",
    "inbox.reply": "Reply to messages and comments",
}
DEFAULTS = {
    "admin": set(PERMISSIONS),
    "campaigns_manager": {"ideas.create", "ideas.pick", "content.edit", "content.archive", "catalogue.manage", "campaigns.manage"},
    "editor": {"ideas.create", "content.edit", "media.upload", "catalogue.manage"},
    "approver": {"review.approve", "campaigns.approve"}, "viewer": set(),
}
ACTION_MODULE = {
    "ideas": "Ideas", "content": "Board", "media": "Board", "review": "Review",
    "schedule": "Schedule", "publish": "Schedule", "brand": "Brand", "spend": "AI spend",
    "sources": "Sources", "jobs": "Logs", "logs": "Logs", "catalogue": "Catalogue", "campaigns": "Campaigns", "inbox": "Messages",
}


def has_module(user: User, module: str) -> bool:
    available = user.module_access or []
    if module == "Messages":
        return "Messages" in available or "Comments" in available
    if module == "Board":
        return "Board" in available or "Media library" in available
    return module in available


def effective_permissions(user: User) -> dict[str, bool]:
    if user.role == "admin":
        return dict.fromkeys(PERMISSIONS, True)
    defaults = DEFAULTS.get(user.role, set())
    overrides = user.permissions or {}
    return {key: has_module(user, ACTION_MODULE[key.split(".")[0]]) and overrides.get(key, user.is_approver if key == "review.approve" else key in defaults)
            for key in PERMISSIONS}


def require_permission(user: User, action: str) -> None:
    module = ACTION_MODULE[action.split(".")[0]]
    if user.role != "admin" and (not has_module(user, module) or not effective_permissions(user).get(action)):
        raise HTTPException(403, f"Permission required: {PERMISSIONS[action]}")
