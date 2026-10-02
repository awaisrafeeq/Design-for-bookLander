"""Idempotent client user provisioning. Never creates a usable default password or sends mail."""
import secrets
from sqlalchemy import select
from app.db import SessionLocal
from app.models import User, AuditEvent
from app.permissions import PERMISSIONS
from app.security import hash_password

CLIENT_USERS = [
    ("bookadmin@booklender.com", "BookLender Admin", "admin", False, ["Super admin"]),
    ("krishna@booklender.com", "Krishna", "campaigns_manager", True, ["Content Manager", "Campaigns Manager"]),
    ("ronnie@utsolutionsinc.com", "Ronnie", "campaigns_manager", False, ["Campaigns Manager"]),
]
MODULES = ["Board", "Ideas", "Review", "Schedule", "Results", "Sources", "Brand", "AI spend", "Team", "Logs"]


def seed():
    with SessionLocal.begin() as db:
        for email, name, role, approver, titles in CLIENT_USERS:
            existing = db.scalar(select(User).where(User.email == email))
            if existing:
                if not existing.role_titles:
                    existing.role_titles = titles
                    existing.is_approver = approver or existing.is_approver
                    if name == "Ronnie" and not existing.permissions:
                        existing.permissions = dict.fromkeys(PERMISSIONS, False)
                continue
            overrides = dict.fromkeys(PERMISSIONS, False) if name == "Ronnie" else {}
            user = User(email=email, name=name, role=role, is_approver=approver, role_titles=titles,
                active=False, invited=True, module_access=MODULES if role == "admin" else ["Board", "Ideas", "Review", "Schedule", "Results", "Logs"],
                permissions=overrides, password_hash=hash_password(secrets.token_urlsafe(48)))
            db.add(user)
            db.flush()
            db.add(AuditEvent(action="team.client_user_provisioned", resource_type="user", resource_id=str(user.id)))


if __name__ == "__main__":
    seed()
