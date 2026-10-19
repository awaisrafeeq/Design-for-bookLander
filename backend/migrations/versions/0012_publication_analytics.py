"""Store analytics for BookLender publications."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012_publication_analytics"
down_revision = "0011_brand_reference_idea_limits"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "publication_analytics",
        sa.Column("publication_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("publications.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("sync_status", sa.String(length=24), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("synced_at", sa.DateTime(timezone=True)),
        sa.Column("data_as_of", sa.DateTime(timezone=True)),
        sa.Column("error", sa.Text()),
    )
    op.create_index("ix_publication_analytics_published_at", "publication_analytics", ["published_at"])
    op.create_index("ix_publication_analytics_synced_at", "publication_analytics", ["synced_at"])
    op.create_table(
        "account_follower_analytics",
        sa.Column("account_id", sa.String(length=80), sa.ForeignKey("provider_accounts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("current_followers", sa.Integer()),
        sa.Column("history", sa.JSON(), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("account_follower_analytics")
    op.drop_index("ix_publication_analytics_synced_at", table_name="publication_analytics")
    op.drop_index("ix_publication_analytics_published_at", table_name="publication_analytics")
    op.drop_table("publication_analytics")
