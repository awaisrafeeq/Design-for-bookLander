"""Persist editorial posts and their version history."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0003_persistent_workflow"
down_revision: str | Sequence[str] | None = "0002_settings_team"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "studio_posts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("stage", sa.String(24), nullable=False, server_default="idea"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("version_history", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("approved_version", sa.Integer()),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("stage IN ('idea', 'selected', 'generating', 'review', 'revision', 'scheduled', 'published', 'archived')", name="ck_studio_posts_stage"),
    )
    op.create_index("ix_studio_posts_stage", "studio_posts", ["stage"])
    op.create_index("ix_studio_posts_updated_at", "studio_posts", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_studio_posts_updated_at", table_name="studio_posts")
    op.drop_index("ix_studio_posts_stage", table_name="studio_posts")
    op.drop_table("studio_posts")
