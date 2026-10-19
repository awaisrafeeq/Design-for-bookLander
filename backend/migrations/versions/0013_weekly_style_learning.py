"""Keep daily publication metric snapshots and reviewed weekly style learnings."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_weekly_style_learning"
down_revision = "0012_publication_analytics"
branch_labels = depends_on = None


def upgrade():
    op.add_column("publication_analytics", sa.Column("daily_history", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.create_table(
        "weekly_style_learning",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("week_end", sa.Date(), nullable=False),
        sa.Column("publication_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("publications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("studio_posts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform", sa.String(length=40), nullable=False),
        sa.Column("post_format", sa.String(length=24), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("guidance", sa.Text(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.UniqueConstraint("week_start", name="uq_weekly_style_learning_week_start"),
    )
    op.create_index("ix_weekly_style_learning_status", "weekly_style_learning", ["status"])


def downgrade():
    op.drop_index("ix_weekly_style_learning_status", table_name="weekly_style_learning")
    op.drop_table("weekly_style_learning")
    op.drop_column("publication_analytics", "daily_history")
