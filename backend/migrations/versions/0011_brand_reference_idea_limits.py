"""Persist brand reference and per-source idea backlog limits."""
from alembic import op
import sqlalchemy as sa

revision = "0011_brand_reference_idea_limits"
down_revision = "0010_catalogue_browse_index"
branch_labels = depends_on = None


def upgrade():
    op.add_column("brand_policy_versions", sa.Column("reference_post_id", sa.Integer(), nullable=True))
    op.add_column("brand_policy_versions", sa.Column("reference_note", sa.Text(), nullable=False, server_default=""))
    op.add_column("source_settings", sa.Column("idea_limit", sa.Integer(), nullable=False, server_default="5"))
    op.create_index("ix_media_assets_library_latest", "media_assets", ["created_at", "id"],
                    postgresql_where=sa.text("post_id IS NULL"))


def downgrade():
    op.drop_index("ix_media_assets_library_latest", table_name="media_assets")
    op.drop_column("source_settings", "idea_limit")
    op.drop_column("brand_policy_versions", "reference_note")
    op.drop_column("brand_policy_versions", "reference_post_id")
