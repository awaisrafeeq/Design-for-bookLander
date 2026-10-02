from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("role IN ('admin', 'campaigns_manager', 'approver', 'editor', 'viewer')", name="ck_users_role"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False, default="viewer")
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    invited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_approver: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    module_access: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    permissions: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    role_titles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_auth_sessions_token_hash"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Invitation(Base):
    __tablename__ = "invitations"
    __table_args__ = (UniqueConstraint("user_id", name="uq_invitations_user_id"), UniqueConstraint("token_hash", name="uq_invitations_token_hash"))

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(100))
    request_id: Mapped[str | None] = mapped_column(String(80))
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class BrandPolicyVersion(Base):
    __tablename__ = "brand_policy_versions"
    __table_args__ = (UniqueConstraint("version", name="uq_brand_policy_versions_version"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    voice: Mapped[str] = mapped_column(Text, nullable=False)
    format_guidance: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BrandRule(Base):
    __tablename__ = "brand_rules"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    policy_version_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("brand_policy_versions.id", ondelete="CASCADE"), index=True)
    rule: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SpendSettings(Base):
    __tablename__ = "spend_settings"
    __table_args__ = (CheckConstraint("daily_cap_usd > 0", name="ck_spend_settings_daily_cap_positive"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    daily_cap_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    efficient_model: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SpendEntry(Base):
    __tablename__ = "spend_entries"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    model: Mapped[str | None] = mapped_column(String(160))
    provider_job_id: Mapped[str | None] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class StudioPost(Base):
    __tablename__ = "studio_posts"
    __table_args__ = (
        CheckConstraint("stage IN ('idea', 'selected', 'generating', 'review', 'revision', 'scheduled', 'published', 'archived')", name="ck_studio_posts_stage"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stage: Mapped[str] = mapped_column(String(24), nullable=False, default="idea", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    version_history: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    approved_version: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False, index=True)


class SourceSetting(Base):
    __tablename__ = "source_settings"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class WorkJob(Base):
    __tablename__ = "work_jobs"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    post_id: Mapped[int | None] = mapped_column(ForeignKey("studio_posts.id", ondelete="SET NULL"), index=True)
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued", index=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    result: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    provider_id: Mapped[str | None] = mapped_column(String(160))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    history: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    cause: Mapped[str | None] = mapped_column(Text)
    fix: Mapped[str | None] = mapped_column(Text)
    next_run: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MediaAsset(Base):
    __tablename__ = "media_assets"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    post_id: Mapped[int] = mapped_column(ForeignKey("studio_posts.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    mime: Mapped[str] = mapped_column(String(80))
    filename: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProviderAccount(Base):
    __tablename__ = "provider_accounts"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    platform: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(180))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    selected: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Publication(Base):
    __tablename__ = "publications"
    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    post_id: Mapped[int] = mapped_column(ForeignKey("studio_posts.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    platform: Mapped[str] = mapped_column(String(40))
    account_id: Mapped[str] = mapped_column(String(80))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(24), default="held")
    provider_id: Mapped[str | None] = mapped_column(String(80), index=True)
    post_url: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebhookInbox(Base):
    __tablename__ = "webhook_inbox"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
