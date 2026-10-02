"""Persist provider jobs, assets, accounts, publication targets and action permissions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0006_integrations"
down_revision = "0005_invitation_activation"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("permissions", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("users", sa.Column("role_titles", sa.JSON(), nullable=False, server_default="[]"))
    op.create_table("work_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("provider", sa.String(40), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("studio_posts.id", ondelete="SET NULL")),
        sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("provider_id", sa.String(160)),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("history", sa.JSON(), nullable=False),
        sa.Column("cause", sa.Text()), sa.Column("fix", sa.Text()),
        sa.Column("next_run", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    for column in ("post_id", "status", "next_run"):
        op.create_index(f"ix_work_jobs_{column}", "work_jobs", [column])
    op.create_table("media_assets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("studio_posts.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(10)), sa.Column("mime", sa.String(80)),
        sa.Column("filename", sa.String(100)), sa.Column("size", sa.Integer()),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_media_assets_post_id", "media_assets", ["post_id"])
    op.create_table("provider_accounts",
        sa.Column("id", sa.String(80), primary_key=True), sa.Column("platform", sa.String(40)),
        sa.Column("name", sa.String(180)), sa.Column("active", sa.Boolean()),
        sa.Column("selected", sa.Boolean()),
        sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_provider_accounts_platform", "provider_accounts", ["platform"])
    op.create_table("publications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("studio_posts.id", ondelete="CASCADE")),
        sa.Column("version", sa.Integer()), sa.Column("platform", sa.String(40)),
        sa.Column("account_id", sa.String(80)), sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(24)), sa.Column("provider_id", sa.String(80)),
        sa.Column("post_url", sa.Text()), sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    for column in ("post_id", "scheduled_at", "provider_id"):
        op.create_index(f"ix_publications_{column}", "publications", [column])
    op.create_table("webhook_inbox", sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("payload", sa.JSON()), sa.Column("processed", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade():
    for name in ("webhook_inbox", "publications", "provider_accounts", "media_assets", "work_jobs"):
        op.drop_table(name)
    op.drop_column("users", "role_titles")
    op.drop_column("users", "permissions")
