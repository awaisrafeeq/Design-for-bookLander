"""Module access defaults shared by invitations, presets and sessions."""

from app.models import RolePreset

MODULES = ["Board", "Ideas", "Review", "Schedule", "Results", "Campaigns", "Messages", "Comments", "Sources", "Catalogue", "Media library", "Brand", "AI spend", "Team", "Logs"]
DEFAULT_ROLE_MODULES = {
    "admin": MODULES,
    "campaigns_manager": ["Board", "Ideas", "Review", "Schedule", "Results", "Campaigns", "Sources", "Catalogue", "Media library", "Brand", "AI spend", "Logs"],
    "approver": ["Board", "Ideas", "Review", "Schedule", "Results", "Campaigns", "Logs"],
    "editor": ["Board", "Ideas", "Schedule", "Sources", "Catalogue", "Media library", "Brand", "Logs"],
    "viewer": ["Board", "Schedule", "Results"],
}


def role_modules(db, role: str) -> list[str]:
    if role == "admin":
        return list(MODULES)
    preset = db.get(RolePreset, role)
    return list(preset.modules if preset else DEFAULT_ROLE_MODULES[role])


def role_presets(db) -> dict[str, list[str]]:
    return {role: role_modules(db, role) for role in DEFAULT_ROLE_MODULES}
