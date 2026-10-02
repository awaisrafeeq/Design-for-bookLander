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
}
DEFAULTS = {
    "admin": set(PERMISSIONS),
    "campaigns_manager": {"ideas.create", "ideas.pick", "content.edit", "content.archive"},
    "editor": {"ideas.create", "content.edit", "media.upload"},
    "approver": {"review.approve"}, "viewer": set(),
}
ACTION_MODULE = {
    "ideas": "Ideas", "content": "Board", "media": "Board", "review": "Review",
    "schedule": "Schedule", "publish": "Schedule", "brand": "Brand", "spend": "AI spend",
    "sources": "Sources", "jobs": "Logs", "logs": "Logs",
}


def effective_permissions(user: User) -> dict[str, bool]:
    if user.role == "admin":
        return dict.fromkeys(PERMISSIONS, True)
    defaults = DEFAULTS.get(user.role, set())
    overrides = user.permissions or {}
    return {key: ACTION_MODULE[key.split(".")[0]] in (user.module_access or []) and overrides.get(key, user.is_approver if key == "review.approve" else key in defaults)
            for key in PERMISSIONS}


def require_permission(user: User, action: str) -> None:
    module = ACTION_MODULE[action.split(".")[0]]
    if user.role != "admin" and (module not in user.module_access or not effective_permissions(user).get(action)):
        raise HTTPException(403, f"Permission required: {PERMISSIONS[action]}")
