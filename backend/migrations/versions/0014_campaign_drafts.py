"""Save campaign planning and review drafts."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0014_campaign_drafts"
down_revision = "0013_weekly_style_learning"
branch_labels = depends_on = None


def upgrade():
    op.create_table("campaign_drafts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("studio_posts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("post_version", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    for field in ("post_id", "platform", "status"):
        op.create_index(f"ix_campaign_drafts_{field}", "campaign_drafts", [field])
    op.execute("""UPDATE users SET module_access = (module_access::jsonb || '[\"Campaigns\"]'::jsonb)::json
               WHERE (role = 'admin' OR (role = 'campaigns_manager' AND module_access::jsonb ? 'Schedule')
                      OR (role = 'approver' AND module_access::jsonb ? 'Review'))
                 AND NOT (module_access::jsonb ? 'Campaigns')""")


def downgrade():
    op.drop_table("campaign_drafts")
