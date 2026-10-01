"""Create the first admin from environment variables, once, with no default credentials."""

from decimal import Decimal

from sqlalchemy import func, select

from app.config import settings
from app.db import SessionLocal
from app.models import AuditEvent, BrandPolicyVersion, BrandRule, SpendSettings, User
from app.security import hash_password

BRAND_VOICE = (
    "Witty, intellectual, cozy, and convenient. Celebrate the tactile experience of paperbacks "
    "and audiobook CDs for passionate readers."
)
BRAND_RULES = [
    "Never mention Kindle, e-readers, or digital streaming.",
    "Avoid corporate buzzwords such as synergy or disrupting.",
    "Avoid polarizing political commentary unless a classic book theme directly warrants historical discussion.",
]


def bootstrap() -> None:
    if not settings.bootstrap_admin_email or not settings.bootstrap_admin_password:
        raise SystemExit("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before bootstrap.")
    if settings.bootstrap_admin_password.startswith("replace-"):
        raise SystemExit("Replace the example bootstrap password with a unique secret first.")

    email = settings.bootstrap_admin_email.strip().casefold()
    with SessionLocal.begin() as db:
        if db.scalar(select(func.count()).select_from(User)):
            raise SystemExit("Bootstrap stopped: users already exist. Use the admin workflow instead.")
        admin = User(email=email, name="BookLender Admin", role="admin", password_hash=hash_password(settings.bootstrap_admin_password))
        db.add(admin)
        db.flush()
        policy = BrandPolicyVersion(version=1, voice=BRAND_VOICE, active=True, created_by=admin.id)
        db.add(policy)
        db.flush()
        db.add_all([BrandRule(policy_version_id=policy.id, rule=rule) for rule in BRAND_RULES])
        db.add(SpendSettings(daily_cap_usd=Decimal(str(settings.ai_daily_spend_cap_usd)), timezone=settings.booklender_timezone, updated_by=admin.id))
        db.add(AuditEvent(actor_user_id=admin.id, action="system.bootstrap", resource_type="installation"))
    print("Created the initial BookLender admin and baseline settings. Remove bootstrap secrets from the environment.")


if __name__ == "__main__":
    bootstrap()
